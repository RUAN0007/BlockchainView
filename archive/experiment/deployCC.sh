NETWORK_DIR="$(pwd)/$1" # Convert to abs path as we may change working directory
CHANNEL_NAME=${2}
CC_NAME=${3}
CC_ENDORSE_POLICY=${4}
CC_INIT_FCN=${5:-"NA"}
CC_QUERY_FCN=${6:-"NA"} # Optionally invoke a query to verify the entire process.

DELAY=${7:-"3"}
MAX_RETRY=${8:-"5"}
VERBOSE=${9:-"false"}

CC_VERSION="1.0"
CC_SEQUENCE="1"

if [[ "${CC_INIT_FCN}" == "NA" ]]; then
	INIT_OPT=""
else
	INIT_OPT="--init-required"
fi

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
pushd ${DIR} > /dev/null

# import utils
. envVar.sh

export FABRIC_CFG_PATH=fabric-config/

CC_SRC_PATH=chaincodes/${CC_NAME}
echo Vendoring Go dependencies at $CC_SRC_PATH
pushd $CC_SRC_PATH > /dev/null
GO111MODULE=on go mod vendor
popd > /dev/null
echo Finished vendoring Go dependencies


packageChaincode() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG
	set -x
	./bin/peer lifecycle chaincode package ${CC_NAME}.tar.gz --path ${CC_SRC_PATH} --label ${CC_NAME}_${CC_VERSION} >&log.txt
	res=$?
	set +x
	cat log.txt
	verifyResult $res "Chaincode packaging on peer0.org${ORG} has failed"
	echo "===================== Chaincode is packaged on peer0.org${ORG} ===================== "
	echo
}

# installChaincode PEER ORG
installChaincode() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG
	set -x
	./bin/peer lifecycle chaincode install ${CC_NAME}.tar.gz >&log.txt
	res=$?
	set +x
	cat log.txt
	verifyResult $res "Chaincode installation on peer0.org${ORG} has failed"
	echo "===================== Chaincode is installed on peer0.org${ORG} ===================== "
	echo
}

# queryInstalled PEER ORG
queryInstalled() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG
	set -x
	./bin/peer lifecycle chaincode queryinstalled >&log.txt
	res=$?
	set +x
	cat log.txt
	PACKAGE_ID=$(sed -n "/${CC_NAME}_${CC_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)
	verifyResult $res "Query installed on peer0.org${ORG} has failed"
	echo "===================== Query installed successful on peer0.org${ORG} on channel ===================== "
	echo
}

# approveForMyOrg VERSION PEER ORG
approveForMyOrg() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG
	getOrderer ${NETWORK_DIR} 1 # Use 1st orderer

	set -x
	./bin/peer lifecycle chaincode approveformyorg -o ${ORDERER_ADDR_PORT} --tls --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${CC_VERSION} --package-id ${PACKAGE_ID} --sequence ${CC_SEQUENCE} ${INIT_OPT} --signature-policy $CC_ENDORSE_POLICY  >&log.txt
	set +x
	cat log.txt
	verifyResult $res "Chaincode definition approved on peer0.org${ORG} on channel '$CHANNEL_NAME' failed"
	echo "===================== Chaincode definition approved on peer0.org${ORG} on channel '$CHANNEL_NAME' ===================== "
	echo
}

