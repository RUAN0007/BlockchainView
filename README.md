# Overview
The guide reproduces key experiments of the blockchain view project on a fabric network.
The network runs in a docker network on a local machine. 
The network consists of two peers and one orderer. 
Two peers are from distinct organizations. 

## My Running Env (RPC)
```
$ go version
go version go1.13.9 darwin/amd64

$ node --version
v13.13.0

$ npm --version
6.14.4

$ docker-compose version
docker-compose version 1.28.5, build c4eb3a1f
docker-py version: 4.4.4
CPython version: 3.9.0
OpenSSL version: OpenSSL 1.1.1h  22 Sep 2020

```

```
$ docker version
Client: Docker Engine - Community
 Version:           19.03.12
 API version:       1.40
 Go version:        go1.13.10
 Git commit:        48a66213fe
 Built:             Mon Jun 22 15:41:33 2020
 OS/Arch:           darwin/amd64
 Experimental:      false

Server: Docker Engine - Community
 Engine:
  Version:          19.03.12
  API version:      1.40 (minimum version 1.12)
  Go version:       go1.13.10
  Git commit:       48a66213fe
  Built:            Mon Jun 22 15:49:27 2020
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v1.2.13
  GitCommit:        7ad184331fa3e55e52b890ea95e65ba581ae3429
 runc:
  Version:          1.0.0-rc10
  GitCommit:        dc9208a3303feef5b3839f4323d9beb36df0a9dd
 docker-init:
  Version:          0.18.0
  GitCommit:        fec3683

```

# Download Docker Images and Binary
```
# Under project root directory
fabric_version="2.2.4"
ca_version="1.5.2"

# According to https://hyperledger-fabric.readthedocs.io/en/release-2.2/install.html,
#   the script will download fabric binaries and docker images
curl -sSL https://bit.ly/2ysbOFE | bash -s -- ${fabric_version} ${ca_version}

# Pull out bin/ with binaries and config/ with config files
cp -r fabric-samples/bin . 
cp -r fabric-samples/config . 

# Make binaries accessible on $PATH
export PATH="$(pwd)/bin:${PATH}"

# Install front end
npm install
```

**NOTE**: 
* This preparation setup only requires for once. 
* Can inspect downloaded docker images with `docker images |grep hyperledger`

# Launch the Test Network
## Spin up the processes
The network runs in docker with two peers and one orderer. [The docker-compose config file](test-network/docker/docker-compose-test-net.yaml) reveals more info. 
```
cd test-network/
./network.sh up
```

Can inspect the running docker containers with `docker ps`

## Set up a Channel
```
# Still under test-network/
CHANNEL="viewchannel"
./network.sh createChannel -c ${CHANNEL}
```

## Deploy a Chaincode
```
# Still under test-network/

PEER_COUNT=2
ALL_ORG=""
for i in $(seq ${PEER_COUNT})
do
   ALL_ORG="$ALL_ORG 'Org${i}MSP.peer'"
done

function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }

ENDORSE_POLICY="OR($(join_by , $ALL_ORG))" # Result into "OR(Org1MSP.peer,Org2MSP.peer)"

CC_NAME="noop"
./network.sh deployCC -c ${CHANNEL} -ccl go -ccn ${CC_NAME} -ccp ../chaincodes/${CC_NAME} -ccep ${ENDORSE_POLICY}

CC_NAME="privateonchainview"
./network.sh deployCC -c ${CHANNEL} -ccl go -ccn ${CC_NAME} -ccp ../chaincodes/${CC_NAME} -ccep ${ENDORSE_POLICY} -cccg ../chaincodes/${CC_NAME}/collection_config.json
```


## Shut down the network
```
./network.sh down
```






