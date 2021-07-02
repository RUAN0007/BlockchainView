'use strict';
const fabricSupport = require("./fabricsupport.js");
const hashbased_view = require("./hashbased_view.js");
const encryptionbased_view = require("./encryptionbased_view.js");
const readline = require('readline-sync');
const crypto = require('crypto');

const keyPair = crypto.generateKeyPairSync('rsa', { 
    modulusLength: 520, 
    publicKeyEncoding: { 
        type: 'spki', 
        format: 'pem'
    }, 
    privateKeyEncoding: { 
    type: 'pkcs8', 
    format: 'pem', 
    cipher: 'aes-256-cbc', 
    passphrase: ''
    } 
}); 


const fs = require('fs');
const { SSL_OP_EPHEMERAL_RSA } = require("constants");

var mode = "encryption";

if (process.argv[2] === "hash") {
    mode = "hash";
}
// var revocable = true;
var revocable_mode = process.argv[3];// incontract/revocable/irrevocable
var txn_count = parseInt(process.argv[4])
var batch_size = parseInt(process.argv[5])
var batch_count = txn_count / batch_size;

var view_manager;

var confidentialPart = "SECRET_PAYLOAD";
var start;
var ccName;

var app_txn_count = 0;
var batch = 0;
var batch_elasped_sum = 0;

var query_start;
var query_end;

var committed_txn_count = 0;
var all_views = [];
var view_name = "V0";

/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": "viewnetwork2",
    "channel_name":"viewchannel", "org_id": 1, 
    "view_merge_sec": 1000 // view_merge_sec only applies to inchaincontract
    };
    var fabric_support;
    if (revocable_mode === "incontract") {
        ccName = "onchainview";
        fabric_support = new fabricSupport.NewFabricSupport(initArgs);
    } else {
        ccName = "secretcontract";
        fabric_support = new fabricSupport.FabricSupport(initArgs);
    }
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    if (mode == "hash") {
        view_manager = new hashbased_view.HashBasedView(fabric_support, revocable_mode); 
    } else {
        view_manager = new encryptionbased_view.EncryptionBasedView(fabric_support, revocable_mode); 
    }
    var view_creation_promises = [];
    var view_count = 1;

    view_creation_promises.push(view_manager.CreateView(view_name, []));
    all_views.push(view_name);

    return Promise.all(view_creation_promises);

}).then((viewNames)=>{
    start = new Date();
    var batch_ids = [];
    console.log(`# of batches = ${batch_count}`);
    for (var i = 0; i < batch_count; i++) {
        batch_ids.push(i);
    }

    return batch_ids.reduce( async (previousPromise, batch_id) => {
        await previousPromise;
        console.log(`Prepare to batch request ${batch_size} in batch ${batch_id}`);
        // userinput = readline.question(`\nCONTINUE?\n`);

        var batch_start = new Date();
        var request_promises = [];
        for (var i = 0; i < batch_size; i++) {
            var pub_args = "ALL"; // contract will include this txn to all views.
            // console.log(`view_manager.InvokeTxn(${ccName}, ${pub_args}, ${confidentialPart}`);
            var req_promise = view_manager.InvokeTxn(ccName, pub_args, confidentialPart, "useless_req_id");
            app_txn_count+=1;
            request_promises.push(req_promise);
        }
        await Promise.all(request_promises).then((txn_statuses)=>{
            let committed_txn_ids = [];
            for (var i in txn_statuses) {
                if (txn_statuses[i][0] != "") {
                } else {
                    committed_txn_ids.push(txn_statuses[i][1]);
                    committed_txn_count+=1;
                }
            }

            let batch_elapsed = new Date() - batch_start;
            batch_elasped_sum += batch_elapsed;
            return view_manager.AppendView(view_name, committed_txn_ids);
        });
    },  Promise.resolve());
}).then((_)=>{
    var wait_ms = 5000;
    console.log(`wait for ${wait_ms} before query`);
    return new Promise(resolve => setTimeout(resolve, wait_ms));
}).then((_)=>{
    query_start = new Date();
    return view_manager.DistributeView(view_name, keyPair.publicKey);
}).then((distributedData)=>{
    return view_manager.OnReceive(distributedData, keyPair.privateKey);
}).catch((err)=>{
    console.log("Invocation/Query fails with err msg: " + err.stack);
})
.finally(()=>{
    let elapsed = new Date() - start;
    let avg_batch_delay = Math.floor(batch_elasped_sum / batch_count);
    // console.log(`Committed Txn Count : ${committed_txn_count}, Rejected Txn Count: ${rejected_txn_count}`);
    console.log(`Load Duration (ms): ${elapsed} ,  # of app txn:  ${app_txn_count} , Committed Txn Count: ${committed_txn_count} , avg batch delay (ms): ${avg_batch_delay} # of batches ${batch}`);

    query_end = new Date();
    let query_duration = query_end - query_start;
    console.log(`Query Delay on ${view_name} with ${committed_txn_count} txns : ${query_duration} ms`);
    process.exit(0)
})
;