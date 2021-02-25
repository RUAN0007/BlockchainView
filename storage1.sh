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


# The main function
main() {
    if [[ "${#}" < 0 ]]; then 
       echo "Insufficient arguments, expecting at least 0, actually ${#}" >&2 
       echo "    Usage: latency.sh" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1

    local -r i=10
    local -r file_path="data/${i}items.json" 
    local result_path
    for mode in "encryption" "hash" ; do
        for r in "revocable" "irrevocable" ; do
            echo "Run for ${i} items ${mode} ${r}"

            start
            node supply_chain_view.js "${file_path}" "${mode}" "${r}"
            end 

            result_path="result/${i}items_${mode}_${r}.metrics"
            ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py 0" > "${result_path}"
        done
    done
    # echo $"Run for ${i} items wit cross-chain baseline"
    # start
    # node supply_chain_across.js "${file_path}"
    # end

    # result_path="result/${i}items_across.metrics"
    # ssh slave-4 "python ${__SCRIPT_DIR}/measure_block.py" > "${result_path}"

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "${0}" != "${BASH_SOURCE[0]}" ]] || exit 0