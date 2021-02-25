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
    var cross_chain_handler = new crossChain.CrossChain({"network_dirs": ["viewnetwork"],
    "channel_names":["viewchannel"], "org_ids": [1]});
    return cross_chain_handler.InitNetwork();
}).then((cross_chain_handler)=>{

    start = new Date();
    var operations = viewInfo["operations"];

    return operations.reduce( async (previousPromise, operation) => {
        await previousPromise;
        var numChains = {};

        for (var i = 0; i < operation["views"].length; i++) {
            var viewName = operation["views"][i]["name"];
            var tid = operation["views"][i]["tid"];
            if (!(tid in numChains)) {
                numChains[tid] = 0;
            }

            if (viewName in relevantViews) {
                numChains[tid]++;
            }
        }
        console.log(`Insert tid=${tid}`);
        for (var tid in numChains) {
            var numChain = numChains[tid];
            console.log(`\tInvoke Txn (tid=${tid}) under ${numChain} chains. `);
            
            var channels = [];
            // Assume currently one physical channel
            for (var i = 0; i < numChain; i++) {
                channels.push("viewchannel");
            }
            await cross_chain_handler.CrossChainCommit(channels, tid, confidentialPart);
        }


    }, Promise.resolve());
}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.message);
}).finally(()=>{
    let elapsed = new Date() - start;
    console.log("Total Duration for cross-chain invocation on ledgers (ms): ", elapsed, "# of invocations: ", invocationCount);
    process.exit(0)
});