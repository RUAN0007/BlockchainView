'use strict';
const crossChain = require("./crosschain.js");

const fs = require('fs');


const ccName = "secretcontract";
var args = ["RPC"];

var start;
var viewInfoPath = process.argv[2];
let viewInfo = JSON.parse(fs.readFileSync(viewInfoPath));

var invocationCount = 0;
var app_txn_count = 0;

Promise.resolve().then(()=>{
    var cross_chain_handler = new crossChain.CrossChain({"network_dirs": ["viewnetwork2"],
    "channel_names":["viewchannel"], "org_ids": [1]});
    return cross_chain_handler.InitNetwork();
}).then((cross_chain_handler)=>{

    start = new Date();
    var blksOps = viewInfo["blocks"];
    var batch = 0;
    return blksOps.reduce( async (previousPromise, blkOps) => {
        await previousPromise;
        batch++;
        var operation_count = blkOps.length;
        app_txn_count += operation_count;
        console.log(`Batch ${batch} has ${operation_count} operations`);
        var req_promises = [];
        for (var i=0; i < operation_count; i++) {
            var operation = blkOps[i];
            var numChain = operation["views"].length;
            var tid = operation.tid;
            console.log(`Invoke Txn (tid=${tid}) under ${numChain} chains. `);

        //     invocationCount += 1;
        //     invocationCount += numChain + numChain;
            
            var channels = [];
            // Assume currently one physical channel
            for (var ii = 0; ii < numChain; ii++) {
                channels.push("viewchannel");
            }
            req_promises.push(cross_chain_handler.CrossChainCommit(channels, tid, "SECRET_PAYLOAD"));
        }
        // console.log(`# of req promises = ${req_promises.length}`);
        return Promise.all(req_promises);

    }, Promise.resolve());
}).catch((err)=>{
    console.error("Invocation fails with err msg: " + err.stack);
    process.exit(1);
}).finally(()=>{
    let elapsed = new Date() - start;
    console.log("Total Duration for cross-chain invocation on ledgers (ms): ", elapsed, "# of app txns: ", app_txn_count);
    process.exit(0)
});