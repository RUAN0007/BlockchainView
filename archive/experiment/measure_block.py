import sys
import json
import config

start_blknum=0
end_blknum=1000000000000000

def within(blk_num):
    return start_blknum <= int(blk_num) < end_blknum


def main():
  if len(sys.argv) <= 1:
    print "python measure_block.py  [start-blknum(inclusive)] [end-blknum(exclusive)]"
    return

  peer_log_path = config.PEER_LOG
  if len(sys.argv) > 1:
      global start_blknum
      start_blknum = int(sys.argv[1])
  if len(sys.argv) > 2:
      global end_blknum 
      end_blknum = int(sys.argv[2])

  receive_ts = {}
  finish_ts = {}
  process = {}
  txn_verification = {}
  num_txn = {}
  commit = {}
  blk_commit = {}
  state_commit = {}
  state_check = {}
  receive_interval = {}
  finish_interval = {}
  blk_size = {}
  state_size = {}
  invalidCount = 0
  
  with open(peer_log_path) as f:
    prev_receive_ts = 0
    prev_finish_ts = 0
    for line in f:
        if "invalid endorsed txns..." in line:
            token = line.split()
            blkIdx = token[-6]
            if not within(blkIdx):
                continue
            invalidCount += int(token[-4])
        elif "Adding payload to local buffer" in line:
            token = line.split()
            ts = int(token[-2])
            blkIdx = token[-5][1:-1]
            if not within(blkIdx):
                continue
            receive_ts[blkIdx] = ts
            if prev_receive_ts == 0:
                receive_interval[blkIdx] = 0
            else:
                receive_interval[blkIdx] = ts - prev_receive_ts
            prev_receive_ts = ts 
        elif "Finish Block " in line:
            token = line.split()
            ts = int(token[-1])
            blkIdx = token[-6]
            if not within(blkIdx):
                continue
            finish_ts[blkIdx] = ts
            if prev_finish_ts == 0:
                finish_interval[blkIdx] = 0
            else:
                finish_interval[blkIdx] = ts - prev_finish_ts
            prev_finish_ts = ts
        elif "Process Block" in line:
            token = line.split()
            latency = int(token[-2])
            blkIdx = token[-3]
            if not within(blkIdx):
                continue
            process[blkIdx] = latency
        elif "Verify Txn in block" in line:
            token = line.split()
            # print line
            latency = int(token[-2])
            blkIdx = token[-4][1:-1]
            if not within(blkIdx):
                continue
            txn_verification[blkIdx] = latency
        elif "Committed block" in line:
            token = line.split()

            state_commit_latency = int(token[-2])
            blk_commit_latency = int(token[-5])
            state_check_latency = int(token[-8])
            commit_latency = int(token[-11])
            txn_count = int(token[-14])
            blkIdx = token[-16][1:-1]
            if not within(blkIdx):
                continue
            state_commit[blkIdx] = state_commit_latency
            blk_commit[blkIdx] = blk_commit_latency
            state_check[blkIdx] = state_check_latency
            commit[blkIdx] = commit_latency
            num_txn[blkIdx] = txn_count
        elif "Applied batch size" in line:
            stateSize = int(line.split()[-1])
            blkIdx = int(line.split()[-5][0:-1]) # trim the last ':' char
            if within(blkIdx):
                state_size[blkIdx] = stateSize
        elif "Appended Block" in line:
            blkIdx = int(line.split()[-3])
            blkSize = int(line.split()[-1])
            if within(blkIdx):
                blk_size[blkIdx] = blkSize

    e2e = {}
    for blkIdx in finish_ts.keys():
        e2e[blkIdx] = finish_ts[blkIdx] - receive_ts[blkIdx]

    output_stats(e2e, process, txn_verification, num_txn, 
                 commit, blk_commit, state_commit, state_check, 
                 receive_interval, finish_interval, blk_size, state_size, invalidCount)

def mean(l):
    if len(l) == 0:
        return 0
    else:
        return sum(l) / len(l)

def median(l):
    return percentile(l, 0.5)

def percentile(l, p=0.99):
    if (len) == 0:
        return 0
    n = int(round(p * len(l) + 0.5))
    return l[n-1]


def filter0(l):
    ll = []
    for i in l:
        if i != 0:
            ll.append(i)
    return ll



def output_stats(e2e, process, txn_verification, num_txn, 
                 commit, blk_commit, state_commit, state_check,
                 receive_interval, finish_interval, blk_size, state_size, invalidCount):
    buffer = {}
    for blkIdx in e2e.keys():
        buffer[blkIdx] = e2e[blkIdx] - process[blkIdx]
    # for i in range(1000):
    #     if buffer.has_key(str(i)):
    #         print i, buffer[str(i)]

    # print "Total Txn Count: ", sum(num_txn.values())
    invalidRatio = float(invalidCount) / sum(num_txn.values())

    latency_info = {"blkcount": len(e2e),
        "e2e": mean(e2e.values()), 
                 "receive_interval": mean(filter0(receive_interval.values())),
                 "finish_interval": mean(filter0(finish_interval.values()))}
    latency_info["breakdown"] = {"buffer": mean(buffer.values())}
    latency_info["breakdown"]["process"] = {"total": mean(process.values())}
    latency_info["breakdown"]["process"]["detail"] = {"txn_verification": mean(txn_verification.values()), "commit": {}}
    latency_info["breakdown"]["process"]["detail"]["commit"] = {"total": mean(commit.values())}
    latency_info["breakdown"]["process"]["detail"]["commit"]["detail"] = {
        "state_check": mean(state_check.values()), "blk_commit": mean(blk_commit.values()), "state_commit": mean(state_commit.values())}


    receive_interval_sum = 0
    finish_interval_sum = 0
    txn_sum = 0
    for blkIdx in finish_interval:
        receive_interval_sum += receive_interval[blkIdx]
        finish_interval_sum += finish_interval[blkIdx]
        txn_sum += num_txn[blkIdx]

    receive_thruput = txn_sum / (receive_interval_sum / 1000.0)
    finish_thruput = txn_sum / (finish_interval_sum / 1000.0)

    avg_blk_size = mean(blk_size.values())
    avg_state_size = mean(state_size.values())
    aggregate = {"latency(ms)": latency_info, "raw_thruput(tps)":{"receive":receive_thruput, "finish": finish_thruput}, 
                 "avg_blk_info": {"blk_size(bytes)": avg_blk_size, "state_size(bytes)": avg_state_size, "txn_count": mean(num_txn.values())}}
    aggregate["valid_txn_ratio"] = 1 - invalidRatio
    aggregate["effective_thruput"] = finish_thruput * (1 - invalidRatio)
    
    print json.dumps(aggregate, indent=2)

main()