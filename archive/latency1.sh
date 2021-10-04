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
[[ -n "${__SCRIPT_NAME+x}" ]] || readonly __SCRIPT_NAME="$(basename -- "${0}")"


# The main function
main() {
    if [[ "${#}" < 0 ]]; then 
       echo "Insufficient arguments, expecting at least 0, actually ${#}" >&2 
       echo "    Usage: latency.sh" >&2 
       exit 1
    fi
    # pushd ${__SCRIPT_DIR} > /dev/null 2>&1
    # for i in 1 2 4 6 8 10; do
    for i in 6 8 10; do
        file_path="data/${i}items.json" 
        for mode in "encryption" "hash" ; do
            for r in "revocable" "irrevocable" ; do
                echo "Run for ${i} items ${mode} ${r}"
                result_path="result/${i}items_${mode}_${r}.log"
                node supply_chain_view.js "${file_path}" "${mode}" "${r}" > "${result_path}"
            done
        done
        echo $"Run for ${i} items wit cross-chain baseline"
        node supply_chain_across.js "${file_path}" > "result/${i}items_across.log"
    done

    # popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "${0}" != "${BASH_SOURCE[0]}" ]] || exit 0