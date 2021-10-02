/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Persistant Data Structures:

// view_txns : [$view_name1 -> [$txn_id1, $txn_id2, ...], $view_name2->[]]

// view_predicates : [$view_name1 -> $predicate1, $view_name2 -> $predicate2]

// txn_privates : [$txn_id1 -> $secret_part1(encrpytion-based or hash based), $txn_id2 -> $secret_part2]

type Noop struct {
	contractapi.Contract
}

func (t *Noop) CreateView(ctx contractapi.TransactionContextInterface, viewName, viewPredicate, mergePeriod string) error {
	return nil
}

func (t *Noop) InvokeTxn(ctx contractapi.TransactionContextInterface, pub_arg, private_arg string) error {
	return nil
}

func main() {

	chaincode, err := contractapi.NewChaincode(new(Noop))

	if err != nil {
		fmt.Printf("Error create viewstorage chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting viewstorage chaincode: %s", err.Error())
	}
}
