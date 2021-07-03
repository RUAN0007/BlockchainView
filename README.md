# Directory Intro
## Chaincodes
This directory contains chaincode(smart contract) source codes in golang:
* [onchainview](chaincodes/onchainview):the _ViewInContract_ implementations
* [secretcontract](chaincodes/secretcontract): the contract with data privacy support for the supply chain in the experiment. 
* [txncoordinator](chaincodes/txncoordinator): the contract to simulate 2PC.
* [viewstorage](chaincodes/viewstorage): the contract for immutable storage of irrevocable views. 
## Workload
This directory contains the workload-related files and scripts. 
* [batch_workload.py](workload/batch_workload.py): the workload generator script
* [batch_100items_25batchsize.json](workload/batch_100items_25batchsize.json): the generated workload used in all experiments. 

## Framework
This directory contains our view framework source codes. 
* [crosschain.js](framework/crosschain.js): the front end driver for _txncoordinator_ contract. 
* [crypto_mgr.js](framework/crypto_mgr.js): the javascript library for cryptographic operations. 
* [fabricsupport.js](framework/fabricsupport.js): the front end driver to contact with Fabric network. It contains two implementations, _FabricSupport_ for revocable and irrevocable view managements, and _NewFabricSupport_ for the _ViewInContract_ view management. 
* [encryptionbased_view.js](framework/encryptionbased_view.js): the implementation for encryption-based view management. 
* [hashbased_view.js](framework/hashbased_view.js): the implementation for hash-based view management. 
* [view_demo.js](framework/view_demo.js): the end-to-end demo for revocable/irrevocable view managements. 
* [new_view_demo.js](framework/new_view_demo.js): the end-to-end demo for _ViewInContract_ view management.

## Experiment
This directory contains the experimental scripts. 
### 2PC Baseline
* The performance(Throughput/Latency) is measured with [cross_exp.sh](experiment/cross_exp.sh) and [supply_chain_across.js](experiment/supply_chain_across.js).
* The storage is measured with [storage_cross.sh](experiment/storage_cross.sh) and [supply_chain_across_part.js](experiment/supply_chain_across_part.js).
### Ours
* The performance(Throughput/Latency) is measured with [view_exp.sh](experiment/view_exp.sh) and [supply_chain_view.js](experiment/supply_chain_view.js).
* The storage is measured with [view_storage.sh](experiment/view_storage.sh) and [supply_chain_view.js](experiment/supply_chain_view.js).
### View Scalability of ViewInContract
Both performance and storage are measured with [view_scale.sh](experiment/view_scale.sh) and [view_scalability.js](experiment/view_scalability.js).

## Other
The above codes may invoke the following scripts, which perform common tasks, such as the network setup, contract deployment, log analysis, measurement aggregation, etc. For anonymity, we decide not to disclose them. 
* network.py
* setup_channel.sh
* deployCC.sh
* measure_block.py
* aggregate_storage.py