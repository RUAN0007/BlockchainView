```

CHANNEL="viewchannel"
NETWORK_DIR="viewnetwork2"
PEER_COUNT=2

# Prepare the network (ONCE)
python prepare.py ${NETWORK_DIR} $CHANNEL 100 3 slave-30 slave-31 slave-32 ${PEER_COUNT} slave-4 slave-5
```

```
# Launch the network
python network.py ${NETWORK_DIR} on

# Set up the channel
./setup_channel.sh ${NETWORK_DIR} ${CHANNEL}

# Prepare to deploy the network
ALL_ORG=""
for i in $(seq ${PEER_COUNT})
do
   ALL_ORG="$ALL_ORG 'Org${i}MSP.peer'"
done

function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }
ENDORSE_POLICY="AND($(join_by , $ALL_ORG))"


CC_NAME="secretcontract"
./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 

CC_NAME="viewstorage"
./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 

CC_NAME="txncoordinator"
./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 


```


```
# Test 
node test.js 
```

```
# Experiments
node supply_chain_view.js data/batch_100items_10batchsize.json encryption irrevocable

node supply_chain_across.js data/batch_100items_10batchsize.json

```

