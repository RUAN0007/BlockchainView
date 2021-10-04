import os

cur_dir = os.path.dirname(os.path.abspath(__file__))
peer_exec = os.path.join(cur_dir, "bin", "peer")
FABRIC_CFG_DIR=os.path.join(cur_dir, "fabric-config")
MY_DATA_DIR = "/data/ruanpc"

ORDERER_PORT=7050
ORDERER_DATA=os.path.join(MY_DATA_DIR, "hyperledger/production/orderer")
ORDERER_WALDIR=os.path.join(ORDERER_DATA, "etcdraft/wal")
ORDERER_SNAPDIR=os.path.join(ORDERER_DATA, "etcdraft/snapshot")
ORDERER_LOG=os.path.join(MY_DATA_DIR, "orderer_log")

PEER_DATA=os.path.join(MY_DATA_DIR, "hyperledger/production/peer")
PEER_LOG=os.path.join(MY_DATA_DIR, "peer_log")
PEER_PORT=7051
CA_PORT=7054 # Useless now as we do not have CA. But must be there for the connection profile. 

debug = True
def remote_cmd(node, cmd):
  # Escape single quotes
  # https://stackoverflow.com/questions/1250079/how-to-escape-single-quotes-within-single-quoted-strings
  cmd = cmd.replace("'", "'\"'\"'")
  quoted_cmd = "'" + cmd + "'" # Single quote to avoid interpolate the bash vars
  if debug:
      print "   ssh ", node, quoted_cmd
  cmd="ssh {} {}".format(node, quoted_cmd)
  os.system(cmd)

def remote_rm(node, path):
  remote_cmd(node, "rm -rf " + path)

def remote_kill(node, pattern):
  cmd = "ps aux | grep " + pattern + " | awk '{print $2}' |  xargs kill -9"
  remote_cmd(node, cmd)
