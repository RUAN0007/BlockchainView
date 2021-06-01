const { Gateway, DefaultEventHandlerStrategies } = require('fabric-network');
const path = require('path');
const fs = require('fs');

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
        console.log("Not implemented...");
        process.exit(1);
    }

    InvokeTxnWithSecret(ccId, secret) {
        // Temporally hardcode the method name in secretcontract.go. 
        var functionName = "InvokeTxn";
        return this.SendTxn(ccId, functionName, ["11", secret]);
    }

    InvokeTxnWithSecretAsync(ccId, secret) {
        console.log("Not implemented...");
        process.exit(1);
    }


    CreateView(viewName, viewData) {
        // console.log(`Create View ${viewName} with Data ${viewData}`);
        // " < 10" is arbitrary. 
        return this.SendTxn("onchainview", "CreateView", [viewName, " < 10"]).then(()=>{
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
    }

    AppendView(viewName, viewData) {
        return viewName;
    }


    GetView(viewName) {
        console.log("Not implemented...");
        process.exit(1);
    }


    SendTxnAsync(ccId, functionName, publicArgs) {
        console.log("Not implemented...");
        process.exit(1);
    }

    async Query(ccId, function_name, args) {
        console.log("Not implemented...");
        process.exit(1);
    }
}

module.exports.NewFabricSupport = NewFabricSupport;