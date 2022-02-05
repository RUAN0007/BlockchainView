# One-time Init
USE WITH CARE!!!
```
./gcp.sh network_new

. ./env.sh
gcloud beta compute instances create fabriccli \
	--zone=asia-southeast1-a \
	--machine-type=${MACHINE_TYPE} \
	--network=${GCP_NETWORK} \
	--source-machine-image=${FABRIC_ENV_IMAGE} \
	--quiet

# Config fabriccli with deps
- ssh key generation
- `gcloud auth login`
- add ssh key to github
- download this repo
- download golang
- download fabric binaries and dockers
- download node and npm
```

# Per-experimental-set
```

gcloud compute instances start fabriccli --zone=asia-southeast1-a
gcloud compute ssh fabriccli --zone=asia-southeast1-a
```

# Per-experiment
```
# in fabriccli
./gcp.sh instance_up

./network.sh up
./network.sh createChannel

```





gcloud compute instances stop fabriccli

./gcp.sh instance_down
```


# One-time Delete
USE WITH CARE!!!
Unless you are sure that you will not run the experiments later. 
```
gcloud compute instances delete fabriccli
./gcp.sh network_delete
```
