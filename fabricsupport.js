const { Gateway, DefaultEventHandlerStrategies} = require('fabric-network');
const { BlockDecoder } = require('fabric-common');
const path = require('path');
const fs = require('fs');
const fabproto6 = require('fabric-protos');


const viewstorageContract = "viewstorage"; // corresponds to the chaincode name

class FabricSupport {
    constructor(args) {
        var network_dir  = args.network_dir;
        var org_id = args.org_id;
        this.channel_name = args.channel_name;

        const profile_path = path.resolve(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "connection_profile.json");
        const connection_profile = JSON.parse(fs.readFileSync(profile_path, 'utf8'));

        // Check to see if we've already enrolled the user.
        const cert_path = path.join(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "signcerts", `Admin@org${org_id}.example.com-cert.pem`);
        const key_path = path.join(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "keystore", "priv_sk");

        const x509Identity = {
            credentials: {
                certificate: fs.readFileSync(cert_path).toString(),
                privateKey: fs.readFileSync(key_path).toString(),
            },
            mspId: `Org${org_id}MSP`,
            type: 'X.509',
        };        

        // Wait for the peer in the org commits this transaction
        let op = DefaultEventHandlerStrategies.MSPID_SCOPE_ALLFORTX;
        const gateway_option = {
            identity:x509Identity ,
            discovery: { enabled: true, asLocalhost: false},
            eventHandlerOptions: {
                strategy: op 
            }  
        };

        this.connection_profile = connection_profile;
        this.gateway_option = gateway_option;

        this.txID2Data = {};
    }

    async InitNetwork() {
        const gateway = new Gateway();
        await gateway.connect(this.connection_profile, this.gateway_option);
        this.network = await gateway.getNetwork(this.channel_name);

        // Register a block listener
        const listener = async (event) => {
            try {
                var height = Number(event.blockNumber) + 1;
                const blkNum = "" + event.blockNumber; //conver to str
                const block = event.blockData;
                let tx_filters = block.metadata.metadata[2]
                for (var index = 0; index < block.data.data.length; index++) {
                    var channel_header = block.data.data[index].payload.header.channel_header;
                    // 3 implies for the normal contract-invoking txn, based on https://hyperledger.github.io/fabric-chaincode-node/release-2.2/api/fabric-shim.ChannelHeader.html
                    // The check on tx_filters indicates the txn is valid
                    var validTxCount = 0;
                    if (channel_header.type === 3 && tx_filters[index] === 0) {
                        this.txID2Data[channel_header.tx_id] = block.data.data[index].payload.data;
                        validTxCount++;
                    }
                }
                // console.log(`Block ${blkNum} has ${validTxCount} txns. `);

            } catch (error) {
                console.error(`Failed to listen for blocks: ${error}`);
            }
        };
        await this.network.addBlockListener(listener, {startBlock: 1});
        return this;
    }


    GetSecretFromTxnId(txnId) {
        // console.log("================================================");
        // console.log(util.format("Txn %s structure: ", txnId));
        if (!(txnId in this.txID2Data)) {
            throw new Error(`Fail to locate the txn with id ${txnId} `);
        } 
        var txnData = this.txID2Data[txnId];
        var writeSets = txnData.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes;

        for (var i = 0; i < writeSets.length; i++) {

        // This string constant must be identical to var secretKey in secretcontract.go
            if (writeSets[i].key === "secretkey") {
                return writeSets[i].value.toString();
            } else {
                // console.log("Writekey: ", writeSets[i].key);
            }
        }
        throw new Error("Fail to locate the secret payload in txn " + txnId);
    }

    InvokeTxnWithSecret(ccId, secret) {
        // Temporally hardcode the method name in secretcontract.go. 
        var functionName = "InvokeWithSecret";
        return this.SendTxn(ccId, functionName, [secret]);
    }

    InvokeTxnWithSecretAsync(ccId, secret) {
        // Temporally hardcode the method name in secretcontract.go. 
        var functionName = "InvokeWithSecret";
        return this.SendTxnAsync(ccId, functionName, [secret]);
    }


    CreateView(viewName, viewData) {
        // console.log(`Create View ${viewName} with Data ${viewData}`);
        return this.SendTxn(viewstorageContract, "CreateView", [viewName, viewData]).then(()=>{
            return viewName;
        });
    }

    AppendView(viewName, viewData) {
        return this.SendTxn(viewstorageContract, "AppendView", [viewName, viewData]).then(()=>{
            return viewName;
        });
    }


    GetView(viewName) {
        return this.Query(viewstorageContract, "GetView", [viewName]).then((result)=>{
            // console.log(`Query View ${viewName} for Data ${result}`);
            return result;
        });
    }

    // publicArgs: an array of strings
    async SendTxn(ccId, functionName, publicArgs) {
        const contract = this.network.getContract(ccId);
        const txn = contract.createTransaction(functionName);
        await txn.submit(...publicArgs);
        const txnID = txn.getTransactionId();
        return txnID;
    }

