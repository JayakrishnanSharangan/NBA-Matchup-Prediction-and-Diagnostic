#!/bin/bash
echo "=========================================================="
echo "🏀 DEVOPS CRITICAL TRIAGE: NBA-ENGINE PIPELINE AUDIT 🏀"
echo "=========================================================="

echo -e "\n[1/5] Checking Local Configuration Files..."
if [ -d "./k8s" ]; then
    echo "✅ ./k8s folder exists."
    head -n 15 ./k8s/frontend.yaml | grep -E "image:|type:|port:"
else
    echo "❌ ERROR: ./k8s folder not found locally!"
fi

echo -e "\n[2/5] Testing AWS SSH Network Connectivity..."
ssh -i ./nba-automation-key.pem -o ConnectTimeout=5 ubuntu@98.93.213.189 "echo '✅ SSH Connection Authenticated Smoothly!'" 2>&1

echo -e "\n[3/5] Auditing Remote Kubernetes Pod Status..."
ssh -i ./nba-automation-key.pem ubuntu@98.93.213.189 << 'EOF'
    echo "--> Core Node Health:"
    sudo k3s kubectl get nodes
    
    echo -e "\n--> Active Pod Formations (All Namespaces):"
    sudo k3s kubectl get pods -A
EOF

echo -e "\n[4/5] Inspecting Network Services & Port Bindings..."
ssh -i ./nba-automation-key.pem ubuntu@98.93.213.189 << 'EOF'
    echo "--> Exposed Services:"
    sudo k3s kubectl get svc -A
    
    echo -e "\n--> Sockets Listening on Node Ports:"
    sudo netstat -tulnp | grep -E "30000|10255" || echo "⚠️ Warning: No processes binding to target ports!"
EOF

echo -e "\n[5/5] Extracting Real-Time Engine Crash Logs..."
ssh -i ./nba-automation-key.pem ubuntu@98.93.213.189 << 'EOF'
    echo "--> Live Application Container Streams:"
    sudo k3s kubectl logs -n default -l app=nba-frontend --tail=20 2>&1 || echo "Could not fetch container logs."
EOF
echo "=========================================================="
