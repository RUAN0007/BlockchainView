'use strict';

const readline = require('readline-sync');
const fabricSupport = require("./fabricsupport.js");
const hashbased_view = require("./hashbased_view.js");
const encryptionbased_view = require("./encryptionbased_view.js");
const util = require('util');
const crypto = require('crypto');

var view_manager;
// var revocable = true;
var revocable = false;


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

// The key pair for User U2. 
const pubKey = keyPair.publicKey;
const prvKey = keyPair.privateKey;

var userinput;
/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(()=>{
    var initArgs = {"network_dir": "viewnetwork",
    "channel_name":"viewchannel", "org_id": 1};
    var fabric_support = new fabricSupport.FabricSupport(initArgs);
    return fabric_support.InitNetwork();
}).then((fabric_support)=>{
    var confidentialPart = "SECRET_PAYLOAD_RPC";
    console.log("===============================================");
    view_manager = new hashbased_view.HashBasedView(fabric_support, revocable); 
    // view_manager = new encryptionbased_view.EncryptionBasedView(fabric_support, revocable); 
    console.log("===============================================");
    const ccName = "secretcontract";
    console.log("1. A view owner prepares a txn to invoke Contract " + ccName + " with confidential part " + confidentialPart);
    return view_manager.InvokeTxn(ccName, confidentialPart);
}).then((txnID)=>{
    userinput = readline.question(`\nCONTINUE?\n`);

    var viewName = "DEMO_VIEW";
    console.log("===============================================");
    console.log("2. The view owner prepares a view named " + viewName + " consisting of the above txn only");
    return view_manager.CreateView(viewName, [txnID]);
}).then((viewName)=>{
    userinput = readline.question(`\nCONTINUE?\n`);
    console.log("===============================================");
    console.log("3. The view owner distributes view " + viewName + " to a user identified by its public key.");
    return view_manager.DistributeView(viewName, pubKey);
}).then((distributedData)=>{
    userinput = readline.question(`\nCONTINUE?\n`);
    console.log("===============================================");
    console.log("4. The view user receives the view data from the view owner.");
    return view_manager.OnReceive(distributedData, prvKey);
}).then(()=>{
    console.log("===============================================");
    userinput = readline.question(`\nCONTINUE?\n`);
    console.log("END.");
}).catch((err)=>{
    console.error(`Encounter error: ${err.stack}`);
    // throw new Error("Invocation fails with err msg: " + err.message);
});