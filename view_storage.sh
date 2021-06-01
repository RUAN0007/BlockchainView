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
declare -gr NETWORK_DIR="viewnetwork2";
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


# The main function
main() {
    if [[ "${#}" < 2 ]]; then 
       echo "Insufficient arguments, expecting at least 2, actually ${#}" >&2 
       echo "    Usage: view_storage.sh [workload_path] [client count]" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1

    # local workload="$1"
    local -r workload_path="${1}"
    local result_path
    local -r client_count=$2
    # for mode in "encryption" "hash" ; do
    #     local r="revocable"
    #     start
    #     echo "=========================================================="
    #     echo "Run for workload ${workload_path} for ${mode} ${r} with ${client_count} processes"
    #     workload_base="$(basename "${workload_path}" .json)"

    #     for i in $(seq ${client_count}); do
    #         # local physicalViewCount=1
    #         local client_log="result/${workload_base}_${mode}_${r}_${i}.log"
    #         echo "    Client${i} logs at ${client_log}"
    #         node supply_chain_view.js "${workload_path}" "${mode}" "${r}"  > ${client_log} 2>&1 &
    #     done
    #     echo "Wait for client processes to finish"
    #     wait

    #     end 
    #     result_path="result/${workload_base}_${mode}_${r}.metrics"
    #     ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py 0" > "${result_path}"
    #     echo "Obtain peer metrics and logs at ${result_path}"
    #     cat ${result_path}
    # done


    # for mode in "encryption" "hash" ; do
    for mode in "hash" ; do
        local r="irrevocable"

        # for physicalViewCount in 1 4 7 14; do 
        for physicalViewCount in 4 ; do 
            start
            echo "=========================================================="
            echo "Run for workload ${workload_path} for ${mode} ${r} with ${client_count} processes and ${physicalViewCount} physical views"
            workload_base="$(basename "${workload_path}" .json)"

            for i in $(seq ${client_count}); do
                # local physicalViewCount=1
                local client_log="result/${workload_base}_${mode}_${r}_${i}.log"
                echo "    Client${i} logs at ${client_log}"
                node supply_chain_view.js "${workload_path}" "${mode}" "${r}" ${physicalViewCount} > ${client_log} 2>&1 &
            done
            echo "Wait for client processes to finish"
            wait

            end 
            result_path="result/${workload_base}_${mode}_${r}_${physicalViewCount}physicalviews.metrics"
            ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py 0" > "${result_path}"
            echo "Obtain peer metrics and logs at ${result_path}"
            cat ${result_path}
        done
    done










    # echo $"Run for ${i} items wit cross-chain baseline"
    # start
    # node supply_chain_across.js "${workload_path}"
    # end

    # result_path="result/${i}items_across.metrics"
    # ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py" > "${result_path}"

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "${0}" != "${BASH_SOURCE[0]}" ]] || exit 0