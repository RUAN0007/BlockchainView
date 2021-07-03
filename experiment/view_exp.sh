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

    local CC_NAME="secretcontract"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}" 

    CC_NAME="onchainview"
    ./deployCC.sh ${NETWORK_DIR} ${CHANNEL} ${CC_NAME} "${ENDORSE_POLICY}" 

    CC_NAME="txncoordinator"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}" 

    CC_NAME="viewstorage"
    ./deployCC.sh "${NETWORK_DIR}" "${CHANNEL}" "${CC_NAME}" "${ENDORSE_POLICY}"
}

function network_down() {
    python network.py ${NETWORK_DIR} off
}


function run_supplychain() {
    network_up

    workload_file="$1"
    mode="$2"
    revocable_mode="$3"
    process_count=$4
    result_dir="result/$(date +%d-%m)"
    log_dir="result/$(date +%d-%m)/log"
    mkdir -p ${log_dir}
    echo "========================================================="
    echo "Start launching ${process_count} client processes for ${mode} ${revocable_mode}."
    for i in $(seq ${process_count}) 
    do
        log_file="${log_dir}/$(basename ${workload_file} .json)_${mode}_${revocable_mode}_${i}.log"
        echo "    Process ${i} log at ${log_file}"
        node supply_chain_view.js ${workload_file} ${mode} ${revocable_mode} > ${log_file} 2>&1 &
    done

    echo "Wait for finishing child processes"
    wait

    aggregated_result_file="${result_dir}/$(basename ${workload_file} .json)_${mode}_${revocable_mode}_${process_count}processes"

    echo "=========================================================="
    echo "=========================================================="
    echo "Aggregate results" | tee ${aggregated_result_file}

    total_thruput=0
    total_batch_delay=0
    for i in $(seq ${process_count}) 
    do
        # Must be identical to the above
        log_file="${log_dir}/$(basename ${workload_file} .json)_${mode}_${revocable_mode}_${i}.log"

        last_line="$(tail -1 ${log_file})" 
        IFS=' ' read -ra tokens <<< "${last_line}"
        latency=${tokens[3]} # ms units
        app_txn_count=${tokens[9]}
        committed_count=${tokens[14]}
        batch_delay=${tokens[20]}

        thruput=$((${committed_count}*1000/${latency})) # tps
        total_batch_delay=$((${total_batch_delay}+${batch_delay}))
        echo "    result_${i}: total_duration: ${latency} ms, app_txn_count: ${app_txn_count}, committed_count: ${committed_count} thruput: ${thruput} avg batch delay: ${batch_delay}" | tee -a ${aggregated_result_file} 
        total_thruput=$((${total_thruput}+${thruput}))
    done
    avg_batch_delay=$((${total_batch_delay}/${process_count}))
    echo "Total Thruput(tps): ${total_thruput} tps, Batch Delay(ms): ${avg_batch_delay}" | tee -a ${aggregated_result_file}
    echo "=========================================================="
    echo "=========================================================="

    network_down
}

# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: view_exp.sh [workload_file]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    for mode in "encryption" "hash" ; do
        # for revocable_mode in "revocable" "irrevocable" "incontract"; do
        # So far, supply_chain_view.js is only compatible for ViewInContract, rather than revocable/irrevocable views. 
        for revocable_mode in "incontract"; do
            for process_count in 1 2 4 8 16 32; do
                run_supplychain ${workload_file} ${mode} ${revocable_mode} ${process_count}
            done
        done
    done

    # parse result

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0