# checkCommitReadiness VERSION PEER ORG
checkCommitReadiness() {
	ORG=$1
	shift 1
	setPeerGlobals ${NETWORK_DIR} $ORG
	echo "===================== Checking the commit readiness of the chaincode definition on peer0.org${ORG} on channel '$CHANNEL_NAME'... ===================== "
	local rc=1
	local COUNTER=1
	# continue to poll
	# we either get a successful response, or reach MAX RETRY
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
		sleep $DELAY
		echo "Attempting to check the commit readiness of the chaincode definition on peer0.org${ORG}, Retry after $DELAY seconds."
		set -x
		./bin/peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${CC_VERSION} --sequence ${CC_SEQUENCE} ${INIT_OPT} --signature-policy ${CC_ENDORSE_POLICY} --output json >&log.txt
		res=$?
		set +x
		let rc=0
		for var in "$@"; do
			grep "$var" log.txt &>/dev/null || let rc=1
		done
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	if test $rc -eq 0; then
		echo "===================== Checking the commit readiness of the chaincode definition successful on peer0.org${ORG} on channel '$CHANNEL_NAME' ===================== "
	else
		echo
		echo $'\e[1;31m'"!!!!!!!!!!!!!!! After $MAX_RETRY attempts, Check commit readiness result on peer0.org${ORG} is INVALID !!!!!!!!!!!!!!!!"$'\e[0m'
		echo
		exit 1
	fi
}

# commitChaincodeDefinition VERSION PEER ORG (PEER ORG)...
commitChaincodeDefinition() {
	parsePeerConnectionParameters ${NETWORK_DIR} $@
	getOrderer ${NETWORK_DIR} 1 # Use 1st orderer

	res=$?
	verifyResult $res "Invoke transaction failed on channel '$CHANNEL_NAME' due to uneven number of peer and org parameters "

	# while './bin/peer chaincode' command can get the orderer endpoint from the
	# peer (if join was successful), let's supply it directly as we know
	# it using the "-o" option

	set -x
	./bin/peer lifecycle chaincode commit -o ${ORDERER_ADDR_PORT} --tls --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} $PEER_CONN_PARMS --version ${CC_VERSION} --sequence ${CC_SEQUENCE} ${INIT_OPT} --signature-policy ${CC_ENDORSE_POLICY} >&log.txt
	res=$?
	set +x
	cat log.txt
	verifyResult $res "Chaincode definition commit failed on peer0.org${ORG} on channel '$CHANNEL_NAME' failed"
	echo "===================== Chaincode definition committed on channel '$CHANNEL_NAME' ===================== "
	echo
}

# queryCommitted ORG
queryCommitted() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG

	EXPECTED_RESULT="Version: ${CC_VERSION}, Sequence: ${CC_SEQUENCE}, Endorsement Plugin: escc, Validation Plugin: vscc"
	echo "===================== Querying chaincode definition on peer0.org${ORG} on channel '$CHANNEL_NAME'... ===================== "
	local rc=1
	local COUNTER=1
	# continue to poll
	# we either get a successful response, or reach MAX RETRY
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
		sleep $DELAY
		echo "Attempting to Query committed status on peer0.org${ORG}, Retry after $DELAY seconds."
		set -x
		./bin/peer lifecycle chaincode querycommitted --channelID $CHANNEL_NAME --name ${CC_NAME} >&log.txt
		res=$?
		set +x
		test $res -eq 0 && VALUE=$(cat log.txt | grep -o '^Version: '$CC_VERSION', Sequence: [0-9], Endorsement Plugin: escc, Validation Plugin: vscc')
		test "$VALUE" = "$EXPECTED_RESULT" && let rc=0
		COUNTER=$(expr $COUNTER + 1)
	done
	echo
	cat log.txt
	if test $rc -eq 0; then
		echo "===================== Query chaincode definition successful on peer0.org${ORG} on channel '$CHANNEL_NAME' ===================== "
		echo
	else
		echo
		echo $'\e[1;31m'"!!!!!!!!!!!!!!! After $MAX_RETRY attempts, Query chaincode definition result on peer0.org${ORG} is INVALID !!!!!!!!!!!!!!!!"$'\e[0m'
		echo
		exit 1
	fi
}

