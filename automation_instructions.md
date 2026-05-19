# NBA GitOps Automation & Observability Instructions

This document provides the necessary terminal commands to spin up the local Jenkins automation runner and apply the required observability metrics patch to the remote AWS node.

---

## 1. Local Jenkins Automation Pipeline Runner

To execute the updated `Jenkinsfile` locally, use the official Jenkins Docker image. This command maps the local Windows Docker daemon socket to the container, granting Jenkins the authority to execute the `docker build` and `docker run` commands defined in your pipeline stages.

Run this exactly in your PowerShell or Command Prompt terminal from the project root:

```bash
docker run -d -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v //var/run/docker.sock:/var/run/docker.sock \
  --name jenkins-local \
  jenkins/jenkins:lts
```

> **Note:** Once Jenkins starts, you will need the initial admin password to unlock it. You can retrieve it by running:
> `docker exec jenkins-local cat /var/jenkins_home/secrets/initialAdminPassword`

---

## 2. Remote AWS Metrics Patch (Kubelet Exposure)

To allow the local Prometheus container to scrape the remote K3s Kubelet metrics endpoint, you must bind the Kubelet address to `0.0.0.0`.

Connect to your AWS instance via SSH (`ssh -i <YOUR_KEY> ubuntu@18.214.100.93`), then run the following sequence:

### Step 2.1: Edit the K3s Service File
Append the `--kubelet-arg=address=0.0.0.0` flag to the `k3s.service` execution command.

```bash
# Open the k3s systemd service file in nano
sudo nano /etc/systemd/system/k3s.service
```

Locate the line starting with `ExecStart=` and append the argument so it looks like this:
`ExecStart=/usr/local/bin/k3s server --kubelet-arg=address=0.0.0.0`

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Step 2.2: Reload Systemd & Restart K3s
Apply the configuration changes by restarting the services:

```bash
sudo systemctl daemon-reload
sudo systemctl restart k3s
```

### Step 2.3: Verify Endpoint Accessibility
Verify the metrics are exposed locally on the node:
```bash
curl -k https://localhost:10250/metrics
```

Your local Prometheus container (configured in `docker-compose.yml` to scrape `18.214.100.93:10250`) will now successfully ingest these metrics.
