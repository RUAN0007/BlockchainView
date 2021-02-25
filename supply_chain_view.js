'use strict';
const fabricSupport = require("./fabricsupport.js");
const hashbased_view = require("./hashbased_view.js");
const encryptionbased_view = require("./encryptionbased_view.js");
const readline = require('readline-sync');


const fs = require('fs');

var viewInfoPath = process.argv[2];
var mode = "encryption";

if (process.argv[3] === "hash") {
    mode = "hash";
}
// var revocable = true;
var revocable = false;
if (process.argv[4] === "revocable") {
    revocable = true
}


let viewInfo = JSON.parse(fs.readFileSync(viewInfoPath));

var view_manager;

var confidentialPart = "SECRET_PAYLOAD";
var start;
var invocationCount = 0;
var tid2TxnId = {};
const ccName = "secretcontract";
var app_txn_count = 0;
var batch = 0;

/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": "viewnetwork2",
    "channel_name":"viewchannel", "org_id": 1};
    var fabric_support = new fabricSupport.FabricSupport(initArgs);
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    if (mode == "hash") {
        view_manager = new hashbased_view.HashBasedView(fabric_support, revocable); 
    } else {
        view_manager = new encryptionbased_view.EncryptionBasedView(fabric_support, revocable); 
    }
    var view_creation_promises = [];
    console.log("===============================================");
    let viewCount = viewInfo["views"].length;
    console.log("Create " + viewCount + " views. ");
    for (var i = 0; i < viewCount; i++) {
        var viewName = viewInfo["views"][i];
        view_creation_promises.push(view_manager.CreateView(viewName, []));
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

        var request_promises = [];
        for (var i = 0; i < operation_count; i++) {
            // console.log("===============================================");
            // console.log("A view owner prepares Txn " + operation["tid"] + "(tid) to invoke Contract " + ccName + " with confidential part " + confidentialPart);
            // invocationCount += 1;

            var req_promise = view_manager.InvokeTxn(ccName, confidentialPart, blkOps[i]).then((result)=>{
                var txnID = result[0];
                var operation = result[1];
                var app_tid = operation["tid"];
                tid2TxnId[app_tid] = txnID;
                console.log(`App Tid = ${app_tid} for txnID = ${txnID}`);

                var numViews = operation["views"].length;
                // invocationCount += numViews;
                var view2Txns = {};
                for (var ii = 0; ii < numViews; ii++) {
                    let tid = operation["views"][ii]["tid"];
                    let txnID = tid2TxnId[tid];
                    let viewName = operation["views"][ii]["name"];

                    if (viewName in view2Txns) {
                        view2Txns[viewName].push(txnID);
                    } else {
                        view2Txns[viewName] = [txnID];
                    }

                }

                var view_append_promises = [];
                for (var viewName in view2Txns) {
                    console.log(`View ${viewName} is appended with txns [${view2Txns[viewName]}]. `)
                    view_append_promises.push(view_manager.AppendView(viewName, view2Txns[viewName]).catch(err =>{
                        // May raise MVCC conflict. Temporarily ignore. 
                        // console.log("MVCC Conflict")
                    }));
                }
                return Promise.all(view_append_promises);
            });
            request_promises.push(req_promise);
        }
        await Promise.all(request_promises);

    },  Promise.resolve());
}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
})
.finally(()=>{
    let elapsed = new Date() - start;
    console.log(`Total Duration (ms): ${elapsed},  # of app txn:  ${app_txn_count}, # of batches ${batch}`);
    process.exit(0)
})
;