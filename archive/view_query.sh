#!/bin/bash

set -o nounset
# Exit on error. Append || true if you expect an error.
set -o errexit
# Exit on error inside any functions or subshells.
set -o errtrace
# Catch the error in case mysqldump fails (but gzip succeeds) in `mysqldump |gzip`
set -o pipefail
# Turn on traces, useful while debugging but commented out by default
# set -o xtrace

# IFS=$'\t\n'    # Split on newlines and tabs (but not on spaces)

# Global variables
[[ -n "${__SCRIPT_DIR+x}" ]] || readonly __SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -n "${__SCRIPT_NAME+x}" ]] || readonly __SCRIPT_NAME="$(basename -- $0)"

CHANNEL="viewchannel"
NETWORK_DIR="viewnetwork2"
PEER_COUNT=2

function network_up() {

    # CC_NAMES="$1"
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
    ENDORSE_POLICY="OR($(join_by , $ALL_ORG))"

    for CC_NAME in "$@"
    do
        ./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 
    done    
}

function network_down() {
    python network.py ${NETWORK_DIR} off
}


function run() {
    mode="$1"
    revocable_mode="$2"
    txn_count=$3
    batch_size=$4

    result_dir="result/$(date +%d-%m)"
    log_dir="result/$(date +%d-%m)/log"
    log_file="${log_dir}/viewquery_${mode}_${revocable_mode}_${txn_count}txns.log"

    mkdir -p ${log_dir}

    if [[ $revocable_mode == "incontract" ]]; then
        network_up onchainview
    else
        network_up secretcontract viewstorage 
    fi
    echo ""
    echo "Log to ${log_file}, results: "
    node view_query.js ${mode} ${revocable_mode} ${txn_count} ${batch_size} > ${log_file} 2>&1
    tail -2 ${log_file}

    network_down
}

# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: view_query.sh [txn_count]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    txn_count=$1
    batch_size=50

    for mode in "encryption" ; do
        for revocable_mode in "irrevocable"; do

    # for mode in "hash" "encryption" ; do
    #     for revocable_mode in "revocable" "irrevocable" "incontract"; do
            run ${mode} ${revocable_mode} ${txn_count} ${batch_size}
        done
    done

    # parse result

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0