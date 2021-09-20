'use strict';

// const fabricSupport = require("./FabricSupport.js");
const util = require('util');
// const ccUtil = require("./ccutil.js");
const crypto = require('crypto');
const cmgr = require('./crypto_mgr.js');

class NoopView {
    constructor(fabric_support, revocable_mode) {
        console.log(`Create a noop ${revocable_mode} view manager`);

        this.fabric_support = fabric_support;
        this.revocable_mode = revocable_mode;

        this.viewTxns = {}; // associate the viewName with a list of txnIDs
        this.txnKeys = {}; // associate the viewName with the view key
        this.viewKeys = {};
    }

    InvokeTxn(ccId, pub_args, confidentialPart, app_tid) { 
        var secretPayload = "SECRET_PAYLOAD.................";

        return this.fabric_support.InvokeTxnWithSecret(ccId, pub_args, secretPayload).then((txnId)=>{
            this.txnKeys[txnId] = "randomkey";
            console.log(util.format("\tSend a txn %s to invoke %s with the encoded as the secret part %s. ", txnId, ccId, secretPayload))
            return ["", txnId, app_tid];
        })
        .catch(error => {
            // console.log(`Error with code ${error.transactionCode}`);
            // probably due to MVCC
            return [error.transactionCode, "", app_tid];
        })
        ;
    }


    CreateView(viewName, txnIDs) {
        this.viewTxns[viewName] = txnIDs;
        console.log(util.format("\tAssociate view %s with txn IDs", viewName, txnIDs));
        if (this.revocable_mode === "irrevocable" || this.revocable_mode === "incontract") {  // Irrevocable

            let key = cmgr.CreateKey();
            console.log(util.format("\tGenerate a random password %s. Use the password to encode each element of the view message.", key))  
            this.viewKeys[viewName] = key;

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted txn key and serialize the association into a view msg "))
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(key, txnID)] = cmgr.Encrypt(key, this.txnKeys[txnID]);
            }

            let msg = JSON.stringify(encodedMsgView);
            console.log(util.format("\tUpload the encoded to a dedicated view_storage contract in the blockchain, with the association to the view name. "))

            return this.fabric_support.CreateView(viewName, msg).then(()=>{
                return viewName;
            });
        } else {
            return viewName;
        }
    }

    // RetrieveLedgerHeight() {
    //     return this.fabric_support.RetrieveLedgerHeight();
    // }

    AppendView(viewName, txnIDs) {
        this.viewTxns[viewName].push(...txnIDs);
        console.log(util.format("\tAppend view %s with txn IDs", viewName, txnIDs));
        if (this.revocable_mode === "irrevocable") {  // Irrevocable
            console.log("Not implemented...");
        } else {
            return viewName;
        }
    }

    // return as a Buffer type
    DistributeView(viewName, userPubKey) {
        console.log("Not implemented...");
        process.exit(1);
    }

    OnReceive(distributedData, userPrvKey) {
        console.log("Not implemented...");
        process.exit(1);
    }
}

module.exports.NoopView = NoopView;