#!/bin/bash/python 


import sys
import os
import time
import json


def main():
    # <= to exclude the count of sys.argv[0], the script name. 
    if len(sys.argv) <= 1:
        print "Insufficient parameters, expecting at least {}, but actual {}".format(1, len(sys.argv)-1)
        print "python aggregate_storage.py [number of nodes]"
        return 1

    node_count = int(sys.argv[1])
    total_bytes = 0
    for i in range(node_count):
        metric_path = "result/10items_across_{}nodes_{}.metrics".format(node_count, i)
        with open(metric_path) as f:
            metrics = json.load(f)
            avg_blk_bytes = metrics["avg_blk_info"]["blk_size(bytes)"]
            blk_count = metrics["latency(ms)"]["blkcount"]
            # print "Node {}, avg blk bytes = {}, blk count = {}".format(i, avg_blk_bytes, blk_count)
            total_bytes += avg_blk_bytes * blk_count
    result = {"node_count": node_count, "units": "KB", "storage": total_bytes / 1024} 
    print json.dumps(result)


if __name__ == "__main__":
    sys.exit(main())