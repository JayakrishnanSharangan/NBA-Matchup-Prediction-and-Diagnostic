# NBA GitOps Automation, Observability & Failover Instructions

This document provides a comprehensive guide to setting up and running the local Jenkins runner, configuring secrets, and using the smart auto-failover pipeline.

---

## 1. Local Jenkins Pipeline Setup

To run the Jenkins automation pipeline on your local Windows developer machine, map the local Docker daemon socket so Jenkins can execute Docker builds.

Run the following command from the project root:

```bash
docker run -d -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v //var/run/docker.sock:/var/run/docker.sock \
  --name jenkins-local \
  jenkins/jenkins:lts
```

> **Retrieving Jenkins Admin Password:**
> `docker exec jenkins-local cat /var/jenkins_home/secrets/initialAdminPassword`

---

## 2. Configuring Jenkins Credentials (One-time Setup)

Before running the deploy pipeline, you must define the following credentials in the Jenkins UI under **Dashboard > Manage Jenkins > Credentials > System > Global credentials**:

1. **aws-access-key-id**
   - **Type:** Secret text
   - **Secret:** *Your AWS Access Key ID* (found in line 1 of `NBASECRETS.txt`)
   - **ID:** `aws-access-key-id`
2. **aws-secret-access-key**
   - **Type:** Secret text
   - **Secret:** *Your AWS Secret Access Key* (found in line 2 of `NBASECRETS.txt`)
   - **ID:** `aws-secret-access-key`
3. **aws-ssh-key**
   - **Type:** SSH Username with private key
   - **Username:** `ubuntu`
   - **Private Key:** Click "Enter directly" and paste the contents of `nba-automation-key.pem`
   - **ID:** `aws-ssh-key`
4. **dockerhub-credentials**
   - **Type:** Username with password
   - **Username:** `jayakrishnansharangan`
   - **Password:** *Your Docker Hub password or Personal Access Token*
   - **ID:** `dockerhub-credentials`
5. **notification-email**
   - **Type:** Secret text
   - **Secret:** `jayakrishnan.sharangan@gmail.com`
   - **ID:** `notification-email`

---

## 3. GitHub Push Trigger Webhook

To make Jenkins build automatically whenever you run a `git push` to your repository:
1. Go to your GitHub repository settings: `https://github.com/JayakrishnanSharangan/NBA-Matchup-Prediction-and-Diagnostic/settings/hooks`
2. Click **Add webhook**.
3. **Payload URL:** `http://<YOUR_ROUTER_IP_OR_NGROK_URL>/github-webhook/`
4. **Content type:** `application/json`
5. **Events:** Select "Just the push event".
6. Save the webhook.

*Note: If you do not expose your local Jenkins port to the public internet, Jenkins will fall back to polling GitHub every 5 minutes to detect changes automatically.*

---

## 4. Smart Auto-Failover Orchestration

The pipeline is programmed with a failover hierarchy to ensure your professor receives a working public link even if AWS hits limits:

1. **Primary (`aws-k3s`):** Provisions an EC2 node and deploys the stack on lightweight Kubernetes (K3s). If this stage fails, Jenkins runs `terraform destroy` automatically and transitions to Strategy 2.
2. **Alternative (`aws-docker`):** Deploys the stack using Docker Compose directly on the EC2 instance, saving **~400MB of RAM**. If this stage fails, Jenkins runs `terraform destroy` automatically and transitions to Strategy 3.
3. **Fallback (`local-tunnel`):** Spins up the stack on your local developer machine and generates a public HTTPS URL using `localtunnel`.

---

## 5. Nuclear Teardown Operations

When you want to stop all activities, shut down the EC2 instances, delete local containers, and close tunnels, use the nuclear destroy tools.

### Option A: Manual Terminal Script
From your local workspace, run:
```bash
./destroy.sh
```

### Option B: Jenkins Automated Job
1. In Jenkins, create a new pipeline job named `NBA-Engine-Destroy`.
2. Configure it to read from the Git repository, using script path `Jenkinsfile.destroy`.
3. Click **Build Now** to execute the teardown and receive an email confirmation.
