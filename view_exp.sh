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


function run() {
    workload_file="$1"
    mode="$2"
    revocable="$3"
    process_count=$4
    echo "========================================================="
    echo "Start launching ${process_count} client processes for ${mode} ${revocable}."
    for i in $(seq ${process_count}) 
    do
        result_file="result/$(basename ${workload_file} .json)_${mode}_${revocable}_${i}"
        echo "    Process ${i} log at ${result_file}"
        node supply_chain_view.js ${workload_file} ${mode} ${revocable} > ${result_file} 2>&1 &
    done

    echo "Wait for finishing child processes"
    wait
    echo "Aggregate results"

    total_thruput=0
    total_batch_delay=0
    for i in $(seq ${process_count}) 
    do
        # Must be identical to the above
        result_file="result/$(basename ${workload_file} .json)_${mode}_${revocable}_${i}"
        metric_line="$(tail -1 ${result_file})" 

        IFS=' ' read -ra tokens <<< "${metric_line}"
        latency=${tokens[3]} # ms units
        app_txn_count=${tokens[9]}
        batch_delay=${tokens[15]}

        thruput=$((${app_txn_count}*1000/${latency})) # tps
        total_batch_delay=$((${total_batch_delay}+${batch_delay}))
        echo "    result_${i}: total_duration: ${latency} ms, app_txn_count: ${app_txn_count}, thruput: ${thruput} avg batch delay: ${batch_delay}"
        total_thruput=$((${total_thruput}+${thruput}))
    done
    avg_batch_delay=$((${total_batch_delay}/${process_count}))
    echo "Total Thruput(tps): ${total_thruput} tps, Batch Delay(ms): ${avg_batch_delay}"

}

# The main function
main() {
    if [[ $# < 1 ]]; then 
       echo "Insufficient arguments, expecting at least 1, actually $#" >&2 
       echo "    Usage: view_peak_thruput.sh [workload_file]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    workload_file="$1"
    for mode in "encryption" "hash" ; do
        for revocable in "revocable" "irrevocable"; do
            # for process_count in 1 2 4 8 16; do
            for process_count in 32; do
                run ${workload_file} ${mode} ${revocable} ${process_count}
            done
        done
    done

    # parse result

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0