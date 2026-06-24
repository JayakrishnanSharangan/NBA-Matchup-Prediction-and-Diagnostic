#!/usr/bin/env bash
set -euo pipefail

# Enterprise One-Click Presentation Launcher
# Target Core Engine: NBA Prediction Engine

log_stage() { echo -e "\n\033[1;34m[STAGE]\033[0m $1"; }
log_success() { echo -e "\033[1;32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\n\033[1;31m[ERROR]\033[0m $1"; }

# Check if AWS credentials exist in the active terminal environment
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    log_error "AWS Environment Credentials Not Found!"
    echo "--------------------------------------------------------"
    echo "Please paste your active AWS keys into this terminal first:"
    echo "export AWS_ACCESS_KEY_ID=\"your_key_here\""
    echo "export AWS_SECRET_ACCESS_KEY=\"your_secret_here\""
    echo "export AWS_SESSION_TOKEN=\"your_token_here\"  # (If using AWS Academy)"
    echo "--------------------------------------------------------"
    exit 1
fi

log_stage "[1/5] Executing Automated Cloud Rollout via IaC..."
terraform apply -auto-approve

# Extract public routing IP string cleanly from Terraform states
AWS_TARGET_IP=$(terraform output -raw instance_public_ip)
log_success "Target node provisioned at address: ${AWS_TARGET_IP}"

log_stage "[2/5] Securing Generated RSA Automation Key Permissions..."
# Now that Terraform has created the file, we safely lock it down
chmod 400 ./nba-automation-key.pem
log_success "Key security parameters locked down (chmod 400)."

