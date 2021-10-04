
# Overview
This mini-project is a minimum-working-prototype(MVP) which demonstrates the basic functionality of Fabric v2.2. In this MVP, we use the latest commands and APIs to setup channels, manage contracts (chaincodes) and perform interaction. 
Our demonstration operates on ciidaa cluster. 

## Note
* `./bin/peer` process is lightly instrumented to print timer logs, which is used to collect measurements. Refer to the commit `e4dbba552` on branch `my-v2.2` in my [repo](https://github.com/RUAN0007/FabricSharpSigmod/tree/my-v2.2) for the instrumented codebase. 

# Prerequisite
* _docker_ with version `18.06.3-ce` or later.
* _python_ with version `2.7.x`
* _golang_ with version `1.14.x`
* _node_ with version `12.13.x`
* On each peer node, pull the docker images `docker pull hyperledger/fabric-ccenv:latest`. 

# Preparation
__NOTE__: The preparation steps are all done for once. 
## SDK
```
npm install
```
## Artifacts
```
CHANNEL="viewchannel"
NETWORK_DIR="viewnetwork"
PEER_COUNT=2

python prepare.py ${NETWORK_DIR} $CHANNEL 500 3 slave-30 slave-31 slave-32 ${PEER_COUNT} slave-4 slave-5
```
* The above cmd prepares for a network with 500 txns per block, 3 orderers (slave-30 slave-31 slave-32), `PEER_COUNT` peers (slave-4, slave-5), and a channel named as `$CHANNEL`.
* The generated artifacts are in `$NETWORK_DIR`. 
* Each peer belongs to different orgs. (Each org has a single peer. ) But all orderers belong to the same org. 
* Orderers employ Raft and the tls MUST be on for Raft. 

## Others
Update `MY_DATA_DIR` in _config.py_ to a directory with the write access. 

# Spin-up
```
# A fresh restart
python network.py ${NETWORK_DIR} on
```
Spin up the Fabric network as specfied in `${NETWORK_DIR}`.

# Channel/chaincode Setup
## Channel Initialization
```
./setup_channel.sh ${NETWORK_DIR} ${CHANNEL}
```
The following logs are normal:
```
2020-12-16 19:31:16.792 +08 [channelCmd] InitCmdFactory -> INFO 001 Endorser and orderer connections initialized
2020-12-16 19:31:16.831 +08 [cli.common] readBlock -> INFO 002 Expect block, but got status: &{NOT_FOUND}
```

## Contract Deployment
```
CC_NAME=fabcar
ALL_ORG=""
for i in $(seq ${PEER_COUNT})
do
   ALL_ORG="$ALL_ORG 'Org${i}MSP.peer'"
done

function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }
ENDORSE_POLICY="AND($(join_by , $ALL_ORG))"
# The result is AND('Org1MSP.peer','Org2MSP.peer',...), which requires for all orgs' endorsements.

INIT_FCN=InitLedger
TEST_QUERY_FCN=QueryAllCars # An optional query to verify the entire deployment process.

./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" ${INIT_FCN} ${TEST_QUERY_FCN}
```

If the deployment is successfuly, the query results shall be displayed.

If encountering the following log during the deployment, remove docker images of previously deployed chaincodes as described later.
```
Error: endorsement failure during invoke. response: status:500 message:"error in simulation: failed to execute transaction bd32606273a80acf4736bacf03b122a39fd5e6996919f77c4cf32be95e106e84: could not launch chaincode fabcar_1.0:c302ddec384cce226322fc4a6629127d876f0ebbd91a6093cea0a829231b1e09: chaincode registration failed: container exited with 0" 
```

# Invoke 
```
INVOKE_FCN=ChangeCarOwner
INVOKE_ARGS="CAR4 RPC"
INVOKE_ORG_ID=1
MODE=open_loop # Other values assume for the closed-loop invocation. 
node invoke.js ${NETWORK_DIR} ${INVOKE_ORG_ID} ${MODE} ${CHANNEL} ${CC_NAME} ${INVOKE_FCN} ${INVOKE_ARGS}
```

# Query
```
QUERY_FCN=queryCar
QUERY_ARGS=CAR4
QUERY_ORG_ID=2 # Queried on the peer of Org2 with its admin
node query.js ${NETWORK_DIR} ${QUERY_ORG_ID} ${CHANNEL} ${CC_NAME} ${QUERY_FCN} ${QUERY_ARGS}
```
If correct, one may observe RPC is now the owner of CAR4. 

# Register for block events
Start a long-running process to monitor blocks and retrieve internal transactions. 
```
REGISTER_ORG_ID=1
node register_blk_listener.js ${NETWORK_DIR} ${REGISTER_ORG_ID} ${CHANNEL} 
```
Try a number of above invocations with the monitor service on. 

# Turn-off
```
python network.py ${NETWORK_DIR} off
```
Peer and orderer logs are preserved until the next spin-up.

# Collect Measurements from peer logs
__NOTE__: Assume to have logged in the peer terminal. Approach me (RPC) if you are unfamiliar about the metrics. 
```
STATRT_BLK=2 # Inclusive. If undefined STATRT_BLK=0
END_BLK=10 # Exclusive. If undefined END_BLK=infinity
# measure_block.py will get the peer log path from config.py.
python measure_block.py ${STATRT_BLK} ${END_BLK}
```

# Remove images of deployed chaincodes on peer nodes
__NOTE__:This step is unnecessary unless the chaincode is changed. 
```
DOCKER_IMAGE_IDS=$(docker images | awk '($1 ~ /dev-*/) {print $3}')
if [ -z "$DOCKER_IMAGE_IDS" -o "$DOCKER_IMAGE_IDS" == " " ]; then
   echo "---- No images available for deletion ----"
else
   docker rmi -f $DOCKER_IMAGE_IDS
fi
```