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

function network_up() {
    peer_count=$1
    cc_name=$2 
    priv_col_path=${3:-""}

    network_dir="viewnetwork_p${peer_count}"
    python network.py ${network_dir} on

    # Set up the channel
    ./setup_channel.sh ${network_dir} ${CHANNEL}

    # Prepare to deploy the network
    ALL_ORG=""
    for i in $(seq ${peer_count})
    do
        ALL_ORG="$ALL_ORG 'Org${i}MSP.peer'"
    done

    function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }
    endorse_policy="OR($(join_by , $ALL_ORG))"

    ./deployCC.sh ${network_dir} ${CHANNEL} ${cc_name} ${endorse_policy} ${priv_col_path}
}

function network_down() {
    peer_count=$1
    network_dir="viewnetwork_p${peer_count}"
    python network.py ${network_dir} off
}

function run_exp() {

    workload_file="$1"
    peer_count=$2
    cc_name=$3 
    priv_col_path=${4:-""}

    mode="encryption"
    revocable_mode="incontract"
    process_count=32
    network_dir="viewnetwork_p${peer_count}"

    if [[ "$revocable_mode" == "fake_blockchain" ]]; then
        echo "not to spin up blockchain"    
    else
        network_up $peer_count ${cc_name} ${priv_col_path}
    fi

    result_dir="result/$(date +%d-%m)/priv_data_scale_result"
    log_dir="result/$(date +%d-%m)/priv_data_scale_log"
    mkdir -p ${result_dir}
    mkdir -p ${log_dir}
    echo "========================================================="
    echo "Start launching ${process_count} client processes for ${mode} ${revocable_mode} ${cc_name} on ${peer_count} peers."
    for i in $(seq ${process_count}) 
    do
        log_file="${log_dir}/$(basename ${workload_file} .json)_${peer_count}p_${cc_name}_${i}.log"
        echo "    Process ${i} log at ${log_file}"
        node supply_chain_view.js ${workload_file} ${mode} ${revocable_mode} ${network_dir} ${CHANNEL} ${cc_name} > ${log_file} 2>&1 &
    done

    echo "Wait for finishing child processes"
    wait

    aggregated_result_file="${result_dir}/$(basename ${workload_file} .json)_${cc_name}_${peer_count}peers"

    echo "=========================================================="
    echo "=========================================================="
    echo "Aggregate results" | tee ${aggregated_result_file}

    total_thruput=0
    total_batch_delay=0
    for i in $(seq ${process_count}) 
    do
        # Must be identical to the above
        log_file="${log_dir}/$(basename ${workload_file} .json)_${peer_count}p_${cc_name}_${i}.log"

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

    if [[ "$revocable_mode" == "fake_blockchain" ]]; then
        echo "not to spin off blockchain"    
    else
        network_down ${peer_count}
    fi
}

# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: priv_data_scale.sh [workload_file]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    workload_file="$1"

    for peer_count in 9; do
    # for peer_count in 3 5 7 9; do
        run_exp ${workload_file} ${peer_count} "privateonchainview" "./chaincodes/privateonchainview/collection_config.json"
        
        run_exp ${workload_file} ${peer_count} "onchainview"
    done

    # parse result

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0