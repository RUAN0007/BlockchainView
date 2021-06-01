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
    view_name = "lessthan10";
    return fabric_support.SendTxn("onchainview", "CreateView", [view_name, "< 10"]);
}).then(()=>{
    console.log(`Create view ${view_name}`);
    userinput = readline.question(`\nCONTINUE?\n`);

    view_name = "greaterthan20"; // u1 
    return fabric_support.SendTxn("onchainview", "CreateView", [view_name, "> 20"]);
}).then(()=>{
    console.log(`Create view ${view_name}`);
    userinput = readline.question(`\nCONTINUE?\n`);

    pub_arg = "8";
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]); // t1
}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nCONTINUE?\n`);
    pub_arg = "15"; // t2
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]);  // lessthan20->[t1, t2] lessthan10->[t1]
 
}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nCONTINUE?\n`);
    pub_arg = "25";
    return fabric_support.SendTxn("onchainview", "InvokeTxn", [pub_arg, fake_secret_data]); // t3

}).then((txnId)=>{
    console.log(`Finish Txn ${txnId} with the public arg ${pub_arg}`);

    userinput = readline.question(`\nCONTINUE?\n`);
    queried_view_name = "lessthan10";
    return fabric_support.Query("onchainview", "RetrieveTxnIdsByView", [queried_view_name]); // [t1]
}).then((txnIds)=>{
    console.log(`View ${queried_view_name} include txnIDs ${txnIds}`);
    userinput = readline.question(`\nCONTINUE?\n`);

    queried_view_name = "greaterthan20";
    return fabric_support.Query("onchainview", "RetrieveTxnIdsByView", [queried_view_name]); // [t3]
}).then((txnIds)=>{
    console.log(`View ${queried_view_name} include txnIDs ${txnIds}`);
    userinput = readline.question(`\nCONTINUE?\n`);

}).catch((err)=>{
    console.log("Invocation fails with err msg: " + err.stack);
})
.finally(()=>{
    console.log("END.");
    process.exit(0)
})
;