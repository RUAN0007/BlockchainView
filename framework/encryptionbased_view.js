'use strict';

// const fabricSupport = require("./FabricSupport.js");
const util = require('util');
// const ccUtil = require("./ccutil.js");
const crypto = require('crypto');
const cmgr = require('./crypto_mgr.js');

class EncryptionBasedView {
    constructor(fabric_support, revocable_mode) {
        console.log(`Create a encryption-based ${revocable_mode} view manager`);


        this.fabric_support = fabric_support;
        this.revocable_mode = revocable_mode;

        this.viewTxns = {}; // associate the viewName with a list of txnIDs
        this.txnKeys = {}; // associate the viewName with the view key
        this.viewKeys = {};
    }

    InvokeTxn(ccId, pub_args, confidentialPart, app_tid) { 
        var key = cmgr.CreateKey();
        console.log(util.format("\tGenerate a random key %s for this txn", key));

        var secretPayload = cmgr.Encrypt(key, confidentialPart); 
        console.log(util.format("\tUse the key to encode the confidential part %s into %s", confidentialPart, secretPayload));

        return this.fabric_support.InvokeTxnWithSecret(ccId, pub_args, secretPayload).then((txnId)=>{
            this.txnKeys[txnId] = key;
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
            var key = this.viewKeys[viewName];

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted txn key and serialize the association into a view msg with the key %s", key));
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(key, txnID)] = cmgr.Encrypt(key, this.txnKeys[txnID]);
            }

            let msg = JSON.stringify(encodedMsgView);
            console.log(util.format("\tUpload the encoded to a dedicated view_storage contract in the blockchain, appending to the view name. "))

            return this.fabric_support.AppendView(viewName, msg).then(()=>{
                return viewName;
            }).catch(err =>{
                // May raise MVCC conflict. Temporarily ignore. 
                // console.log("MVCC Conflict")
            });
        } else {
            return viewName;
        }
    }

    // return as a Buffer type
    DistributeView(viewName, userPubKey) {
        var distributedData = {};
        distributedData.viewName = viewName;
        distributedData.mode = this.revocable_mode;
        var viewKey;
        if (this.revocable_mode === "revocable" || this.revocable_mode === "incontract") {

            viewKey = cmgr.CreateKey();
            console.log(util.format("\tGenerate a random password %s. Use the password to encode each element of the view message.", viewKey)) 

            var txnIDs = this.viewTxns[viewName];
            if (txnIDs === undefined) {
                throw new Error("View " + viewName + " has not been created. ");
            }

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted txn key and serialize the association into a view message "))
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(viewKey, txnID)] = cmgr.Encrypt(viewKey, this.txnKeys[txnID]);
            }

            distributedData["viewData"] = JSON.stringify(encodedMsgView);
            console.log(util.format("\tDistribute the encoded view message "));

        } else if (this.revocable_mode === "irrevocable") { // Irrevocable
            var viewKey = this.viewKeys[viewName];
            if (viewKey === undefined) {
                throw new Error("View " + viewName + " has not been created. ");
            }
        } else {
            console.log(`Unsupported revocable mode ${this.revocable_mode}...`);
            process.exit(1);
        }

        console.log(util.format("\tDistribute the view key %s protected the provided public key ", viewKey))

        var encryptedKey = cmgr.PublicEncrypt(userPubKey, viewKey);
        distributedData.encryptedKey = encryptedKey;
        return distributedData;
    }

    OnReceive(distributedData, userPrvKey) {
        var viewKey = cmgr.PrivateDecrypt(userPrvKey, '', distributedData.encryptedKey);
        var viewName = distributedData.viewName;
        console.log(util.format("\tRecover the key of view %s to %s with the private key"), viewName, viewKey);

        return Promise.resolve().then(()=>{
            if (distributedData.mode === "revocable" || distributedData.mode === "incontract") {
                return distributedData.viewData;
            } else if (distributedData.mode === "irrevocable") {   
                console.log(util.format("\tFor irrevocable view management, pull the view data for %s from blockchains."), distributedData.viewName);
                return this.fabric_support.GetView(distributedData.viewName);
            } else {
                console.log(`Unsupported revocable mode ${distributedData.mode}...`);
                process.exit(1);
            }
        }).then((encryptedViewMsg)=>{

            encryptedViewMsg = JSON.parse(encryptedViewMsg);
            var txnIDs = [];
            var txnKeys = [];
            var promises = [];
            for (const encodedTxnID in encryptedViewMsg) {
                var txnID = cmgr.Decrypt(viewKey, encodedTxnID);
                var txnKey = cmgr.Decrypt(viewKey, encryptedViewMsg[encodedTxnID]);

                txnIDs.push(txnID);
                txnKeys.push(txnKey);
                // console.log(util.format("\tRecover Txn Key %s for Txn ID %s", txnKey, txnID));
                promises.push(this.fabric_support.GetSecretFromTxnId(txnID));
            }

            
            // Skip the validation step
            // console.log("\tView Spec for " + viewName);
            // return Promise.all(promises).then((secrets)=>{
            //     for (var i = 0; i < txnIDs.length; i++) {
            //         var txnID = txnIDs[i];
            //         var confidentialPart = cmgr.Decrypt(txnKeys[i], secrets[i]);
            //         console.log("Use the recovered txn key to decode the original confidential data.")
            //         console.log(util.format("\t\tTxnID: %s, The decoded Confidential Data: %s"), txnID, confidentialPart);
            //     }
            // });
        });
    }
}

module.exports.EncryptionBasedView = EncryptionBasedView;