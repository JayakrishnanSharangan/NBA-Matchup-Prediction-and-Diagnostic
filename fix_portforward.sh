#!/usr/bin/env bash
sudo pkill -f port-forward || true
sleep 2
sudo nohup bash -c 'while true; do k3s kubectl port-forward -n kube-system service/kube-state-metrics 18080:8080 --address 127.0.0.1; sleep 2; done' > /dev/null 2>&1 &
echo "REMOTE_PF_RESTARTED"
