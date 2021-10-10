'use strict';

const FabricFront = require("./fabricfront").FabricFront;
const util = require('util');
const LOGGER = require('loglevel');

const cmgr = require('./crypto_mgr.js');
const global = require('./global.js');

class PrvDataNoView {
    constructor(fabric_front, mode, wl_contract_id) {
        this.fabric_front = fabric_front;
        this.mode = mode;
        this.wl_contract_id = wl_contract_id;
        if (mode !== global.ViewInContractMode) {
            LOGGER.error("PrvDataViewMgr only supports ViewInContract");
        }
    }

    InvokeTxn(func_name, pub_arg, prv_arg, reqID) {
        return this.fabric_front.InvokeTxn(this.wl_contract_id, func_name, [pub_arg, prv_arg]).then((txnID)=>{
            LOGGER.info(`\tSend a txn ${txnID} to invoke ${this.wl_contract_id} with the prv arg. `);
            return ["", txnID, reqID];
        })
        .catch(error => {
            LOGGER.error(`Error with code ${error}`);
            // probably due to MVCC
            return [error.transactionCode, "", reqID];
        });
    }


    CreateView(view_name, view_predicate) {
        LOGGER.info("Not implemented for View Creation. ");
        return view_name;
    }

    AppendView(view_name, txnIDs) {
        LOGGER.error("Not implemented");
        process.exit(1);
    }

    // return as a Buffer type
    DistributeView(view_name, userPubKey) {
        LOGGER.error("Not implemented");
        process.exit(1);
    }

    // To be invoked at the recipient side
    OnReceive(distributedData, userPrvKey) {
        LOGGER.error("Not implemented");
        process.exit(1);
    }
}

module.exports.PrvDataNoView = PrvDataNoView;