import config
import sys
import os
import time
import config

# These paths will be initialized in main() and utilized in other functions. 
ORDERER_GENESIS_BLK=""
ORDERER_LOCAL_TLSDIR_TEMPLATE=""
ORDERER_LOCAL_MSPDIR_TEMPLATE=""
PEER_LOCAL_MSPDIR_TEMPLATE=""
PEER_LOCAL_TLSDIR_TEMPLATE=""

cur_dir = os.path.dirname(os.path.abspath(__file__))
def restart_orderers(orderer_addrs):
    print "Removing orderers logs and data..."
    for orderer_addr in orderer_addrs:
        config.remote_rm(orderer_addr, config.ORDERER_LOG)
        config.remote_rm(orderer_addr, config.ORDERER_DATA)

    print "Starting orderers..."

    for orderer_addr in orderer_addrs:
        # Assume the orderer binary has the identical path in each orderer node, due to NFS.
        orderer_exec = os.path.join(cur_dir, "bin", "orderer")

        orderer_cmd = "FABRIC_CFG_PATH=" + config.FABRIC_CFG_DIR + " "
        # orderer_cmd += "ORDERER_GENERAL_LOGLEVEL=debug "
        orderer_cmd += "ORDERER_GENERAL_LISTENADDRESS=0.0.0.0 "
        orderer_cmd += "ORDERER_GENERAL_GENESISMETHOD=file "
        orderer_cmd += "ORDERER_GENERAL_GENESISFILE=" + ORDERER_GENESIS_BLK + " "
        orderer_cmd += "ORDERER_GENERAL_LOCALMSPID=OrdererMSP "
        orderer_cmd += "ORDERER_GENERAL_LOCALMSPDIR=" + ORDERER_LOCAL_MSPDIR_TEMPLATE.format(orderer_addr) + " "
        orderer_cmd += "ORDERER_GENERAL_TLS_ENABLED=true "

        orderer_cmd += "ORDERER_GENERAL_TLS_CLIENTAUTHREQUIRED=false "
        orderer_cmd += "ORDERER_GENERAL_TLS_PRIVATEKEY=" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "server.key") +  " "
        orderer_cmd += "ORDERER_GENERAL_TLS_CERTIFICATE=" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "server.crt") +  " "
        orderer_cmd += "ORDERER_GENERAL_TLS_ROOTCAS=[" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "ca.crt") +  "] "

        orderer_cmd += "ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY=" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "server.key") +  " "
        orderer_cmd += "ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE=" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "server.crt") +  " "
        orderer_cmd += "ORDERER_GENERAL_CLUSTER_ROOTCAS=[" + os.path.join(ORDERER_LOCAL_TLSDIR_TEMPLATE.format(orderer_addr), "ca.crt") +  "] "

        orderer_cmd += "ORDERER_FILELEDGER_LOCATION=" + config.ORDERER_DATA + " "
        orderer_cmd += "ORDERER_CONSENSUS_WALDIR=" + config.ORDERER_WALDIR + " "
        orderer_cmd += "ORDERER_CONSENSUS_SNAPDIR=" + config.ORDERER_SNAPDIR + " "
        orderer_cmd += " {} > ".format(orderer_exec) + config.ORDERER_LOG + " 2>&1 &"

        config.remote_cmd(orderer_addr, orderer_cmd)


def stop_orderers(orderer_addrs):
    print "Stop orderers..."
    for orderer_addr in orderer_addrs:
        config.remote_kill(orderer_addr, "orderer")


