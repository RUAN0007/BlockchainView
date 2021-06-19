'use strict';
const fabricSupport = require("./fabricsupport.js");
const readline = require('readline-sync');

const fs = require('fs');
let fabric_support;
let fake_secret_data = "hash or encrypted";
let pub_arg;
let queried_view_name;
let view_name;
let userinput;
/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": "viewnetwork2",
    "channel_name":"viewchannel", "org_id": 1};
    fabric_support = new fabricSupport.FabricSupport(initArgs);
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    view_name = "ViewA";
    return fabric_support.SendTxn("onchainview", "CreateView", [view_name, "ViewA", "5"]);
}).then(()=>{
    console.log(`Create view ${view_name}`);
    userinput = readline.question(`\nCONTINUE?\n`);

    view_name = "ViewB"; // u1 
    return fabric_support.SendTxn("onchainview", "CreateView", [view_name, "ViewB", "5"]);
}).then(()=>{
    console.log(`Create view ${view_name}`);
    userinput = readline.question(`\nCONTINUE to invoke Txn?\n`);

    pub_arg = "ViewA";
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]); // t1
}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nWait for > 5s to CONTINUE?\n`);
    pub_arg = "ViewA"; // t2
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]);
 
}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nWait for 3s to CONTINUE?\n`);
    pub_arg = "ViewA";
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]); // t3

}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nWait for 3s to CONTINUE query?\n`);
    queried_view_name = "ViewA";
    return fabric_support.Query("onchainview", "RetrieveTxnIdsByView", [queried_view_name]); // [t1]

}).then((txnIds)=>{
    console.log(`View ${queried_view_name} include txnIDs ${txnIds}`);

    userinput = readline.question(`\nWait for > 5s to CONTINUE?\n`);
    pub_arg = "ViewA"; // t2
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]);
    
}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nWait for 3s to CONTINUE query?\n`);
    queried_view_name = "ViewA";
    return fabric_support.Query("onchainview", "RetrieveTxnIdsByView", [queried_view_name]); // [t1]

}).then((txnIds)=>{
    console.log(`View ${queried_view_name} include txnIDs ${txnIds}`);

}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
}).finally(()=>{
    console.log("END.");
    process.exit(0)
})
;