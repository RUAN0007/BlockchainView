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
[[ -n "${__SCRIPT_NAME+x}" ]] || readonly __SCRIPT_NAME="$(basename -- "${0}")"

declare -gr CHANNEL="viewchannel";
declare -gr NETWORK_DIR="viewnetwork";
declare -gr PEER_COUNT=2;

function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }

function start() {

    python network.py "${NETWORK_DIR}" "on"
    ./setup_channel.sh "${NETWORK_DIR}" "${CHANNEL}"

    local ALL_ORG=""
    for j in $(seq ${PEER_COUNT})
    do
        ALL_ORG="${ALL_ORG} 'Org${j}MSP.peer'"
    done

    ENDORSE_POLICY="AND($(join_by , ${ALL_ORG}))"
    # echo "ENDORSE_POLICY: ${ENDORSE_POLICY}"
    # read -p "Press enter to continue"


    local CC_NAME="secretcontract"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}" 

    CC_NAME="txncoordinator"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}" 

    CC_NAME="viewstorage"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}" 
}

function end() {
    python network.py "${NETWORK_DIR}" "off"
}

function runExp() {
    local -r node_count=$1
    local -r node_num=$2
    local -r i=10
    local -r file_path="data/${i}items.json" 

    echo $"Run for ${i} items with cross-chain baseline, simulating on Node ${node_num} with ${node_count} nodes."
    start
    node supply_chain_across_part.js "${file_path}" ${node_count} ${node_num}
    end

    local -r result_path="result/${i}items_across_${node_count}nodes_${node_num}.metrics"
    echo "Dump results to ${result_path}"
    ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py 0" > "${result_path}"
}


# The main function
main() {
    if [[ $# < 0 ]]; then 
       echo "Insufficient arguments, expecting at least 0, actually $#" >&2 
       echo "    Usage: storage_cross.sh" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1

    # for node_count in 1 4 7 14; do
    for node_count in 4 7 14; do
        last=$(($node_count-1))
        for node_num in $(seq 0 1 ${last}); do
            runExp ${node_count} ${node_num}
            # echo $node_num
        done
        # echo ""
    done
    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "${0}" != "${BASH_SOURCE[0]}" ]] || exit 0