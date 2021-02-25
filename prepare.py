import sys
import os
import yaml
import json
import config
from pprint import pprint
try:
    from yaml import CLoader as Loader, CDumper as Dumper
except ImportError:
    from yaml import Loader, Dumper


def get_filepath_in_dir(dir_abspath):
  # Get the unique file under dir_path
  d = os.listdir(dir_abspath)
  return os.path.join(dir_abspath, d[0])


def main():
  if len(sys.argv) <= 5:
    print " Usage: <directory_for_artifacts> <channel_name> <blk_size> <orderer_count> <orderer_node1_hostname> ... <peer_count> <peer_node1_host> ... "
    print " The addresses of orderers/peers must be hostnames instead of IP, due to TLS. "
    return 1
  consensus_type = "raft"
  isTLS = True

  directory_name = sys.argv[1]
  channel_name = sys.argv[2]
  blk_size = int(sys.argv[3])
  orderer_count = int(sys.argv[4])
  
  orderer_addrs = sys.argv[5:5+orderer_count] 
  peer_count = int(sys.argv[5+orderer_count])
  peer_addrs = sys.argv[5+orderer_count+1:5+orderer_count+1+peer_count]
  # print directory_name
  # print channel_name
  # print blk_size
  # print orderer_addrs
  # print peer_addrs

  cur_dir = os.path.dirname(os.path.abspath(__file__))
  template_dir = os.path.join(cur_dir, "template")

  # Step 1: Make a directory to hold generated materials. 
  new_dir = os.path.abspath(directory_name)
  os.mkdir(new_dir)  
  
#   # Step 2: Prepare crypto_config.yaml from the template
  with open(os.path.join(template_dir, "crypto_config.yaml.template")) as f:
    crypto_config = yaml.load(f, Loader=Loader)
  crypto_config["OrdererOrgs"][0]["Specs"] = []
  for orderer_addr in orderer_addrs: 
    crypto_config["OrdererOrgs"][0]["Specs"].append({"Hostname": "{}".format(orderer_addr)})

  peer_org_template = crypto_config["PeerOrgs"][0]
  peer_orgs = []
  
  for i in range(1, peer_count+1):
    peer_org = peer_org_template.copy()
    peer_org["Domain"] = "org{}.example.com".format(i)
    peer_org["Name"] = "Org{}".format(i)
    peer_org["Specs"] = [{"Hostname": peer_addrs[i-1]}] 
    peer_orgs.append(peer_org)
  crypto_config["PeerOrgs"] = peer_orgs
  
  crypto_yaml = os.path.join(new_dir, "crypto_config.yaml")
  with open(crypto_yaml, 'w') as f:
    yaml.dump(crypto_config, f, default_flow_style=False)
  
  # Step 3: Prepare configtx.yaml from the template
  with open(os.path.join(template_dir, "configtx.yaml.template.{}".format(consensus_type))) as f:
    configtx = yaml.load(f, Loader=Loader)
  orderer_org = configtx["Organizations"][0]
  # peer_org_template = configtx["Organizations"][1]
  # print orderer_org
  orderer_org_msp = os.path.join(new_dir, "crypto_config/ordererOrganizations/example.com/msp")
  orderer_org['MSPDir'] = orderer_org_msp
  orderer_org['OrdererEndpoints'] = []
  for orderer_addr in orderer_addrs: 
    orderer_org['OrdererEndpoints'].append("{}:{}".format(orderer_addr, config.ORDERER_PORT))
  # print orderer_org

  peer_orgs = [] 
  for i in range(1, peer_count+1):
    peer_org = {}
    peer_org['Name'] = "Org{}MSP".format(i)
    peer_org['ID'] = "Org{}MSP".format(i)
    peer_org['AnchorPeers'] = [{'Host': peer_addrs[i-1], 'Port': config.PEER_PORT}]
    peer_org_msp = os.path.join(new_dir, "crypto_config/peerOrganizations/org{}.example.com/msp".format(i)) 
    peer_org['MSPDir'] = peer_org_msp

    peer_org['Policies'] = {}
    peer_org['Policies']['Readers'] = {}
    peer_org['Policies']['Readers']['Type'] = "Signature"
    peer_org['Policies']['Readers']['Rule'] = "OR('Org{}MSP.admin', 'Org{}MSP.peer', 'Org{}MSP.client')".format(i, i, i)

    peer_org['Policies']['Writers'] = {}
    peer_org['Policies']['Writers']['Type'] = "Signature"
    peer_org['Policies']['Writers']['Rule'] = "OR('Org{}MSP.admin', 'Org{}MSP.client')".format(i, i)

    peer_org['Policies']['Admins'] = {}
    peer_org['Policies']['Admins']['Type'] = "Signature"
    peer_org['Policies']['Admins']['Rule'] = "OR('Org{}MSP.admin')".format(i)

    peer_org['Policies']['Endorsement'] = {}
    peer_org['Policies']['Endorsement']['Type'] = "Signature"
    peer_org['Policies']['Endorsement']['Rule'] = "OR('Org{}MSP.peer')".format(i)
    
    peer_orgs.append(peer_org)
  # print peer_orgs

  configtx["Organizations"] = [orderer_org]
  [configtx["Organizations"].append(peer_org) for peer_org in peer_orgs]
  
  configtx["Orderer"]["BatchSize"]["MaxMessageCount"] = blk_size
  configtx["Orderer"]["EtcdRaft"]["Consenters"] = []
  for orderer_addr in orderer_addrs: 
    tlsCertPath = os.path.join(new_dir, "crypto_config/ordererOrganizations/example.com/orderers/{}.example.com/tls/server.crt".format(orderer_addr))
    configtx["Orderer"]["EtcdRaft"]["Consenters"].append({"Host": orderer_addr, "Port": config.ORDERER_PORT, "ClientTLSCert": tlsCertPath, "ServerTLSCert": tlsCertPath})


  configtx["Profiles"]["OrgsOrdererGenesis"]["Orderer"]["Organizations"] = [orderer_org]
  configtx["Profiles"]["OrgsOrdererGenesis"]["Consortiums"]["SampleConsortium"]["Organizations"] = peer_orgs
  configtx["Profiles"]["OrgsChannel"]["Application"]["Organizations"] = peer_orgs
  
  configtx_yaml = os.path.join(new_dir, "configtx.yaml")
  with open(configtx_yaml, 'w') as f:
    yaml.dump(configtx, f, default_flow_style=False)