def restart_peers(peer_addrs):
    print "Remove peer's log and data..."
    for peer_addr in peer_addrs:
        config.remote_rm(peer_addr, config.PEER_LOG)
        config.remote_rm(peer_addr, config.PEER_DATA)

    print "Start peers..."

    peerID = 1
    for peer_addr in peer_addrs:
        peer_cmd = "FABRIC_CFG_PATH=" + config.FABRIC_CFG_DIR + " "
        # peer_cmd += "CORE_LOGGING_PEER=debug "
        peer_cmd += "CORE_PEER_ENDORSER_ENABLED=true "
        # peer_cmd += "CORE_LOGGING_LEVEL=INFO "
        peer_cmd += "CORE_PEER_GOSSIP_USELEADERELECTION=true "
        peer_cmd += "CORE_PEER_GOSSIP_ORGLEADER=false "
        peer_cmd += "CORE_PEER_ID={}.org{}.example.com ".format(peer_addr, peerID)
        peer_cmd += "CORE_PEER_ADDRESS={}:{} ".format(peer_addr, config.PEER_PORT)
        peer_cmd += "CORE_PEER_GOSSIP_EXTERNALENDPOINT={}:{} ".format(peer_addr, config.PEER_PORT)
        peer_cmd += "CORE_PEER_LOCALMSPID=Org{}MSP ".format(peerID)
        peer_cmd += "CORE_PEER_MSPCONFIGPATH=" + PEER_LOCAL_MSPDIR_TEMPLATE.format(peerID, peer_addr, peerID) + " "
        peer_cmd += "CORE_PEER_FILESYSTEMPATH=" + config.PEER_DATA + " "

        # peer_cmd += "FABRIC_LOGGING_SPEC=DEBUG "
        peer_cmd += "CORE_PEER_TLS_ENABLED=true "

        peer_cmd += "CORE_PEER_TLS_CLIENTAUTHREQUIRED=false "
        peer_cmd += "CORE_PEER_TLS_KEY_FILE=" + os.path.join(PEER_LOCAL_TLSDIR_TEMPLATE.format(peerID, peer_addr, peerID), "server.key") +  " "
        peer_cmd += "CORE_PEER_TLS_CERT_FILE=" + os.path.join(PEER_LOCAL_TLSDIR_TEMPLATE.format(peerID, peer_addr, peerID), "server.crt") +  " "
        peer_cmd += "CORE_PEER_TLS_ROOTCERT_FILE=" + os.path.join(PEER_LOCAL_TLSDIR_TEMPLATE.format(peerID, peer_addr, peerID), "ca.crt") + " "
        peer_cmd += "{} node start > ".format(config.peer_exec) + config.PEER_LOG + " 2>&1 &"

        config.remote_cmd(peer_addr, peer_cmd)
        peerID = peerID + 1


def stop_peers(peer_addrs):
    print "Stop peers..."
    for peer_addr in peer_addrs:
        config.remote_kill(peer_addr, "peer")


def main():
    if len(sys.argv) < 2:
        print "python network.py <artifact_dir> on: freshly Launch the fabric network"
        print "python network.py <artifact_dir> off: Bring down the fabric network"
        return

    artifact_dir = os.path.abspath(sys.argv[1])
    blkSize = 0
    if not os.path.isdir(artifact_dir):
       print "Artifact Directory {} Not Found".format(artifact_dir)
       return
    
    # Update global parameters
    CRYPTO_CFG_DIR=os.path.join(artifact_dir, "crypto_config")
    CHANNEL_ARTIFACT_DIR=os.path.join(artifact_dir, "channel_artifacts")

    global ORDERER_GENESIS_BLK, ORDERER_LOCAL_MSPDIR_TEMPLATE, ORDERER_LOCAL_TLSDIR_TEMPLATE
    ORDERER_GENESIS_BLK=os.path.join(CHANNEL_ARTIFACT_DIR, "genesis.block")
    ORDERER_LOCAL_MSPDIR_TEMPLATE=os.path.join(CRYPTO_CFG_DIR, "ordererOrganizations/example.com/orderers/{}.example.com/msp")
    ORDERER_LOCAL_TLSDIR_TEMPLATE=os.path.join(CRYPTO_CFG_DIR, "ordererOrganizations/example.com/orderers/{}.example.com/tls")

    global PEER_LOCAL_MSPDIR_TEMPLATE, PEER_LOCAL_TLSDIR_TEMPLATE
    PEER_LOCAL_MSPDIR_TEMPLATE=os.path.join(CRYPTO_CFG_DIR,"peerOrganizations/org{}.example.com/peers/{}.org{}.example.com/msp")
    PEER_LOCAL_TLSDIR_TEMPLATE=os.path.join(CRYPTO_CFG_DIR, "peerOrganizations/org{}.example.com/peers/{}.org{}.example.com/tls")

    peer_addrs_path = os.path.join(artifact_dir, "peers.txt")
    orderer_addrs_path = os.path.join(artifact_dir, "orderers.txt")
    with open(peer_addrs_path, 'r') as f:
      lines = f.readlines()
    peer_addrs = [line.split(":")[0].strip() for line in lines]

    with open(orderer_addrs_path, 'r') as f:
      lines = f.readlines()
    orderer_addrs = [line.split(":")[0].strip() for line in lines]


    if sys.argv[2] == "on":
        restart_orderers(orderer_addrs)
        restart_peers(peer_addrs)
        return 0
    elif sys.argv[2] == "off":
        stop_orderers(orderer_addrs)
        stop_peers(peer_addrs)
        return 0
    else:
        print "Unrecognized option ", argv
        return 1


if __name__ == '__main__':
    main()

