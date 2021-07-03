'use strict';

// const fabricSupport = require("./FabricSupport.js");
const util = require('util');

const cmgr = require('./crypto_mgr.js');

class HashBasedView {
    constructor(fabric_support, revocable_mode) {
        console.log(`Create a hash-based ${revocable_mode} view manager`);

        this.fabric_support = fabric_support;
        this.revocable_mode = revocable_mode;

        this.txnConfidential = {};
        this.viewTxns = {}; // associate the viewName with a list of txnIDs
        this.viewKeys = {}; // associate the viewName with the view key
        this.txnSalt = {}; // from TxnID to its salt
    }

    InvokeTxn(ccId, pub_args, confidentialPart, app_tid) { 
        var salt = cmgr.CreateSalt();
        console.log(`\tCreate a random salt ${salt}`);
        var secretPayload = cmgr.HashOp(confidentialPart + salt);
        console.log(util.format("\tHash the confidential part into %s ", secretPayload))
        return this.fabric_support.InvokeTxnWithSecret(ccId, pub_args, secretPayload).then((txnId)=>{
            this.txnConfidential[txnId] = confidentialPart;
            this.txnSalt[txnId] = salt;
            console.log(util.format("\tSend a txn %s to invoke %s with %s as the secret part. ", txnId, ccId, secretPayload))
            return ["", txnId, app_tid];
        })
        .catch(error => {
            // console.log(`Error with code ${error.transactionCode}`);
            return [error.transactionCode, "", app_tid];
        })
        ;;
    }


    CreateView(viewName, txnIDs) {
        this.viewTxns[viewName] = txnIDs;
        console.log(util.format("\tAssociate view %s with txn IDs", viewName, txnIDs));
        if (this.revocable_mode === "irrevocable" || this.revocable_mode === "incontract") {  // Irrevocable
            var key = cmgr.CreateKey();
            console.log(util.format("\tGenerate a random password %s. Use the password to encode each element of the view message.", key))  
            this.viewKeys[viewName] = key;

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted confidential part and serialize the association into a view msg "))
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(key, txnID)] = {
                    "cipher": cmgr.Encrypt(key, this.txnConfidential[txnID]),
                    "salt": this.txnSalt[txnID]
                };
            }

            let msg = JSON.stringify(encodedMsgView);
            console.log(util.format("\tUpload the encoded to a dedicated view_storage contract in blockchains, with the association to the view name. "))

            return this.fabric_support.CreateView(viewName, msg).then(()=>{
                return viewName;
            });
        } else {
            return viewName;
        }
    }


    AppendView(viewName, txnIDs) {
        this.viewTxns[viewName].push(...txnIDs);
        console.log(util.format("\tAssociate view %s with txn IDs", viewName, txnIDs));
        if (this.revocable_mode === "irrevocable") {  // Irrevocable
            var key = this.viewKeys[viewName];

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted confidential part and serialize the association into a view msg "))
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(key, txnID)] = {
                    "cipher": cmgr.Encrypt(key, this.txnConfidential[txnID]),
                    "salt": this.txnSalt[txnID]
                };
            }

            let msg = JSON.stringify(encodedMsgView);
            console.log(util.format("\tUpload the encoded to a dedicated view_storage contract in blockchains, with the association to the view name. "))

            return this.fabric_support.AppendView(viewName, msg).then(()=>{
                return viewName;
            }).catch(err=>{
                // Ignore potential MVCC conflicts here
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

            console.log(util.format("\tAssociate the encrypted txnID with the encrypted confidential part and serialize the association into a view message "))
            var encodedMsgView = {}
            for (var i in txnIDs) {
                var txnID = txnIDs[i];
                encodedMsgView[cmgr.Encrypt(viewKey, txnID)] = {
                    "cipher": cmgr.Encrypt(viewKey, this.txnConfidential[txnID]),
                    "salt": this.txnSalt[txnID]
                };
            }

            distributedData["viewData"] = JSON.stringify(encodedMsgView);
            console.log(util.format("\tDistribute the  encoded view message "));


        } else if (this.revocable_mode === "irrevocable") { // Irrevocable
            var viewKey = this.viewKeys[viewName];
            if (viewKey === undefined) {
                throw new Error("View " + viewName + " has not been created. ");
            }
        } else {
            console.log(`Unsupported revocable mode ${revocable_mode}...`);
            process.exit(1);
        }

        console.log(util.format("\tDistribute the view key %s protected the provided public key ", viewKey));
        var encryptedKey = cmgr.PublicEncrypt(userPubKey, viewKey);
        distributedData.encryptedKey = encryptedKey;
        return distributedData;
    }

    OnReceive(distributedData, userPrvKey) {
        var viewKey = cmgr.PrivateDecrypt(userPrvKey, '', distributedData.encryptedKey);

        var viewName = distributedData.viewName;
        console.log(util.format("\tRecover the key of view %s to %s with the user private key"), viewName, viewKey);

        return Promise.resolve().then(()=>{
            if (distributedData.mode === "revocable" || distributedData.mode === "incontract") {
                return distributedData.viewData;
            } else if (distributedData.mode === "irrevocable") {   
                console.log(util.format("\tFor irrevocable view management, pull view data for %s from blockchains."), distributedData.viewName);
                return this.fabric_support.GetView(distributedData.viewName);
            } else {
                console.log(`Unsupported revocable mode ${distributedData.mode}...`);
                process.exit(1);
            }
        }).then((encryptedViewMsg)=>{

            encryptedViewMsg = JSON.parse(encryptedViewMsg);
            var txnIDs = [];
            var txnConfidentialData = {};
            var localComputedhash = {};
            var promises = [];
            for (const encodedTxnID in encryptedViewMsg) {
                var txnID = cmgr.Decrypt(viewKey, encodedTxnID.toString());
                var confidentialData = cmgr.Decrypt(viewKey, encryptedViewMsg[encodedTxnID]["cipher"]);
                // console.log("\tUse the password to recover the txnID and the confidential part")
                var salt = encryptedViewMsg[encodedTxnID]["salt"];
                // console.log(`\tThe recovered salt is ${salt}`);
                txnIDs.push(txnID);
                txnConfidentialData[txnID] = confidentialData;
                localComputedhash[txnID] = cmgr.HashOp(confidentialData + salt);
                // console.log("\tLocally compute the hash of the confidential part for each txn.")
                promises.push(this.fabric_support.GetSecretFromTxnId(txnID));
            }

            if (distributedData.mode === "incontract") {
                // retrieve from the contract, the list of txn IDs. 
                promises.push(this.fabric_support.GetView(viewName));
            }
            return Promise.all(promises);

            // currently we skip the validation step
            // console.log("\tView Spec for " + viewName);
            // return Promise.all(promises).then((secrets)=>{
            //     for (var i = 0; i < txnIDs.length; i++) {
            //         var txnID = txnIDs[i];
            //         var hashFromSecret = secrets[i];
            //         console.log("\tPull the hash of the confidential part from the blockchain and validate with respect to the self-computed hash.")
            //         console.log(util.format("\t\tTxnID: %s, Confidential Data: %s, Secret Payload: %s, Locally-computed hash: %s"), txnID, txnConfidentialData[txnID], hashFromSecret, localComputedhash[txnID]);
            //     }
            // });
        });
    }
}

module.exports.HashBasedView = HashBasedView;