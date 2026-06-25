pipeline {
    agent any

    parameters {
        choice(
            name: 'DEPLOY_TARGET', 
            choices: ['auto', 'aws-k3s', 'aws-docker', 'local-tunnel'], 
            description: 'Select deployment target. "auto" will try aws-k3s first, fall back to aws-docker, then to local-tunnel.'
        )
    }

    environment {
        AWS_ACCESS_KEY_ID     = credentials('aws-access-key-id')
        AWS_SECRET_ACCESS_KEY = credentials('aws-secret-access-key')
        NOTIFICATION_EMAIL    = credentials('notification-email')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Load Config') {
            steps {
                script {
                    // Read and parse configuration file without relying on utility steps plugin
                    def configFile = readFile('jenkins-config.env')
                    def props = [:]
                    configFile.split('\r?\n').each { line ->
                        line = line.trim()
                        if (line && !line.startsWith("#")) {
                            def parts = line.split('=', 2)
                            if (parts.length == 2) {
                                props[parts[0].trim()] = parts[1].trim()
                            }
                        }
                    }
                    env.BACKEND_IMAGE = props['BACKEND_IMAGE']
                    env.FRONTEND_IMAGE = props['FRONTEND_IMAGE']
                    env.AWS_USER = props['AWS_USER']
                    env.GITHUB_REPO = props['GITHUB_REPO']
                    env.TERRAFORM_PATH = props['TERRAFORM_PATH'] ?: 'terraform'
                }
            }
        }

        stage('Build & Push Images') {
            steps {
                script {
                    echo "Building Docker Images..."
                    runCmd('docker logout || true')
                    runCmd('docker build -t nba-backend:latest .')
                    runCmd('docker build -t nba-frontend:latest ./frontend')

                    echo "Tagging Docker Images..."
                    runCmd("docker tag nba-backend:latest ${env.BACKEND_IMAGE}")
                    runCmd("docker tag nba-frontend:latest ${env.FRONTEND_IMAGE}")

                    echo "Logging into Docker Hub and pushing..."
                    withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', passwordVariable: 'DH_PASSWORD', usernameVariable: 'DH_USERNAME')]) {
                        if (isUnix()) {
                            sh "echo \$DH_PASSWORD | docker login -u \$DH_USERNAME --password-stdin"
                        } else {
                            bat "echo %DH_PASSWORD%| docker login -u %DH_USERNAME% --password-stdin"
                        }
                    }
                    runCmd("docker push ${env.BACKEND_IMAGE}")
                    runCmd("docker push ${env.FRONTEND_IMAGE}")
                }
            }
        }

        stage('Execute Orchestration') {
            steps {
                script {
                    def target = params.DEPLOY_TARGET
                    def success = false

                    // Target 1: Kubernetes on AWS
                    if (target == 'auto' || target == 'aws-k3s') {
                        try {
                            echo ">>> Strategy 1: Trying AWS Kubernetes (aws-k3s)..."
                            deployK3s()
                            success = true
                            sendEmailReport("aws-k3s", "SUCCESS")
                        } catch (Exception e) {
                            echo "AWS Kubernetes strategy failed: ${e.message}"
                            echo "Cleaning up AWS Kubernetes resources before fallback..."
                            teardownAWS()
                            if (target == 'aws-k3s') {
                                sendEmailReport("aws-k3s", "FAILED")
                                error("aws-k3s strategy failed.")
                            }
                        }
                    }

                    // Target 2: Docker-Only on AWS EC2
                    if (!success && (target == 'auto' || target == 'aws-docker')) {
                        try {
                            echo ">>> Strategy 2: Trying Docker-Only on AWS (aws-docker)..."
                            deployDockerAWS()
                            success = true
                            sendEmailReport("aws-docker", "SUCCESS")
                        } catch (Exception e) {
                            echo "AWS Docker strategy failed: ${e.message}"
                            echo "Cleaning up AWS Docker resources before fallback..."
                            teardownAWS()
                            if (target == 'aws-docker') {
                                sendEmailReport("aws-docker", "FAILED")
                                error("aws-docker strategy failed.")
                            }
                        }
                    }

                    // Target 3: Local Tunnel fallback
                    if (!success && (target == 'auto' || target == 'local-tunnel')) {
                        try {
                            echo ">>> Strategy 3: Trying Local Tunnel (local-tunnel)..."
                            deployLocalTunnel()
                            success = true
                            sendEmailReport("local-tunnel", "SUCCESS")
                        } catch (Exception e) {
                            echo "Local Tunnel strategy failed: ${e.message}"
                            sendEmailReport("local-tunnel", "FAILED")
                            error("All deployment strategies failed.")
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                // Archive build report as build artifact
                if (isUnix()) {
                    sh 'echo "Deployment Run Completed" > build-report.txt'
                    sh "echo 'Target Strategy: ${params.DEPLOY_TARGET}' >> build-report.txt"
                    sh "echo 'Live Host: ${env.AWS_LIVE_IP ?: "None"}' >> build-report.txt"
                } else {
                    powershell "Set-Content -Path build-report.txt -Value 'Deployment Run Completed'"
                    powershell "Add-Content -Path build-report.txt -Value 'Target Strategy: ${params.DEPLOY_TARGET}'"
                    powershell "Add-Content -Path build-report.txt -Value 'Live Host: ${env.AWS_LIVE_IP ?: 'None'}'"
                }
                archiveArtifacts artifacts: 'build-report.txt', allowEmptyArchive: true
            }
        }
    }
}

// ── Orchestration Helper Functions ──

def runCmd(String cmd) {
    if (isUnix()) {
        sh cmd
    } else {
        bat cmd
    }
}

def runTerraform(String args) {
    def tfPath = env.TERRAFORM_PATH ?: 'terraform'
    runCmd("\"${tfPath}\" ${args}")
}

def deployK3s() {
    runTerraform('init')
    runTerraform('apply -auto-approve')

    def awsIp = ""
    if (isUnix()) {
        awsIp = sh(script: 'terraform output -raw instance_public_ip', returnStdout: true).trim()
    } else {
        awsIp = powershell(script: "& \"${env.TERRAFORM_PATH}\" output -raw instance_public_ip", returnStdout: true).trim()
    }
    env.AWS_LIVE_IP = awsIp

    runCmd('chmod 400 ./nba-automation-key.pem || true')

    // Replace AWS_TARGET_IP placeholder dynamically inside manifests
    if (isUnix()) {
        sh "python -c \"import os; fpath='./k8s/frontend.yaml'; c=open(fpath).read().replace('AWS_TARGET_IP', '${awsIp}'); open(fpath,'w').write(c)\""
    } else {
        powershell "(Get-Content ./k8s/frontend.yaml) -replace 'AWS_TARGET_IP', '${awsIp}' | Set-Content ./k8s/frontend.yaml"
    }

    // Deploy to AWS K3s node
    runCmd("scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -r ./k8s ${env.AWS_USER}@${awsIp}:/home/ubuntu/")

    runCmd("""ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} "
        if [ ! -f /swapfile ]; then
            sudo fallocate -l 1G /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile
        fi
        sudo k3s kubectl apply -f /home/ubuntu/k8s/
        sudo k3s kubectl rollout restart deployment/nba-backend
        sudo k3s kubectl rollout restart deployment/nba-frontend
        sudo k3s kubectl rollout status deployment/nba-frontend --timeout=120s
    " """)

    // Spin up local Prometheus/Grafana stack
    runCmd('docker compose up -d --build')

    // Establish telemetry tunnel
    if (isUnix()) {
        sh "ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -N -f -L 29255:127.0.0.1:10255 -L 28080:127.0.0.1:18080 ${env.AWS_USER}@${awsIp} || true"
    } else {
        // Stop any conflicting local ports first
        powershell "try { Get-NetTCPConnection -LocalPort 29255 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}"
        powershell "try { Get-NetTCPConnection -LocalPort 28080 -ErrorAction Stop | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}"
        // Run background SSH process on Windows
        powershell "Start-Process ssh -ArgumentList '-i ./nba-automation-key.pem -o StrictHostKeyChecking=no -N -L 29255:127.0.0.1:10255 -L 28080:127.0.0.1:18080 ${env.AWS_USER}@${awsIp}' -NoNewWindow"
    }

    // Verify endpoint availability
    runCmd("curl -f --retry 3 --retry-delay 5 http://${awsIp}:30000")
}

def deployDockerAWS() {
    runTerraform('init')
    runTerraform('apply -auto-approve')

    def awsIp = ""
    if (isUnix()) {
        awsIp = sh(script: 'terraform output -raw instance_public_ip', returnStdout: true).trim()
    } else {
        awsIp = powershell(script: "& \"${env.TERRAFORM_PATH}\" output -raw instance_public_ip", returnStdout: true).trim()
    }
    env.AWS_LIVE_IP = awsIp

    runCmd('chmod 400 ./nba-automation-key.pem || true')

    // Wait for Docker to initialize on EC2 instance
    runCmd("""ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} "
        for i in {1..30}; do
            if docker ps >/dev/null 2>&1; then
                break
            fi
            sleep 2
        done
    " """)

    // Replace AWS_TARGET_IP placeholder dynamically inside docker-compose.prod.yml
    if (isUnix()) {
        sh "python -c \"import os; fpath='./docker-compose.prod.yml'; c=open(fpath).read().replace('AWS_TARGET_IP', '${awsIp}'); open(fpath,'w').write(c)\""
    } else {
        powershell "(Get-Content ./docker-compose.prod.yml) -replace 'AWS_TARGET_IP', '${awsIp}' | Set-Content ./docker-compose.prod.yml"
    }

    // Copy production Compose manifest and launch workload directly
    runCmd("scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ./docker-compose.prod.yml ${env.AWS_USER}@${awsIp}:/home/ubuntu/docker-compose.prod.yml")
    runCmd("""ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} "
        # Stop and disable K3s to reclaim ~350MB RAM for Docker containers
        if systemctl is-active --quiet k3s 2>/dev/null; then
            echo 'Stopping K3s background service to reclaim RAM...'
            sudo systemctl stop k3s || true
            sudo systemctl disable k3s || true
        fi
        sudo docker compose -f /home/ubuntu/docker-compose.prod.yml down --remove-orphans || true
        sudo docker compose -f /home/ubuntu/docker-compose.prod.yml up -d
    " """)

    // Verify endpoint availability (mapped to NodePort 30000)
    runCmd("curl -f --retry 3 --retry-delay 5 http://${awsIp}:30000")
}

def deployLocalTunnel() {
    // Run prod stack locally
    runCmd('docker compose -f docker-compose.prod.yml down || true')
    runCmd('docker compose -f docker-compose.prod.yml up -d')

    // Expose local run via localtunnel (NodePort 30000 on host)
    if (isUnix()) {
        sh 'nohup npx --yes localtunnel --port 30000 > localtunnel.log 2>&1 &'
    } else {
        powershell "Start-Process npx -ArgumentList '--yes localtunnel --port 30000' -RedirectStandardOutput localtunnel.log -NoNewWindow"
    }
    sleep 8

    def tunnelUrl = ""
    if (isUnix()) {
        tunnelUrl = sh(script: 'cat localtunnel.log | grep -o "https://.*" || echo "http://localhost:30000"', returnStdout: true).trim()
    } else {
        tunnelUrl = powershell(script: 'try { (Get-Content localtunnel.log | Select-String "https://" | ForEach-Object { $_.Matches.Value } | Out-String).Trim() } catch { "http://localhost:30000" }', returnStdout: true).trim()
    }
    env.AWS_LIVE_IP = "Local Run (Tunnel: ${tunnelUrl})"
}

def teardownAWS() {
    if (isUnix()) {
        sh 'pkill -f "ssh.*nba" || true'
    } else {
        powershell "try { Get-Process | Where-Object { \$_.CommandLine -like '*ssh*nba*' } | Stop-Process -Force -ErrorAction Stop } catch {}"
    }
    runCmd('docker compose down || true')
    runTerraform('destroy -auto-approve')
}

def sendEmailReport(String strategy, String status) {
    def subject = status == "SUCCESS" ? "✅ NBA Engine Deployed Successfully (${strategy})" : "❌ NBA Engine Deployment Failed (${strategy})"
    def liveUrl = ""
    if (status == "SUCCESS") {
        if (strategy == "aws-k3s" || strategy == "aws-docker") {
            liveUrl = "http://${env.AWS_LIVE_IP}:30000"
        } else {
            liveUrl = env.AWS_LIVE_IP
        }
    } else {
        liveUrl = "FAILED"
    }

    try {
        emailext (
            to: "${env.NOTIFICATION_EMAIL}",
            subject: subject,
            body: """NBA Engine Deployment status: ${status}
Strategy: ${strategy}

Public Live Link: ${liveUrl}
Prometheus Monitor: http://localhost:9090
Grafana Dashboard: http://localhost:3001

Build Details: ${env.BUILD_URL}"""
        )
    } catch (Exception e) {
        echo "Notification email failed: ${e.message}"
    }
}
