/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Persistant Data Structures:

// view_txns : [$view_name1 -> [$txn_id1, $txn_id2, ...], $view_name2->[]]

// view_predicates : [$view_name1 -> $predicate1, $view_name2 -> $predicate2]

// txn_privates : [$txn_id1 -> $secret_part1(encrpytion-based or hash based), $txn_id2 -> $secret_part2]

type OnChainView struct {
	contractapi.Contract
}

// Func RetrieveTxnIdsByView(viewName):
//     Return view_txns[view_name];
func (t *OnChainView) RetrieveTxnIdsByView(ctx contractapi.TransactionContextInterface, viewName string) string {
	view_txns := map[string][]string{}
	stub := ctx.GetStub()
	// view_txns {lessthan10 => [txId1]}
	if view_txns_data, err := stub.GetState("view_txns"); err != nil {
		return fmt.Sprintf("fail to get view_txns_data with err %s", err.Error())
	} else if view_txns_data == nil {
		// do nothing
	} else if err := json.Unmarshal(view_txns_data, &view_txns); err != nil {
		return fmt.Sprintf("fail to unmarshal view_txns_data with err msg %s", err.Error())
	}
	fmt.Printf("Attempt to retrieve txnIds for view %s from [%v]\n", viewName, view_txns)
	if txnIds, ok := view_txns[viewName]; ok {
		fmt.Printf("  Obtain txnIds [%v]\n", txnIds)
		// [t1]
		marshalled, _ := json.Marshal(txnIds)
		return string(marshalled)
	} else {
		return "[]"
	}
}

// CreateView can be constrained to be called by view owner only.
// Refer to https://hyperledger-fabric.readthedocs.io/en/release-2.2/access_control.html
// Func CreateView(viewName, viewPredicate):
//     view_predicates[viewName] = viewPredicate;
//     view_txns[viewName] = [];
func (t *OnChainView) CreateView(ctx contractapi.TransactionContextInterface, viewName, viewPredicate string) error {
	stub := ctx.GetStub()
	view_predicates := map[string]string{} // viewName -> viewPrediacte
	if view_predicates_data, err := stub.GetState("view_predicates"); err != nil {
		return fmt.Errorf("fail to get view_predicates_data with err %s", err.Error())
	} else if view_predicates_data == nil {
		// do nothing
	} else if err := json.Unmarshal(view_predicates_data, &view_predicates); err != nil {
		return fmt.Errorf("fail to unmarshal view_predicates_data with err msg %s", err.Error())
	}

	view_txns := map[string][]string{} // view_txns -> {txId1, txId2}
	if view_txns_data, err := stub.GetState("view_txns"); err != nil {
		return fmt.Errorf("fail to get view_txns_data with err %s", err.Error())
	} else if view_txns_data == nil {
		// do nothing
	} else if err := json.Unmarshal(view_txns_data, &view_txns); err != nil {
		return fmt.Errorf("fail to unmarshal view_txns_data with err msg %s", err.Error())
	}

	view_predicates[viewName] = viewPredicate
	fmt.Printf("Put predicate %s to view %s\n", viewPredicate, viewName)
	view_txns[viewName] = make([]string, 0)

	if view_predicates_data, err := json.Marshal(view_predicates); err != nil {
		return fmt.Errorf("fail to marshal view_predicates_data with error msg %s", err.Error())
	} else if err := stub.PutState("view_predicates", view_predicates_data); err != nil {
		return fmt.Errorf("fail to put view predicates")
	}

	if view_txns_data, err := json.Marshal(view_txns); err != nil {
		return fmt.Errorf("fail to marshal view_txns_data with error msg %s", err.Error())
	} else if err := stub.PutState("view_txns", view_txns_data); err != nil {
		return fmt.Errorf("fail to put view_txns_data")
	}

	return nil
}

const TxnPrvPrefix = "TxnPrv"

// Can be called by anyone.
// Func GetPrivateArg(txnID):
//     return txn_privates[txnID];
func (t *OnChainView) GetPrivateArg(ctx contractapi.TransactionContextInterface, txnId, private_arg string) string {
	stub := ctx.GetStub()
	if val, err := stub.GetState(TxnPrvPrefix + txnId); err != nil {
		return ""
	} else {
		return string(val)
	}
}

