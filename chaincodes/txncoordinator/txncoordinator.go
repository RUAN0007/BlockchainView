/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// TxnCoordinator provides functions for managing a car
type TxnCoordinator struct {
	contractapi.Contract
}

func (t *TxnCoordinator) Prepare(ctx contractapi.TransactionContextInterface, txId string, secret string) error {
	stub := ctx.GetStub()
	if err := stub.PutState(txId, []byte("Prepared")); err != nil {
		return fmt.Errorf("fail to prepare txn %s", txId)
	}
	if err := stub.PutState(txId+"_secret", []byte(secret+"_lock")); err != nil {
		return fmt.Errorf("fail to prepare record for %s", txId)
	}
	fmt.Printf("Prepare request for txn %s\n", txId)
	return nil
}

func (t *TxnCoordinator) Commit(ctx contractapi.TransactionContextInterface, txId string, secret string) error {
	stub := ctx.GetStub()
	if err := stub.PutState(txId, []byte("Committed")); err != nil {
		return fmt.Errorf("fail to commit txn %s", txId)
	}
	if err := stub.PutState(txId+"_secret", []byte(secret)); err != nil {
		return fmt.Errorf("fail to commit record for %s", txId)
	}
	fmt.Printf("Commit request for txn %s\n", txId)
	return nil
}

func main() {

	chaincode, err := contractapi.NewChaincode(new(TxnCoordinator))

	if err != nil {
		fmt.Printf("Error create txncoordinator chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting txncoordinator chaincode: %s", err.Error())
	}
}
