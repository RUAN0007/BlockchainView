'use strict';
const fabricSupport = require("./fabricsupport.js");
const hashbased_view = require("./hashbased_view.js");
const noop_view = require("./noop_view.js");
const encryptionbased_view = require("./encryptionbased_view.js");
const { BlockDecoder } = require('fabric-common');
const readline = require('readline-sync');

var mode = process.argv[2];
var revocable_mode = process.argv[3];
var txn_count = parseInt(process.argv[4]);

var network_dir = "viewnetwork2";
if (process.argv[5] !== undefined) {
    network_dir = process.argv[5];
}

var channel_name = "viewchannel";
if (process.argv[6] !== undefined) {
    channel_name = process.argv[6];
}

var ccName = "onchainview";
if (process.argv[7] !== undefined) {
    ccName = process.argv[7];
}

var confidentialPart = "SECRET_PAYLOAD";
var fabric_support;
var view_manager;
var committed_txn_count = 0;
var rejected_txn_count = 0;
var single_view_name = "SingleView";

var txn_scan_start;
var txn_scan_batch_count;

var txn_query_ms = 0;
var txn_verify_ms = 0;

const txn_scan_batch_size = 50;
const txn_load_batch_size = 50;

/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": network_dir,
    "channel_name":channel_name, "org_id": 1, "cc_viewincontract_name": ccName};
    // var fabric_support = new fabricSupport.FabricSupport(initArgs);
    if (revocable_mode === "incontract") {
        fabric_support = new fabricSupport.NewFabricSupport(initArgs);
    } else {
        console.log("Only support incontract blockchain now...");
        process.exit(1)
    }
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    if (mode == "hash") {
        view_manager = new hashbased_view.HashBasedView(fabric_support, revocable_mode); 
    } else if (mode == "encryption") {
        view_manager = new encryptionbased_view.EncryptionBasedView(fabric_support, revocable_mode); 
    } else {
        console.log(`Unrecognized mode ${mode}`);
        process.exit(1);
    }
    return view_manager.CreateView(single_view_name, []);
}).then((_)=>{
    var batch_count = txn_count / txn_load_batch_size;
    var batch_ids = [];
    for (var i = 0; i < batch_count; i++) {
        batch_ids.push(i);
    }

    console.log(`# of batches = ${batch_count}`);

    return batch_ids.reduce( async (previousPromise, batch_id) => {
        await previousPromise;
        console.log(`sending batch ${batch_id}`);
        var request_promises = [];
        var pub_args = single_view_name; // since onChainView use pub_args to determine views. 
        for (var i = 0; i < txn_load_batch_size; i++) {
            request_promises.push(req_promise);
            var req_promise = view_manager.InvokeTxn(ccName, pub_args, confidentialPart, 0);
        }

        await Promise.all(request_promises).then((txn_statuses)=>{
            for (var i in txn_statuses) {
                // console.log(txn_statuses[i]);
                // if (txn_statuses[i][0] != "") {
                //     rejected_txn_count+=1;
                // } else {
                    committed_txn_count+=1;
                // }
            }
        });

    },  Promise.resolve());
}).then(()=>{
    console.log(`Finish loading a view with ${committed_txn_count} committed transactions, ${rejected_txn_count} aborts`);
    txn_scan_start = new Date();
    return fabric_support.GetView(single_view_name);
}).then((txn_ids)=>{
    var txn_count = txn_ids.length;
    console.log("=========================================================");
    console.log(`# of txns in view: ${txn_count}`);
    console.log("=========================================================");
    txn_scan_batch_count = txn_count / txn_scan_batch_size;
    var txn_scan_batch_ids = [];
    for (var i = 0; i < txn_scan_batch_count; i++) {
        txn_scan_batch_ids.push(i);
    }

    return txn_scan_batch_ids.reduce( async (previousPromise, batch_id) => {
        await previousPromise;
        // console.log(`Scan txn batch ${batch_id}`);
        var query_start = new Date();
        var request_promises = [];
        for (var i = 0; i < txn_scan_batch_size; i++) {
            let txn_id = txn_ids[batch_id * txn_scan_batch_size + i];
            request_promises.push(fabric_support.GetTxnById(txn_id));
        }

        await Promise.all(request_promises).then((bytes_of_txns)=>{
            var query_end = new Date();
            txn_query_ms += query_end - query_start;

            var verify_start = query_end;
            for (var i = 0; i < bytes_of_txns.length; i++) {
                var txn = BlockDecoder.decodeTransaction(bytes_of_txns[i]);
                fabric_support.InspectTxnRW(txn.transactionEnvelope.payload.data);
                // console.log(`Batch ${batch_id} Txn ${i} ${txn}`);
            }
            var verify_end = new Date();
            txn_verify_ms += verify_end - verify_start;

        }).catch((error)=>{
            console.log(`Fail to get txn ID ${error}`);
        });

    },  Promise.resolve());

}).then(()=>{
    let txn_scan_elapse = new Date() - txn_scan_start;
    console.log(`Scan ${txn_scan_batch_count} ${txn_scan_batch_size}-batch transactions in ${txn_scan_elapse} ms ( remote query in ${txn_query_ms} ms, verify in ${txn_verify_ms} ms ) `);
    // Measure Block Query and Verification here. 
    return fabric_support.MeasureScanLedger();
}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
})
.finally(()=>{

})
;