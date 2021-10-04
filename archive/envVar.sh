#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

# This is a collection of bash functions used by different scripts

export CORE_PEER_TLS_ENABLED=true

# Set environment variables for the peer org
setPeerGlobals() {
  local NETWORK_DIR=""
  NETWORK_DIR=$1
  local ORG_NUM=""
  ORG_NUM=$2
  echo "Using organization ${ORG_NUM}"
  export CORE_PEER_LOCALMSPID="Org${ORG_NUM}MSP"
  export CORE_PEER_MSPCONFIGPATH=${NETWORK_DIR}/crypto_config/peerOrganizations/org${ORG_NUM}.example.com/users/Admin@org${ORG_NUM}.example.com/msp

  LINE=$(sed "${ORG_NUM}q;d" ${NETWORK_DIR}/peers.txt)
  IFS=':' read -ra PEER_ADDR_PORT <<< "$LINE"
  PEER_ADDR=${PEER_ADDR_PORT[0]}
  PEER_PORT=${PEER_ADDR_PORT[1]}
  export CORE_PEER_ADDRESS=${PEER_ADDR}:${PEER_PORT}
  export CORE_PEER_TLS_ROOTCERT_FILE=${NETWORK_DIR}/crypto_config/peerOrganizations/org${ORG_NUM}.example.com/peers/${PEER_ADDR}.org${ORG_NUM}.example.com/tls/ca.crt

  # echo "CORE_PEER_LOCALMSPID: ${CORE_PEER_LOCALMSPID}"
  # echo "CORE_PEER_MSPCONFIGPATH: ${CORE_PEER_MSPCONFIGPATH}"
  # echo "CORE_PEER_ADDRESS: ${CORE_PEER_ADDRESS}"
  # echo "CORE_PEER_TLS_ROOTCERT_FILE: ${CORE_PEER_TLS_ROOTCERT_FILE}"
}

getOrderer() {
  local NETWORK_DIR=""
  NETWORK_DIR=$1
  local ORDERER_NUM=""
  ORDERER_NUM=$2

  ORDERER_ADDR_PORT=$(sed "${ORDERER_NUM}q;d" ${NETWORK_DIR}/orderers.txt)
  IFS=':' read -ra ADDR_PORT <<< "$ORDERER_ADDR_PORT"
  ORDERER_ADDR=${ADDR_PORT[0]}

	ORDERER_CA=${NETWORK_DIR}/crypto_config/ordererOrganizations/example.com/orderers/${ORDERER_ADDR}.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

  export ORDERER_ADDR_PORT
  export ORDERER_ADDR
  export ORDERER_CA
}

# parsePeerConnectionParameters ${NETWORK_DIR} $@
# Helper function that sets the peer connection parameters for a chaincode
# operation
parsePeerConnectionParameters() {

  local NETWORK_DIR=""
  NETWORK_DIR=$1
  shift
  PEER_CONN_PARMS=""
  PEERS=""
  while [ "$#" -gt 0 ]; do
    setPeerGlobals ${NETWORK_DIR} $1
    PEER="peer0.org$1"
    ## Set peer adresses
    PEERS="$PEERS $PEER"
    PEER_CONN_PARMS="$PEER_CONN_PARMS --peerAddresses $CORE_PEER_ADDRESS"
    ## Set path to TLS certificate
    PEER_CONN_PARMS="$PEER_CONN_PARMS --tlsRootCertFiles  $CORE_PEER_TLS_ROOTCERT_FILE"
    # shift by one to get to the next organization
    shift
  done
  # remove leading space for output
  PEERS="$(echo -e "$PEERS" | sed -e 's/^[[:space:]]*//')"
}

verifyResult() {
  if [ $1 -ne 0 ]; then
    echo $'\e[1;31m'!!!!!!!!!!!!!!! $2 !!!!!!!!!!!!!!!!$'\e[0m'
    echo
    exit 1
  fi
}
