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
                    // Parse jenkins-config.env configuration
                    def props = readProperties file: 'jenkins-config.env'
                    env.BACKEND_IMAGE = props['BACKEND_IMAGE']
                    env.FRONTEND_IMAGE = props['FRONTEND_IMAGE']
                    env.AWS_USER = props['AWS_USER']
                    env.GITHUB_REPO = props['GITHUB_REPO']
                }
            }
        }

        stage('Build & Push Images') {
            steps {
                script {
                    echo "Building Docker Images..."
                    sh 'docker build -t nba-backend:latest .'
                    sh 'docker build -t nba-frontend:latest ./frontend'

                    echo "Tagging Docker Images..."
                    sh "docker tag nba-backend:latest ${env.BACKEND_IMAGE}"
                    sh "docker tag nba-frontend:latest ${env.FRONTEND_IMAGE}"

                    echo "Logging into Docker Hub and pushing..."
                    withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', passwordVariable: 'DH_PASSWORD', usernameVariable: 'DH_USERNAME')]) {
                        sh "echo \$DH_PASSWORD | docker login -u \$DH_USERNAME --password-stdin"
                    }
                    sh "docker push ${env.BACKEND_IMAGE}"
                    sh "docker push ${env.FRONTEND_IMAGE}"
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
                sh 'echo "Deployment Run Completed" > build-report.txt'
                sh "echo 'Target Strategy: ${params.DEPLOY_TARGET}' >> build-report.txt"
                sh "echo 'Live Host: ${env.AWS_LIVE_IP ?: "None"}' >> build-report.txt"
                archiveArtifacts artifacts: 'build-report.txt', allowEmptyArchive: true
            }
        }
    }
}

// ── Orchestration Helper Functions ──

def deployK3s() {
    sh 'terraform init'
    sh 'terraform apply -auto-approve'

    def awsIp = sh(script: 'terraform output -raw instance_public_ip', returnStdout: true).trim()
    env.AWS_LIVE_IP = awsIp

    sh 'chmod 400 ./nba-automation-key.pem || true'

    // Replace AWS_TARGET_IP placeholder dynamically inside manifests
    sh "python -c \"import os; fpath='./k8s/frontend.yaml'; c=open(fpath).read().replace('AWS_TARGET_IP', '${awsIp}'); open(fpath,'w').write(c)\""

    // Deploy to AWS K3s node
    sh "ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} 'mkdir -p /home/ubuntu/k8s'"
    sh "scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -r ./k8s/* ${env.AWS_USER}@${awsIp}:/home/ubuntu/k8s/"

    sh """ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} << 'EOF'
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
EOF"""

    // Spin up local Prometheus/Grafana stack and establish telemetry tunnel
    sh 'docker compose up -d --build'
    sh "ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no -N -f -L 29255:127.0.0.1:10255 -L 28080:127.0.0.1:18080 ${env.AWS_USER}@${awsIp} || true"

    // Verify endpoint availability
    sh "curl -f --retry 3 --retry-delay 5 http://${awsIp}:30000"
}

def deployDockerAWS() {
    sh 'terraform init'
    sh 'terraform apply -auto-approve'

    def awsIp = sh(script: 'terraform output -raw instance_public_ip', returnStdout: true).trim()
    env.AWS_LIVE_IP = awsIp

    sh 'chmod 400 ./nba-automation-key.pem || true'

    // Wait for Docker to initialize on EC2 instance
    sh """ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} << 'EOF'
        for i in {1..30}; do
            if docker ps >/dev/null 2>&1; then
                break
            fi
            sleep 2
        done
EOF"""

    // Copy production Compose manifest and launch workload directly
    sh "scp -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ./docker-compose.prod.yml ${env.AWS_USER}@${awsIp}:/home/ubuntu/docker-compose.prod.yml"
    sh """ssh -i ./nba-automation-key.pem -o StrictHostKeyChecking=no ${env.AWS_USER}@${awsIp} << 'EOF'
        sudo docker compose -f /home/ubuntu/docker-compose.prod.yml down --remove-orphans || true
        sudo docker compose -f /home/ubuntu/docker-compose.prod.yml up -d
EOF"""

    // Verify endpoint availability (standard compose port mapping)
    sh "curl -f --retry 3 --retry-delay 5 http://${awsIp}:3000"
}

def deployLocalTunnel() {
    // Run prod stack locally
    sh 'docker compose -f docker-compose.prod.yml down || true'
    sh 'docker compose -f docker-compose.prod.yml up -d'

    // Expose local run via localtunnel
    sh 'nohup npx --yes localtunnel --port 3000 > localtunnel.log 2>&1 &'
    sh 'sleep 8'

    def tunnelUrl = sh(script: 'cat localtunnel.log | grep -o "https://.*" || echo "http://localhost:3000"', returnStdout: true).trim()
    env.AWS_LIVE_IP = "Local Run (Tunnel: ${tunnelUrl})"
}

def teardownAWS() {
    sh 'pkill -f "ssh.*nba" || true'
    sh 'docker compose down || true'
    sh 'terraform destroy -auto-approve || true'
}

def sendEmailReport(String strategy, String status) {
    def subject = status == "SUCCESS" ? "✅ NBA Engine Deployed Successfully (${strategy})" : "❌ NBA Engine Deployment Failed (${strategy})"
    def liveUrl = ""
    if (status == "SUCCESS") {
        if (strategy == "aws-k3s") {
            liveUrl = "http://${env.AWS_LIVE_IP}:30000"
        } else if (strategy == "aws-docker") {
            liveUrl = "http://${env.AWS_LIVE_IP}:3000"
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
