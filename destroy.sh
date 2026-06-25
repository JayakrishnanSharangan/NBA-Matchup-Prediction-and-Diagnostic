#!/usr/bin/env bash
# =============================================================================
#  destroy.sh — NBA Engine Nuclear Teardown
#  Terminates all AWS infrastructure and stops all local Docker stacks.
# =============================================================================
set -euo pipefail

echo ">>> [1/4] Stopping Local Docker Containers (Observability & Local Run)..."
docker compose down || true
docker compose -f docker-compose.prod.yml down || true

echo ">>> [2/4] Killing Tunnels & SSH Processes..."
pkill -f "ssh.*nba" || true
pkill -f "localtunnel" || true
pkill -f "lt --port" || true

# Kill PowerShell SSH telemetry bridge if running
powershell.exe -Command "try { Get-NetTCPConnection -LocalPort 29255 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}; try { Get-NetTCPConnection -LocalPort 28080 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}" || true

echo ">>> [3/4] Exporting AWS Credentials from NBASECRETS.txt..."
if [ -f "NBASECRETS.txt" ]; then
    export AWS_ACCESS_KEY_ID=$(sed -n '1p' NBASECRETS.txt | tr -d '\r\n')
    export AWS_SECRET_ACCESS_KEY=$(sed -n '2p' NBASECRETS.txt | tr -d '\r\n')
else
    echo "WARNING: NBASECRETS.txt not found. Relying on environment variables..."
fi

echo ">>> [4/4] Destroying AWS Infrastructure (EC2, Key Pair, Security Group)..."
terraform destroy -auto-approve

echo -e "\n=========================================================================="
echo " 💀 NBA ENGINE FULLY DESTROYED."
echo " AWS EC2 instances terminated, local containers stopped, tunnels closed."
echo "=========================================================================="