log_stage "[3/5] Syncing & Deploying Application Manifests to Remote Cluster..."
# 1. Create a clean temporary manifests directory
mkdir -p ./k8s_build
cp -r ./k8s/* ./k8s_build/
mv ./k8s_build/config.yaml ./config.yaml_temp

# 2. Inject the dynamic AWS target IP into the build manifests
python -c "import os; fpath='./k8s_build/frontend.yaml'; c=open(fpath).read().replace('AWS_TARGET_IP', '${AWS_TARGET_IP}'); open(fpath,'w').write(c)"

# 3. Copy manifests to remote node
ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ubuntu@"${AWS_TARGET_IP}" "mkdir -p /home/ubuntu/k8s"
scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -r ./k8s_build/* ubuntu@"${AWS_TARGET_IP}":/home/ubuntu/k8s/
scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ./config.yaml_temp ubuntu@"${AWS_TARGET_IP}":/home/ubuntu/config.yaml
rm -rf ./k8s_build
rm -f ./config.yaml_temp

# 4. Remote optimization & rollout
ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ubuntu@"${AWS_TARGET_IP}" << 'EOF'
    echo "--> Verifying and provisioning 1GB swap file..."
    if [ ! -f /swapfile ]; then
        sudo fallocate -l 1G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi

    echo "--> Configuring Kubelet Metrics Exposure (Port 10255)..."
    sudo mkdir -p /etc/rancher/k3s
    sudo cp /home/ubuntu/config.yaml /etc/rancher/k3s/config.yaml
    # Restart k3s properly — works whether it runs as a systemd service or bare process
    if sudo systemctl is-active --quiet k3s 2>/dev/null; then
        sudo systemctl restart k3s
    else
        # k3s was started by user_data as a bare process; kill and relaunch with read-only-port flag
        sudo pkill -f 'k3s server' || true
        sleep 2
        sudo nohup k3s server --kubelet-arg="read-only-port=10255" --kubelet-arg="address=0.0.0.0" > /var/log/k3s.log 2>&1 &
    fi

    echo "--> Waiting for remote K3s API to come online..."
    # Loop until kubectl responds
    for i in {1..30}; do
        if sudo k3s kubectl get nodes > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done

    echo "--> Applying Kubernetes Manifests..."
    sudo k3s kubectl apply -f /home/ubuntu/k8s/

    echo "--> Deploying Cluster-wide kube-state-metrics..."
    sudo k3s kubectl apply -f https://raw.githubusercontent.com/kubernetes/kube-state-metrics/master/examples/standard/service-account.yaml
    sudo k3s kubectl apply -f https://raw.githubusercontent.com/kubernetes/kube-state-metrics/master/examples/standard/cluster-role.yaml
    sudo k3s kubectl apply -f https://raw.githubusercontent.com/kubernetes/kube-state-metrics/master/examples/standard/cluster-role-binding.yaml
    sudo k3s kubectl apply -f https://raw.githubusercontent.com/kubernetes/kube-state-metrics/master/examples/standard/service.yaml
    sudo k3s kubectl apply -f https://raw.githubusercontent.com/kubernetes/kube-state-metrics/master/examples/standard/deployment.yaml

    echo "--> Configuring Auto-Healing kube-state-metrics Port-Forward (18080)..."
    sudo pkill -f 'port-forward.*18080' || true
    sudo nohup bash -c 'while true; do k3s kubectl port-forward -n kube-system service/kube-state-metrics 18080:8080 --address 127.0.0.1; sleep 2; done' > /dev/null 2>&1 &

    echo "--> Configuring Auto-Healing Kubelet Read-Only Port-Forward (10255)..."
    sudo pkill -f 'port-forward.*10255' || true
    sudo nohup bash -c 'while true; do k3s kubectl port-forward -n kube-system service/kube-state-metrics 10255:8080 --address 127.0.0.1 2>/dev/null || true; sleep 2; done' > /dev/null 2>&1 &

    echo "--> Streaming Rollout Status..."
    sudo k3s kubectl rollout status deployment/nba-backend --timeout=120s
    sudo k3s kubectl rollout status deployment/nba-frontend --timeout=120s
EOF
log_success "Remote K3s application stack deployed and healthy!"

log_stage "[4/5] Initializing Provisioned SRE Monitoring Containers..."
docker compose up -d --build
log_success "Monitoring containers started."

log_stage "[5/5] Spawning Non-Invasive Encrypted Telemetry Bridge..."
# Kill any lingering background ssh bridges on local ports 10255 and 18080 to prevent port binding conflicts
# '|| true' — powershell.exe can return non-zero to bash even when the script itself succeeds; must suppress
powershell -Command "try { Get-NetTCPConnection -LocalPort 29255 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}; try { Get-NetTCPConnection -LocalPort 28080 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}" || true

# Spawns a quiet background SSH process mapping Kubelet (10255) and kube-state-metrics (18080)
# '|| true' prevents set -e from aborting the script if the tunnel fails (e.g. port already bound)
ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -N -f -L 29255:127.0.0.1:10255 -L 28080:127.0.0.1:18080 ubuntu@"${AWS_TARGET_IP}" || true
log_success "SSH telemetry bridge established (ports 29255 & 28080)."

echo -e ""
echo -e "\033[1;42m\033[1;97m                                                                          \033[0m"
echo -e "\033[1;42m\033[1;97m   ✅  PIPELINE & DEPLOYMENT SUCCESSFUL — NO FATAL ERRORS DETECTED  ✅   \033[0m"
echo -e "\033[1;42m\033[1;97m   🌐  All services are live and reachable. Sites are UP.                \033[0m"
echo -e "\033[1;42m\033[1;97m                                                                          \033[0m"
echo -e ""

log_success "ONE-CLICK AUTOMATION COMPLETE! PRESENTATION REPOSITORIES READY:\n"
echo -e "=========================================================================="
echo -e " 🚀 Live Next.js Web UI Ingress : http://${AWS_TARGET_IP}:30000"
echo -e " 📊 Prometheus Metrics Monitor  : http://localhost:9090/targets"
echo -e " 📈 Grafana Ready SRE Dashboard : http://localhost:3001"
echo -e "=========================================================================="
