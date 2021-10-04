/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const fabricSupport = require("./fabricsupport.js");
const crossChain = require("./crosschain.js");
const cmgr = require('./crypto_mgr.js');

function PromiseTimeout(delayms) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, delayms);
    });
}

async function support() {
    try {
        var fabric_support = new fabricSupport.FabricSupport({"network_dir": "viewnetwork",
        "channel_name":"viewchannel", "org_id": 1});
        await fabric_support.InitNetwork();

        var txnID = await fabric_support.InvokeTxnWithSecret("secretcontract", "SECRET_PAYLOAD_RPC");
        console.log(`Invoke TxnID: ${txnID}`);
        await PromiseTimeout(2000);
        var secret = await fabric_support.GetSecretFromTxnId(txnID);
        console.log(`Pull the secret ${secret} from txnID ${txnID}`);
    } catch (error) {
        console.error(`Encounter error: ${error.stack}`);
        process.exit(1);
    }
}


async function crosschain() {
    try {
        var cross_chain = new crossChain.CrossChain({"network_dirs": ["viewnetwork"],
        "channel_names":["viewchannel"], "org_ids": [1]});
        await cross_chain.InitNetwork();
        console.log("Finish initing the network");
        await cross_chain.CrossChainCommit(["viewchannel"], "tx1");
        console.log("Finish cross chain commit");
    } catch (error) {
        console.error(`Encounter error: ${error.stack}`);
        process.exit(1);
    }
}

async function main() {
    const key = "qvo1cyn";
    const text = "SECRET_PAYLOAD_RPC";
    var cipher = cmgr.Encrypt(key, text);
    var original_text = cmgr.Decrypt(key, cipher);
    console.log(`Original Text: ${original_text}`);
}

// crosschain();
main();
