'use strict';
const fabricSupport = require("./fabricsupport.js");
const hashbased_view = require("./hashbased_view.js");
const noop_view = require("./noop_view.js");
const encryptionbased_view = require("./encryptionbased_view.js");
const readline = require('readline-sync');


const fs = require('fs');
const { exit } = require("process");

var viewInfoPath = process.argv[2];
var mode = process.argv[3];

// var mode = "encryption";
// if (process.argv[3] === "hash") {
//     mode = "hash";
// }
// var revocable = true;
var revocable_mode = process.argv[4];


let viewInfo = JSON.parse(fs.readFileSync(viewInfoPath));

var view_manager;

var confidentialPart = "SECRET_PAYLOAD";
var start;
var invocationCount = 0;
var tid2TxnId = {};
const ccName = "onchainview";
var app_txn_count = 0;
var batch = 0;
var batch_elasped_sum = 0;

var logical2PhysicalViews = {};
var committed_txn_count = 0;
var rejected_txn_count = 0;

/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": "viewnetwork2",
    "channel_name":"viewchannel", "org_id": 1};
    // var fabric_support = new fabricSupport.FabricSupport(initArgs);
    var fabric_support;
    if (revocable_mode === "incontract") {
        fabric_support = new fabricSupport.NewFabricSupport(initArgs);
    } else if (revocable_mode === "fake_blockchain") {
        fabric_support = new fabricSupport.FakeFabricSupport(initArgs);
    } else {
        console.log("Only support incontract/fake blockchain now...");
        process.exit(1)
    }
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    if (mode == "hash") {
        view_manager = new hashbased_view.HashBasedView(fabric_support, revocable_mode); 
    } else if (mode == "encryption") {
        view_manager = new encryptionbased_view.EncryptionBasedView(fabric_support, revocable_mode); 
    } else if (mode == "noop") {
        view_manager = new noop_view.NoopView(fabric_support, revocable_mode); 
    } else {
        console.log(`Unrecognized mode ${mode}`);
        process.exit(1);
    }
    var view_creation_promises = [];
    console.log("===============================================");
    var logicalViewCount = viewInfo["views"].length;
    var physicalViewCount = logicalViewCount; 
    if (process.argv[5] !== undefined) {
        physicalViewCount = parseInt(process.argv[5]);
    }

    console.log(`Create ${physicalViewCount} views for ${logicalViewCount} ones. `);
    for (var i = 0; i < physicalViewCount; i++) {
        // var viewName = viewInfo["views"][i];
        view_creation_promises.push(view_manager.CreateView("PhysicalView"+i, []));
    }


    for (var i = 0; i < logicalViewCount; i++) {
        var logicalViewName = viewInfo["views"][i];
        var id = "" + i % physicalViewCount;
        var physicalViewName =  "PhysicalView"+ id;
        // Must be identical to the above physical view name
        logical2PhysicalViews[logicalViewName] = physicalViewName;
        console.log(`  Logical View ${logicalViewName} to PhysicalView ${physicalViewName}`);
    }

    return Promise.all(view_creation_promises);

}).then((viewNames)=>{
    start = new Date();
    var blksOps = viewInfo["blocks"];
    console.log(`# of blks = ${blksOps.length}`);

    return blksOps.reduce( async (previousPromise, blkOps) => {
        await previousPromise;
        batch++;
        var operation_count = blkOps.length;
        app_txn_count += operation_count;
        console.log(`Prepare to batch request ${operation_count} in batch ${batch}`);
        // userinput = readline.question(`\nCONTINUE?\n`);

        var batch_start = new Date();
        var request_promises = [];
        for (var i = 0; i < operation_count; i++) {
            // console.log("===============================================");
            // console.log("A view owner prepares Txn " + operation["tid"] + "(tid) to invoke Contract " + ccName + " with confidential part " + confidentialPart);
            // invocationCount += 1;

            var operation = blkOps[i];
            var tid = operation["tid"];
            var logicalViewCount = operation["views"].length;
            var involved_phyical_views = [];
            for (var ii = 0; ii < logicalViewCount; ii++) {
                if (operation["views"][ii]["tid"] != tid) { continue; }
                var logical_view_name = operation["views"][ii]["name"];
                var physical_view_name = logical2PhysicalViews[logical_view_name];
                involved_phyical_views.push(physical_view_name);
            }
            var pub_args = involved_phyical_views.join("_");

            var req_promise = view_manager.InvokeTxn(ccName, pub_args, confidentialPart, blkOps[i]);
            request_promises.push(req_promise);
        }
        await Promise.all(request_promises).then((txn_statuses)=>{

            for (var i in txn_statuses) {
                if (txn_statuses[i][0] != "") {
                    rejected_txn_count+=1;
                } else {
                    committed_txn_count+=1;
                }
            }

            let batch_elapsed = new Date() - batch_start;
            batch_elasped_sum += batch_elapsed;
        });

    },  Promise.resolve());
}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
})
.finally(()=>{
    let elapsed = new Date() - start;
    let avg_batch_delay = Math.floor(batch_elasped_sum / batch);
    // console.log(`Committed Txn Count : ${committed_txn_count}, Rejected Txn Count: ${rejected_txn_count}`);
    console.log(`Total Duration (ms): ${elapsed} ,  # of app txn:  ${app_txn_count} , Committed Txn Count: ${committed_txn_count} , avg batch delay (ms): ${avg_batch_delay} # of batches ${batch}`);
    process.exit(0)
})
;