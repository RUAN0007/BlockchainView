const { Gateway, DefaultEventHandlerStrategies } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const coordinatorContract = "txncoordinator"; // corresponds to the chaincode name

class CrossChain {
    constructor(args) {
        this.channel_info = {};
        for (var i = 0; i < args.org_ids.length; i++) {
            var network_dir  = args.network_dirs[i];
            var org_id = args.org_ids[i];

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

            var channel_name = args.channel_names[i];
            this.channel_info[channel_name] = {
                "connection_profile": connection_profile,
                "gateway_option": gateway_option
            };
        }
    }

    async InitNetwork() {
        for (var channel_name in this.channel_info) {
            var connection_profile = this.channel_info[channel_name]["connection_profile"];
            var gateway_option = this.channel_info[channel_name]["gateway_option"];
            const gateway = new Gateway();
            await gateway.connect(connection_profile, gateway_option);
            this.channel_info[channel_name]["network"] = await gateway.getNetwork(channel_name);
        }
        return this;
    }


    async CrossChainCommit(channels, txId, secret) {
        console.log(`txId=${txId}, secret=${secret}`);
        var contracts = [];
        channels.forEach((channel_name)=>{
            if (channel_name in this.channel_info) {
                var network = this.channel_info[channel_name]["network"];
                contracts.push(network.getContract(coordinatorContract));
            } else {
                throw new Error(`Fail to locate the network for channel ${channel_name}`);
            }
        }); 

        var prepareReqs = [];
        contracts.forEach((contract)=>{
            const txn = contract.createTransaction("Prepare");
            prepareReqs.push(txn.submit(txId, secret));
        });
        await Promise.all(prepareReqs);

        var commitReqs = [];
        contracts.forEach((contract)=>{
            const txn = contract.createTransaction("Commit");
            commitReqs.push(txn.submit(txId, secret));
        });
        await Promise.all(commitReqs);
    }
}

module.exports.CrossChain = CrossChain;