    SendTxnAsync(ccId, functionName, publicArgs) {
        const contract = this.network.getContract(ccId);
        const txn = contract.createTransaction(functionName);
        txn.submit(...publicArgs);
        const txnID = txn.getTransactionId();
        return txnID;
    }

    async Query(ccId, function_name, args) {
        const contract = this.network.getContract(ccId);
        const result = await contract.evaluateTransaction(function_name, ...args);
        // console.log(`The query has been evaluated on the peer of Org${org_id}, result is: ${result.toString()}`);
        return result.toString();
    }
}

module.exports.FabricSupport = FabricSupport;


class NewFabricSupport {
    constructor(args) {
        var network_dir  = args.network_dir;
        var org_id = args.org_id;
        this.channel_name = args.channel_name;
        this.cc_viewincontract_name = args.cc_viewincontract_name;

        const profile_path = path.resolve(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "connection_profile.json");
        const connection_profile = JSON.parse(fs.readFileSync(profile_path, 'utf8'));

        // Check to see if we've already enrolled the user.
        const cert_path = path.join(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "signcerts", `Admin@org${org_id}.example.com-cert.pem`);
        const key_path = path.join(network_dir, "crypto_config", "peerOrganizations", `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "keystore", "priv_sk");

        const x509Identity = {
            credentials: {
                certificate: fs.readFileSync(cert_path).toString(),
                privateKey: fs.readFileSync(key_path).toString(),
            },
            mspId: `Org${org_id}MSP`,
            type: 'X.509',
        };        

        // Wait for the peer in the org commits this transaction
        let op = DefaultEventHandlerStrategies.MSPID_SCOPE_ALLFORTX;
        const gateway_option = {
            identity:x509Identity ,
            discovery: { enabled: true, asLocalhost: false},
            eventHandlerOptions: {
                strategy: op 
            }  
        };

        this.connection_profile = connection_profile;
        this.gateway_option = gateway_option;
        this.view_merge_sec = args.view_merge_sec;

        this.txID2Data = {};
    }

    async InitNetwork() {
        const gateway = new Gateway();
        await gateway.connect(this.connection_profile, this.gateway_option);
        this.network = await gateway.getNetwork(this.channel_name);

        // Register a block listener
        const listener = async (event) => {
            try {
                var height = Number(event.blockNumber) + 1;
                const blkNum = "" + event.blockNumber; //conver to str
                const block = event.blockData;
                let tx_filters = block.metadata.metadata[2]
                for (var index = 0; index < block.data.data.length; index++) {
                    var channel_header = block.data.data[index].payload.header.channel_header;
                    // 3 implies for the normal contract-invoking txn, based on https://hyperledger.github.io/fabric-chaincode-node/release-2.2/api/fabric-shim.ChannelHeader.html
                    // The check on tx_filters indicates the txn is valid
                    var validTxCount = 0;
                    if (channel_header.type === 3 && tx_filters[index] === 0) {
                        this.txID2Data[channel_header.tx_id] = block.data.data[index].payload.data;
                        validTxCount++;
                    }
                }
                // console.log(`Block ${blkNum} has ${validTxCount} txns. `);

            } catch (error) {
                console.error(`Failed to listen for blocks: ${error}`);
            }
        };
        await this.network.addBlockListener(listener, {startBlock: 1});
        return this;
    }

    InspectTxnRW(txnData) {
        if (txnData.hasOwnProperty('actions')) {
            var writeSets = txnData.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes;

            for (var i = 0; i < writeSets.length; i++) {
            }

            var readSets = txnData.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.reads;
            for (var i = 0; i < readSets.length; i++) {
            }
        } else {
            // Ignore config txn
        }
    }

    async GetBlockByNumber(blk_num) {
        const contract = this.network.getContract('qscc');
        const resultByte = await contract.evaluateTransaction(
            'GetBlockByNumber',
            this.channel_name,
            String(blk_num)
        );

        var chain_info = ledger_proto.BlockchainInfo.decode(resultByte);
        var height = chain_info.getHeight();
        console.log(`height=${height}`);
    }

    async GetTxnById(txn_id) {
        const contract = this.network.getContract('qscc');
        const txnBytes = await contract.evaluateTransaction(
            'GetTransactionByID',
            this.channel_name,
            txn_id
        );
        return txnBytes;
    }

    async GetLedgerHeight() {
        const contract = this.network.getContract('qscc');
        const resultByte = await contract.evaluateTransaction(
            'GetChainInfo',
            this.channel_name
        );

        const blockinfoProto = fabproto6.common.BlockchainInfo.decode(resultByte);
        var height = blockinfoProto.height;
        console.log(`chain height = ${height}`);
        return height;
    }

    async MeasureScanLedger() {
        var blk_num = 0;
        var start;

        var total_query_ms = 0;
        var total_verification_ms = 0;
        var chain_height = await this.GetLedgerHeight();

        start = new Date();
        for (var blk_height = 0; blk_height < chain_height; blk_height++) {
                let start_query = new Date();
                console.log(`Pull block ${blk_height}`);
                const contract = this.network.getContract('qscc');
                const resultByte = await contract.evaluateTransaction(
                    'GetBlockByNumber',
                    this.channel_name,
                    String(blk_height)
                );
                let end_query = new Date();
                total_query_ms += end_query - start_query;

                let start_verify = new Date();
                const block = BlockDecoder.decode(resultByte);
                for (var index = 0; index < block.data.data.length; index++) {
                    this.InspectTxnRW(block.data.data[index].payload.data);
                }
                let end_verify = new Date();
                total_verification_ms += end_verify - start_verify;
        }

        let total_elapsed = new Date() - start;
        console.log(`Scan ${chain_height} blocks in ${total_elapsed} ms ( remote query in ${total_query_ms} ms, verify in ${total_verification_ms} ms ) `);
    }

    GetSecretFromTxnId(txnId) {
        // console.log("================================================");
        // console.log(util.format("Txn %s structure: ", txnId));
        if (!(txnId in this.txID2Data)) {
            throw new Error(`Fail to locate the txn with id ${txnId} `);
        } 
        var txnData = this.txID2Data[txnId];
        var writeSets = txnData.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes;

        for (var i = 0; i < writeSets.length; i++) {

        // This string constant must be identical to var secretKey in secretcontract.go
            if (writeSets[i].key === "secretkey") {
                return writeSets[i].value.toString();
            } else {
                // console.log("Writekey: ", writeSets[i].key);
            }
        }
        throw new Error("Fail to locate the secret payload in txn " + txnId);
    }


    InvokeTxnWithSecret(ccId, pub_arg, secret) {
        // Temporally hardcode the method name in secretcontract.go. 
        var functionName = "InvokeTxn";
        return this.SendTxn(ccId, functionName, [pub_arg, secret]);
    }

    InvokeTxnWithSecretAsync(ccId, secret) {
        console.log("Not implemented...");
        process.exit(1);
    }


    CreateView(viewName, viewData) {
        // console.log(`Create View ${viewName} with Data ${viewData}`);
        // 30 is the merge period
        var view_merge_sec = "30";
        var undef;
        if (this.view_merge_sec !== undef) {
            view_merge_sec = this.view_merge_sec;
        }
        return this.SendTxn(this.cc_viewincontract_name, "CreateView", [viewName, viewName, view_merge_sec]).then(()=>{
            return viewName;
        });
    }

    // publicArgs: an array of strings
    async SendTxn(ccId, functionName, publicArgs) {
        const contract = this.network.getContract(ccId);
        const txn = contract.createTransaction(functionName);
        await txn.submit(...publicArgs);
        const txnID = txn.getTransactionId();
        return txnID;
        // console.log(`SendTxn: ccId=${ccId}, functionName=${functionName}, publicArgs=${publicArgs}`);
        // return "1213213";
    }

    AppendView(viewName, viewData) {
        return viewName;
    }


    GetView(viewName) { // diff from aobve, it returns txnIDs
        return this.Query(this.cc_viewincontract_name, "RetrieveTxnIdsByView", [viewName]).then((result)=>{
            // console.log(`Query View ${viewName} for Data ${result}`);
            return JSON.parse(result);
        }); // [t1]
    }


    SendTxnAsync(ccId, functionName, publicArgs) {
        console.log("Not implemented...");
        process.exit(1);
    }


    async Query(ccId, function_name, args) {
        const contract = this.network.getContract(ccId);
        const result = await contract.evaluateTransaction(function_name, ...args);
        // console.log(`The query has been evaluated on the peer of Org${org_id}, result is: ${result.toString()}`);
        return result.toString();
    }

}

module.exports.NewFabricSupport = NewFabricSupport;


class FakeFabricSupport {
    constructor(args) {
        var network_dir  = args.network_dir;
        var org_id = args.org_id;
        this.channel_name = args.channel_name;
        this.txID2Data = {};
    }

    async InitNetwork() {
        return this;
    }


    GetSecretFromTxnId(txnId) {
        console.log("Not implemented...");
        process.exit(1);
    }


    InvokeTxnWithSecret(ccId, pub_arg, secret) {
        // Temporally hardcode the method name in secretcontract.go. 
        var functionName = "InvokeTxn";
        return this.SendTxn(ccId, functionName, [pub_arg, secret]);
    }

    InvokeTxnWithSecretAsync(ccId, secret) {
        console.log("Not implemented...");
        process.exit(1);
    }


    CreateView(viewName, viewData) {
        return viewName;
    }

    // publicArgs: an array of strings
    async SendTxn(ccId, functionName, publicArgs) {
        let rand_id = (Math.random() + 1).toString(36);
        return rand_id;
    }

    AppendView(viewName, viewData) {
        return viewName;
    }


    GetView(viewName) { // diff from aobve, it returns txnIDs
        console.log("Not implemented...");
        process.exit(1);
    }


    SendTxnAsync(ccId, functionName, publicArgs) {
        console.log("Not implemented...");
        process.exit(1);
    }


    async Query(ccId, function_name, args) {
        return "";
    }

}

module.exports.FakeFabricSupport = FakeFabricSupport;