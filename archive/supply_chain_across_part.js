'use strict';
const crossChain = require("./crosschain.js");

const fs = require('fs');


const ccName = "secretcontract";
var args = ["RPC"];

var start;
var viewInfoPath = process.argv[2];
let viewInfo = JSON.parse(fs.readFileSync(viewInfoPath));
// Devide views into ${nodeCount} nodes.
// Only consider for view operation for views in ${nodeNum}'th node. 
var nodeCount = parseInt(process.argv[3]);
var nodeNum = parseInt(process.argv[4]);

let viewCount = viewInfo["views"].length;
let viewCountPerNode = Math.floor(viewCount / nodeCount);
let startIdx = nodeNum * viewCountPerNode;
let viewCountThisNode = viewCountPerNode;
if (startIdx === nodeNum-1) {
    // The last group has some trailing views, 
    //   which makes it greater than viewThisNode
    viewCountThisNode += viewInfo["views"].length % nodeCount
}

let relevantViews = {};
let relevantViewArray = [];
for (var i = startIdx; i < startIdx + viewCountThisNode; i++) {
    let selected = viewInfo["views"][i];
    relevantViews[selected] = true;
    relevantViewArray.push(selected);
}
console.log(`StartIdx=${startIdx}, ViewCountThisNode=${viewCountThisNode}, RelevantViews=[${relevantViewArray}]`);

var invocationCount = 0;
var confidentialPart = "SECRET_PAYLOAD";

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

        console.log(`Batch ${batch} has ${operation_count} operations`);
        var req_promises = [];
        for (var i=0; i < operation_count; i++) {
            var operation = blkOps[i];
            var numChains = {};

            for (var ii = 0; ii < operation["views"].length; ii++) {
                var viewName = operation["views"][ii]["name"];
                var tid = operation["views"][ii]["tid"];
                if (!(tid in numChains)) {
                    numChains[tid] = 0;
                }

                if (viewName in relevantViews) {
                    numChains[tid]++;
                }
            }
            // console.log(`Insert tid=${tid}`);
            for (var tid in numChains) {
                // var numChain = numChains[tid];
                // The previous numChain is wrong:
                //   each blockchain network simulates as a shard, and shall have a single prepare/commit request. 
                var numChain = 1;
                // console.log(`\tInvoke Txn (tid=${tid}) under ${numChain} chains. `);
                
                var channels = [];
                // Assume currently one physical channel
                for (var j = 0; j < numChain; j++) {
                    channels.push("viewchannel");
                }
                var req_promise = cross_chain_handler.CrossChainCommit(channels, tid, confidentialPart);
                req_promises.push(req_promise);
            }
        }
        // console.log(`# of req promises = ${req_promises.length}`);
        return Promise.all(req_promises);

    }, Promise.resolve());

    // var operations = viewInfo["operations"];

    // return operations.reduce( async (previousPromise, operation) => {
    //     await previousPromise;
    //     var numChains = {};

    //     for (var i = 0; i < operation["views"].length; i++) {
    //         var viewName = operation["views"][i]["name"];
    //         var tid = operation["views"][i]["tid"];
    //         if (!(tid in numChains)) {
    //             numChains[tid] = 0;
    //         }

    //         if (viewName in relevantViews) {
    //             numChains[tid]++;
    //         }
    //     }
    //     console.log(`Insert tid=${tid}`);
    //     for (var tid in numChains) {
    //         var numChain = numChains[tid];
    //         console.log(`\tInvoke Txn (tid=${tid}) under ${numChain} chains. `);
            
    //         var channels = [];
    //         // Assume currently one physical channel
    //         for (var i = 0; i < numChain; i++) {
    //             channels.push("viewchannel");
    //         }
    //         await cross_chain_handler.CrossChainCommit(channels, tid, confidentialPart);
    //     }


    // }, Promise.resolve());
}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
    process.exit(1);
}).finally(()=>{
    console.log("Finish");
    process.exit(0)
});