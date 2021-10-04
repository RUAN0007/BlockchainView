#!/bin/bash

NETWORK_DIR="$(pwd)/$1" # Convert to abs path as we may change directory
CHANNEL_NAME="$2"
DELAY="$3"
MAX_RETRY="$4"
VERBOSE="$5"
: ${CHANNEL_NAME:="mychannel"}
: ${DELAY:="3"}
: ${MAX_RETRY:="5"}
: ${VERBOSE:="false"}

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
pushd ${DIR} > /dev/null

# import utils
. envVar.sh

createChannel() {
	ORG=1
	setPeerGlobals ${NETWORK_DIR} ${ORG}
	getOrderer ${NETWORK_DIR} 1 # Use 1st orderer
	# Poll in case the raft leader is not set yet
	local rc=1
	local COUNTER=1

	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ] ; do
		sleep $DELAY
		set -x
		./bin/peer channel create -o ${ORDERER_ADDR_PORT} -c $CHANNEL_NAME -f ${NETWORK_DIR}/channel_artifacts/${CHANNEL_NAME}.tx --outputBlock ${NETWORK_DIR}/channel_artifacts/${CHANNEL_NAME}.block --tls --cafile $ORDERER_CA >&log.txt
		res=$?
		set +x
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	verifyResult $res "Channel creation failed"
	echo
	echo "===================== Channel '$CHANNEL_NAME' created ===================== "
	echo
}

# queryCommitted ORG
joinChannel() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} ${ORG}

	local rc=1
	local COUNTER=1
	## Sometimes Join takes time, hence retry
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ] ; do
		sleep $DELAY
		set -x
		./bin/peer channel join -b ${NETWORK_DIR}/channel_artifacts/$CHANNEL_NAME.block >&log.txt
		res=$?
		set +x
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	echo
	verifyResult $res "After $MAX_RETRY attempts, peer0.org${ORG} has failed to join channel '$CHANNEL_NAME' "
	echo
	echo "========= Channel successfully joined =========== "
	echo
}


updateAnchorPeers() {
	ORG=$1

	setPeerGlobals ${NETWORK_DIR} $ORG
	getOrderer ${NETWORK_DIR} 1 # Use 1st orderer
	
	local rc=1
	local COUNTER=1
	## Sometimes Join takes time, hence retry
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ] ; do
		sleep $DELAY
		set -x
		./bin/peer channel update -o ${ORDERER_ADDR_PORT} -c $CHANNEL_NAME -f ${NETWORK_DIR}/channel_artifacts/${CORE_PEER_LOCALMSPID}_anchors.tx --tls --cafile $ORDERER_CA >&log.txt
		res=$?
		set +x
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	verifyResult $res "Anchor peer update failed"
	echo "===================== Anchor peers updated for org '$CORE_PEER_LOCALMSPID' on channel '$CHANNEL_NAME' ===================== "
	sleep $DELAY
	echo
}

verifyResult() {
  if [ $1 -ne 0 ]; then
    echo "!!!!!!!!!!!!!!! "$2" !!!!!!!!!!!!!!!!"
    echo
    exit 1
  fi
}

export FABRIC_CFG_PATH=fabric-config/

## Create channel
echo "Creating channel "$CHANNEL_NAME
createChannel

PEER_COUNT=$(wc -l ${NETWORK_DIR}/peers.txt | awk '{ print $1 }')

## Join all the peers to the channel
for i in $(seq ${PEER_COUNT})
do
	echo "Join the Org${i} peer to the channel..."
	joinChannel ${i}
done

for i in $(seq ${PEER_COUNT})
do
	echo "Update anchor peers for the Org${i} peer..."
	updateAnchorPeers ${i}
done


popd > /dev/null
exit 0
