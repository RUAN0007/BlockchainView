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

IFS=$'\t\n'    # Split on newlines and tabs (but not on spaces)

# Global variables
[[ -n "${__SCRIPT_DIR+x}" ]] || readonly __SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -n "${__SCRIPT_NAME+x}" ]] || readonly __SCRIPT_NAME="$(basename -- $0)"

function runExp() {
    workload_file="$1"
    process_count=$2
    echo "================================================="
    echo "Launch cross-chain invocation with ${process_count} processes"
    for i in $(seq ${process_count}) 
    do
        result_file="result/$(basename ${workload_file} .json)_cross_${i}"
        echo "    Client process ${i} logs at ${result_file}"
        node supply_chain_across.js ${workload_file} > ${result_file} 2>&1 &
    done

    echo "Wait for finishing child processes"
    wait
    echo "Aggregate results"

    total_thruput=0
    avg_batch_delay_sum=0
    for i in $(seq ${process_count}) 
    do
        result_file="result/$(basename ${workload_file} .json)_cross_${i}"
        metric_line="$(tail -1 ${result_file})" 

        IFS=' ' read -ra tokens <<< "${metric_line}"
        latency=${tokens[8]}
        app_txn_count=${tokens[13]}
        batch_delay=${tokens[21]}
        thruput=$((${app_txn_count}*1000/${latency}))
        echo "    result_${i}: duration: ${latency} ms, app_txn_count: ${app_txn_count}, thruput: ${thruput}, avg batch delay: ${batch_delay} ms"
        avg_batch_delay_sum=$((${avg_batch_delay_sum}+${batch_delay}))
        total_thruput=$((${total_thruput}+${thruput}))
    done
    echo "Total Thruput: ${total_thruput} tps, avg batch delay: $((${avg_batch_delay_sum}/${process_count})) ms"

}


# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: cross_exp.sh [workload_file]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    # for i in 1 2 4 8 16 32 ; do
    for i in 32 ; do
        runExp "$1" ${i}
    done

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0