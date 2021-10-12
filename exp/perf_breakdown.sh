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

ORG_DIR="../test-network/organizations/peerOrganizations/org1.example.com"
PEER_COUNT=2
CHANNEL_NAME="viewchannel"

. env.sh
SCRIPT_NAME=$(basename $0 .sh)

function network_channel_up() {
    pushd ../test-network > /dev/null 2>&1
    ./network.sh up
    ./network.sh createChannel -c ${CHANNEL_NAME}
    popd  > /dev/null 2>&1
}

function deploy_chaincode() {
    pushd ../test-network > /dev/null 2>&1
    chaincode_name="$1"
    peer_count=$2
    all_org=""
    for i in $(seq ${peer_count})
    do
        all_org="$all_org 'Org${i}MSP.peer'"
    done

    function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }
    endorse_policy="OR($(join_by , $all_org))"

    ./network.sh deployCC -c ${CHANNEL_NAME} -ccl go -ccn ${chaincode_name} -ccp ../chaincodes/${chaincode_name} -ccep ${endorse_policy} -cccg ../chaincodes/${chaincode_name}/collection_config.json
    popd  > /dev/null 2>&1
}

function network_down() {
    pushd ../test-network > /dev/null 2>&1
    ./network.sh down
    popd  > /dev/null 2>&1
}

function run_exp() {
    workload_file="$1"
    hiding_scheme="$2"
    view_mode="$3"
    workload_chaincodeID="$4"
    client_count=$5

    if [[ "$view_mode" == "${MOCK_MODE}" ]] ; then
        echo "Mock Fabric Mode does not spin up the network..."
    else
        network_channel_up 
        deploy_chaincode ${workload_chaincodeID} ${PEER_COUNT}
    fi

    result_dir="result/$(date +%d-%m)"
    log_dir="log/$(date +%d-%m)"
    mkdir -p ${log_dir}
    mkdir -p ${result_dir}

    echo "========================================================="
    echo "Start launching ${client_count} client processes with data hiding scheme : ${hiding_scheme}, view mode : ${view_mode}, workload_chaincodeID : ${workload_chaincodeID}."
    for i in $(seq ${client_count}) 
    do
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${hiding_scheme}_${view_mode}_${workload_chaincodeID}_${i}.log"
        echo "    Client ${i} log at ${log_file}"
        node supplychain.js ${ORG_DIR} ${workload_file} ${hiding_scheme} ${view_mode} ${CHANNEL_NAME} ${workload_chaincodeID} > ${log_file} 2>&1 &
    done

    echo "Wait for finishing client processes"
    wait

    aggregated_result_file="${result_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${hiding_scheme}_${view_mode}_${workload_chaincodeID}_${client_count}clients"

    echo "=========================================================="
    echo "Aggregate client results " | tee ${aggregated_result_file}

    total_thruput=0
    total_batch_delay=0
    for i in $(seq ${client_count}) 
    do
        # Must be identical to the above
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${hiding_scheme}_${view_mode}_${workload_chaincodeID}_${i}.log"

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

    avg_batch_delay=$((${total_batch_delay}/${client_count}))
    echo "Total Thruput(tps): ${total_thruput} tps, Batch Delay(ms): ${avg_batch_delay}" | tee -a ${aggregated_result_file}
    echo "=========================================================="

    if [[ "$view_mode" == "${MOCK_MODE}" ]] ; then
        echo "Mock Fabric Mode does not turn down the network..."
    else
        network_down
    fi
}


# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: perf_end2end.sh [workload_path]" >&2 
       exit 1
    fi
    pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    
    workload_file="$1"
    for client_count in 2 4 8 16 32; do
    # for client_count in 1; do
        # Encrpytion-based ViewInContractMode
        run_exp ${workload_file} "${ENCRYPTION_SCHEME}" "${VIEWINCONTRACT_MODE}" "onchainview" ${client_count}

        # Evaluate the encryption key generation speed by decoupling from the underneath fabric network
        run_exp ${workload_file} "${ENCRYPTION_SCHEME}" "${MOCK_MODE}" "onchainview" ${client_count}

        # Evaluate the throughput only for the supply chain workload, without the add-on view managements. 
        run_exp ${workload_file} "${PLAIN_SCHEME}" "${ONLYWORKLOAD_MODE}" "secretcontract" ${client_count}

        # Evaluate the raw Fabric throughput, where transactions do nothing, i.e., no data processing at all. 
        run_exp ${workload_file} "${PLAIN_SCHEME}" "${ONLYWORKLOAD_MODE}" "noop" ${client_count}
    done

    popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0