#!/bin/bash

set -o nounset
# Exit on error. Append || true if you expect an error.
# set -o errexit
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
CC_NAME="onchainview"

function network_up() {

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

    ./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 
}

function network_down() {
    python network.py ${NETWORK_DIR} off
}

function run_verify() {

    txn_count=$1
    mode="encryption"
    revocable_mode="incontract"

    result_dir="result/$(date +%d-%m)"
    mkdir -p ${result_dir}
    aggregated_result_file="${result_dir}/${mode}_${revocable_mode}_${txn_count}txns"
    network_up

    echo "Result logged to ${aggregated_result_file}"
    # || true as view_verify may explicitly 0. 
    node view_verify.js ${mode} ${revocable_mode} ${txn_count} | tee ${aggregated_result_file}

    network_down
}

# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: view_verify.sh [txn_count]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    txn_count=$1

    run_verify ${txn_count}

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0