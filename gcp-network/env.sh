export PEER_ZONES=( "asia-east1-a" "europe-north1-a" "northamerica-northeast1-a" )
export ORDERER_ZONES=( "asia-southeast1-a" "asia-southeast1-a" "asia-southeast1-a" ) # All in SG
export MACHINE_TYPE="e2-standard-2"
export GCP_NETWORK="mynetwork"
export DNS_ZONE="myzone"
export FIREWALL_RULENAME="myfirewall"

export PEER_INSTANCES=( "peer0org1" "peer0org2" )

# Peer and Orderer DNS Names must match with crypto-config-*.yaml and configtx.yaml
export DNS_SUFFIX="example.com"

# Below two must be consistent
export ORG_DNS_NAMES=( "org1.${DNS_SUFFIX}" "org2.${DNS_SUFFIX}" )
export ORG_MSPS=( "Org1MSP" "Org2MSP" )
export PEER_DNS_NAMES=( "peer0.org1.${DNS_SUFFIX}" "peer0.org2.${DNS_SUFFIX}" )

export ORDERER_INSTANCES=( "orderer" )
export ORDERER_DNS_NAMES=( "orderer.${DNS_SUFFIX}" )
# export ORDERER_INSTANCES=( "orderer1" "orderer2" "orderer3" )
# export ORDERER_DNS_NAMES=("orderer1.${DNS_SUFFIX}" "orderer2.${DNS_SUFFIX}" "orderer3.${DNS_SUFFIX}")

export PEER_INTERNAL_IP_PATH="./peer_internal_ip"
export ORDERER_INTERNAL_IP_PATH="./orderer_internal_ip"
export PEER_EXTERNAL_IP_PATH="./peer_external_ip"
export ORDERER_EXTERNAL_IP_PATH="./orderer_external_ip"

export FABRIC_ENV_IMAGE="fabricenv" # a pre-built GCP image with docker, docker-compose, fabric-related binaries and docker images. 

export LOCAL_GENESIS_BLK="./system-genesis-block/genesis.block"

# Paths in GCP instances, uniform across instances. 
export REMOTE_FABRIC_CFG_PATH="fabric-samples/config" # hardcoded in pre-built GCP image
export REMOTE_PEER_EXEC="fabric-samples/bin/peer"
export REMOTE_ORDERER_EXEC="fabric-samples/bin/orderer"

export REMOTE_ORDERER_DIR="orderer" # all transferred and process-generated files are here
export REMOTE_GENESIS_BLK="${REMOTE_ORDERER_DIR}/orderer.genesis.block"
export REMOTE_ORDERER_MSP_DIR="${REMOTE_ORDERER_DIR}/msp"
export REMOTE_ORDERER_TLS_DIR="${REMOTE_ORDERER_DIR}/tls"
export REMOTE_ORDERER_DATA_DIR="${REMOTE_ORDERER_DIR}/production"
export REMOTE_ORDERER_CONSENSUS_WAL_DIR="${REMOTE_ORDERER_DIR}/production/wir"
export REMOTE_ORDERER_CONSENSUS_SNAP_DIR="${REMOTE_ORDERER_DIR}/production/snap"
export REMOTE_ORDERER_LOG="${REMOTE_ORDERER_DIR}/log"

export REMOTE_PEER_DIR="peer"  # all transferred and process-generated files are here
export REMOTE_PEER_MSP_DIR="${REMOTE_PEER_DIR}/msp"
export REMOTE_PEER_TLS_DIR="${REMOTE_PEER_DIR}/tls"
export REMOTE_PEER_DATA_DIR="${REMOTE_PEER_DIR}/production"
export REMOTE_PEER_LOG="${REMOTE_PEER_DIR}/log"

function internal_ip() {
    local zone="${1}"
    local instance="${2}"
    gcloud compute instances describe "${instance}"  \
	--zone="${zone}" \
	--format='get(networkInterfaces[0].networkIP)'
}

function external_ip() {
    local zone="${1}"
    local instance="${2}"
    gcloud compute instances describe "${instance}"  \
	--zone="${zone}" \
	--format='get(networkInterfaces[0].accessConfigs[0].natIP)'
}

function cecho(){
    RED="\033[0;31m"
    GREEN="\033[0;32m"
    YELLOW="\033[1;33m"
    # ... ADD MORE COLORS
    NC="\033[0m" # No Color
    # ZSH
    # printf "${(P)1}${2} ${NC}\n"
    # Bash
    printf "${!1}${2} ${NC}\n"
}