//Func InvokeTxn(txnID, pub_arg, private_arg):
//  private_arg is either hash protected, or encryption-protected.
//
//  txn_privates[txnId]=private_args
//  for viewName, viewPredicate in view_predicates:
//     if viewPredicate.satisfied(pub_arg, txnId):
//         view_txns[viewName].push(txnId);

func (t *OnChainView) InvokeTxn(ctx contractapi.TransactionContextInterface, pub_arg, private_arg string) error {
	txnId := ctx.GetStub().GetTxID()
	stub := ctx.GetStub()

	_ = stub.PutState(TxnPrvPrefix+txnId, []byte(private_arg))

	view_predicates := map[string]string{} //viewName -> viewPredicate
	if view_predicates_data, err := stub.GetState("view_predicates"); err != nil {
		return fmt.Errorf("fail to get view_predicates_data with err %s", err.Error())
	} else if view_predicates_data == nil {
		// do nothing
	} else if err := json.Unmarshal(view_predicates_data, &view_predicates); err != nil {
		return fmt.Errorf("fail to unmarshal view_predicates_data with err msg %s", err.Error())
	}

	view_txns := map[string][]string{} // viewName -> [txnIDs, TxID2]
	if view_txns_data, err := stub.GetState("view_txns"); err != nil {
		return fmt.Errorf("fail to get view_txns_data with err %s", err.Error())
	} else if view_txns_data == nil {
		// do nothing
	} else if err := json.Unmarshal(view_txns_data, &view_txns); err != nil {
		return fmt.Errorf("fail to unmarshal view_txns_data with err msg %s", err.Error())
	}

	for view_name, view_predicate := range view_predicates {
		fmt.Printf("ViewName=[%s], view_predicate=[%s]\n", view_name, view_predicate)
		if t.satisfy(pub_arg, view_predicate) {
			fmt.Printf("pub_arg=[%s], YES, INCLUDE TxnId %s\n", pub_arg, txnId)
			view_txns[view_name] = append(view_txns[view_name], txnId)
		} else {
			fmt.Printf("pub_arg=[%s], NO\n", pub_arg)
		}
	}
	// view_txn: {lessthan10->[]}
	// view_txn: {lessthan10-[t1]}

	if view_txns_data, err := json.Marshal(view_txns); err != nil {
		return fmt.Errorf("fail to marshal view_txns_data with error msg %s", err.Error())
	} else if err := stub.PutState("view_txns", view_txns_data); err != nil {
		return fmt.Errorf("fail to put view predicates")
	}

	// do real contracts here. Real txn logic happens here.
	return nil
}

// view inclusion logic.
func (t *OnChainView) satisfy(pub_arg string, predicate string) bool {
	arg, _ := strconv.Atoi(pub_arg)
	tokens := strings.Split(predicate, " ")
	condition := tokens[0]
	threshold, _ := strconv.Atoi(tokens[1])
	if condition == "<" {
		fmt.Printf(" smaller than threshold=%d\n", threshold)
		return arg < threshold
	} else if condition == ">" {
		fmt.Printf(" greater than threshold=%d\n", threshold)
		return arg > threshold
	} else if condition == "=" {
		fmt.Printf(" equal to threshold=%d\n", threshold)
		return arg == threshold
	} else {
		fmt.Printf("Unrecognized condtion %s \n", condition)
	}

	return false
}

func main() {

	chaincode, err := contractapi.NewChaincode(new(OnChainView))

	if err != nil {
		fmt.Printf("Error create viewstorage chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting viewstorage chaincode: %s", err.Error())
	}
}

// Analysis:
// Soundness (Case I): the view validation is achieved by smart contracts, which must undergo the consensus from the majority.

// Soundness (Case II): the user can pull the private args, either hash protected or encrpytion-protected, to validate the secret data is tamper-free.

// Completeness (Case III): subject to view owners InvokeTxn or not.
//   Can not force owners to invoke,
//   client T > Blockchain (InvokeTxn)

// Nothing is missing.
// If Txn T satisfies View V by definitions, then V must include T.
// Can be tested by any one, as the ledger is public auditable, except that it is inefficient.
