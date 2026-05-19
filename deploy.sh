#!/bin/bash
set -e

# Configuration
IMAGE_NAME="jayakrishnansharangan/nba-frontend:latest"
AWS_IP="98.93.213.189"
SSH_KEY_PATH="./nba-automation-key.pem"
SSH_USER="ubuntu"

echo "Starting NBA Project Deployment Automation..."

# 1. Local Compilation
echo "[1/4] Compiling local frontend image..."
docker build -t $IMAGE_NAME ./frontend

# 2. Registry Push
echo "[2/4] Pushing image to Docker Hub..."
docker push $IMAGE_NAME

# 3. Remote AWS Configuration (Swap & K8s)
echo "[3/4] Configuring remote AWS environment and orchestrating deployment..."

# 1. Create the remote k8s directory structure on the new server
ssh -i ./nba-automation-key.pem ubuntu@$AWS_IP "mkdir -p /home/ubuntu/k8s"

# 2. AUTOMATION FIX: Securely copy your local manifests up to the cloud node first
scp -i ./nba-automation-key.pem -r ./k8s/* ubuntu@$AWS_IP:/home/ubuntu/k8s/

# 3. Execute the environment optimization and cluster deployment rules
ssh -i ./nba-automation-key.pem ubuntu@$AWS_IP << 'EOF'
    echo "--> Verifying /swapfile existence..."
    if [ ! -f /swapfile ]; then
        echo "    Provisioning 1GB swap file..."
        sudo fallocate -l 1G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        echo "    Swap file activated successfully."
    else
        echo "    Swap file already exists."
    fi

    echo "--> Applying Kubernetes Manifests..."
    sudo k3s kubectl apply -f /home/ubuntu/k8s/

    echo "--> Triggering Deployment Rollout..."
    sudo k3s kubectl rollout restart deployment/nba-frontend

    echo "--> Streaming Rollout Status..."
    sudo k3s kubectl rollout status deployment/nba-frontend
EOF

echo "[4/4] Deployment pipeline completed successfully!"