#   #pprint(configtx)
  
  crypto_dir = os.path.join(new_dir, "crypto_config")
  os.mkdir(crypto_dir)
  cryptogen_exec = os.path.join(cur_dir, "bin", "cryptogen")
  cmd = "{} generate --output={} --config={}".format(cryptogen_exec, crypto_dir, crypto_yaml)
  os.system(cmd)
  
  artifact_dir = os.path.join(new_dir, "channel_artifacts")
  os.mkdir(artifact_dir)

  blk_path = os.path.join(artifact_dir, "genesis.block")

  # Note that the channelID in this cmd must be different than the next configtxgen cmd. 
  configtxgen_cmd = os.path.join(cur_dir, "bin", "configtxgen")
  genesis_cmd = "{} --configPath={} -profile OrgsOrdererGenesis -channelID {} -outputBlock {} ".format(configtxgen_cmd, new_dir, "system-channel", blk_path)
  os.system(genesis_cmd)
  
  channel_txn_path = os.path.join(artifact_dir, "{}.tx".format(channel_name))
  txn_cmd = "{} --configPath={} -profile OrgsChannel -outputCreateChannelTx {} -channelID {}".format(configtxgen_cmd, new_dir, channel_txn_path, channel_name)
  os.system(txn_cmd)

  for i in range(1, peer_count+1):
    anchor_txn_path = os.path.join(artifact_dir, "Org{}MSP_anchors.tx".format(i))
    txn_cmd = "{} --configPath={} -profile OrgsChannel -outputAnchorPeersUpdate {} -channelID {} -asOrg Org{}MSP".format(configtxgen_cmd, new_dir, anchor_txn_path, channel_name, i)
    os.system(txn_cmd)

# Step 4: Prepare connection_profile.json for each peer org
  for i in range(1, peer_count+1):
    peer_pem_path = os.path.join(crypto_dir, "peerOrganizations", "org{}.example.com".format(i), "tlsca","tlsca.org{}.example.com-cert.pem".format(i))
    with open(peer_pem_path) as f:
      lines = f.readlines()
    # Replace line breaks with "\n"
    peer_one_line_pem = "\\n".join([line.strip() for line in lines])+"\\n"

    ca_pem_path = os.path.join(crypto_dir, "peerOrganizations", "org{}.example.com".format(i), "ca","ca.org{}.example.com-cert.pem".format(i))
    with open(ca_pem_path) as f:
      lines = f.readlines()
    ca_one_line_pem = "\\n".join([line.strip() for line in lines])+"\\n"


    with open(os.path.join(template_dir, "connection_profile.json.template"), 'r') as file:
      profile_template = file.read()
    profile = profile_template.replace("{ORG}", str(i)).replace("{P0ADDR}", peer_addrs[i-1]).replace("{P0PORT}", str(config.PEER_PORT)).replace("{PEERPEM}", peer_one_line_pem).replace("{CAPORT}", str(config.CA_PORT)).replace("{CAPEM}", ca_one_line_pem).replace("{CAADDR}", peer_addrs[i-1])
    profile_json = json.loads(profile)
  
    with open(os.path.join(crypto_dir, "peerOrganizations", "org{}.example.com".format(i), 'connection_profile.json'), 'w') as f:
      json.dump(profile_json, f, indent=2, sort_keys=True)
  

# Step 5: Update address and ports in a file
  with open(os.path.join(new_dir, 'peers.txt'), 'w') as f:
    for peer_addr in peer_addrs:
      f.write("{}:{}\n".format(peer_addr, config.PEER_PORT)) 

  with open(os.path.join(new_dir, 'orderers.txt'), 'w') as f:
    for orderer_addr in orderer_addrs:
      f.write("{}:{}\n".format(orderer_addr, config.ORDERER_PORT)) 


if __name__ == "__main__":
  main()