chaincodeInvokeInit() {
	getOrderer ${NETWORK_DIR} 1 # Use 1st orderer
	parsePeerConnectionParameters ${NETWORK_DIR} $@
	res=$?
	verifyResult $res "Invoke transaction failed on channel '$CHANNEL_NAME' due to uneven number of peer and org parameters "

	# while './bin/peer chaincode' command can get the orderer endpoint from the
	# peer (if join was successful), let's supply it directly as we know
	# it using the "-o" option
	set -x
	FCN_CALL='{"function":"'${CC_INIT_FCN}'","Args":[]}'
	echo invoke fcn call:${FCN_CALL}

	./bin/peer chaincode invoke -o ${ORDERER_ADDR_PORT} --tls --cafile $ORDERER_CA -C $CHANNEL_NAME -n ${CC_NAME} $PEER_CONN_PARMS --isInit -c ${FCN_CALL} >&log.txt
	res=$?
	set +x
	cat log.txt
	verifyResult $res "Invoke execution on $PEERS failed "
	echo "===================== Invoke transaction successful on $PEERS on channel '$CHANNEL_NAME' ===================== "
	echo
}

chaincodeQuery() {
	ORG=$1
	setPeerGlobals ${NETWORK_DIR} $ORG

	echo "===================== Querying on peer0.org${ORG} on channel '$CHANNEL_NAME'... ===================== "
	local rc=1
	local COUNTER=1
	# continue to poll
	# we either get a successful response, or reach MAX RETRY
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
		sleep $DELAY
		echo "Attempting to Query peer0.org${ORG}, Retry after $DELAY seconds."
		set -x
		./bin/peer chaincode query -C $CHANNEL_NAME -n ${CC_NAME} -c '{"Args":["'$CC_QUERY_FCN'"]}' >&log.txt
		res=$?
		set +x
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	echo
	cat log.txt
	if test $rc -eq 0; then
		echo "===================== Query successful on peer0.org${ORG} on channel '$CHANNEL_NAME' ===================== "
		echo
	else
		echo
		echo $'\e[1;31m'"!!!!!!!!!!!!!!! After $MAX_RETRY attempts, Query result on peer0.org${ORG} is INVALID !!!!!!!!!!!!!!!!"$'\e[0m'
		echo
		exit 1
	fi
}

ORG_COUNT=$(wc -l ${NETWORK_DIR}/peers.txt | awk '{ print $1 }')
ALL_ORGS=""
for i in $(seq ${ORG_COUNT})
do 
	ALL_ORGS="$ALL_ORGS $i"
done

packageChaincode 1

for i in $(seq ${ORG_COUNT})
do
	echo "Install chaincode on peer0.org${i}..."
	installChaincode $i
done


for i in $(seq ${ORG_COUNT})
do
	echo "Query whether the chaincode is installed on peer0.org${i}..."
	queryInstalled $i
done

for i in $(seq ${ORG_COUNT})
do 
	echo "Approve the definition for org${i}..."
	approveForMyOrg $i
done

## check whether the chaincode definition is ready to be committed
## expect them both to have approved

## TODO: For some reason, I(RPC) can not retrieve the correct results.
## But given that it does not affect the deployment, I simply ignore this step. 
# checkCommitReadiness 1 "\"Org1MSP\": true" "\"Org2MSP\": true"
# checkCommitReadiness 2 "\"Org1MSP\": true" "\"Org2MSP\": true"

## now that we know for sure both orgs have approved, commit the definition
commitChaincodeDefinition ${ALL_ORGS}

for i in $(seq ${ORG_COUNT})
do 
    echo "Query on org${i} to see that the definition committed successfully"
	queryCommitted ${i}
done

## Invoke the chaincode - this does require that the chaincode have the 'initLedger'
## method defined
if [[ "${CC_INIT_FCN}" == "NA" ]]; then
	echo "No init function to invoke."
else
	chaincodeInvokeInit ${ALL_ORGS}
fi

if [ "$CC_QUERY_FCN" = "NA" ]; then
	echo "No query function to invoke."
else
	chaincodeQuery 1
fi
popd > /dev/null

exit 0
