# =============================================================================
#  main.tf — Zero-Touch AWS Minikube Infrastructure
#  Phase 6: Automated Kubernetes Boot via Terraform
# =============================================================================

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.3.0"
}

# -----------------------------------------------------------------------------
# Provider
# -----------------------------------------------------------------------------
provider "aws" {
  region = "us-east-1"
}

# -----------------------------------------------------------------------------
# Security Group — opens SSH, HTTP, HTTPS, and App/Jenkins ports
# -----------------------------------------------------------------------------
resource "aws_security_group" "nba_agent_sg" {
  name        = "nba-agent-sg"
  description = "Allow SSH, HTTP, HTTPS, and App/Jenkins traffic"

  # SSH
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # App / Jenkins
  ingress {
    description = "App/Jenkins"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "nba-agent-sg"
    Project = "NBA-ML-Pipeline"
    Phase   = "6"
  }
}

# -----------------------------------------------------------------------------
# EC2 Instance — Ubuntu 22.04 LTS, t3.medium
# Ubuntu 22.04 LTS AMI (us-east-1): ami-0c7217cdde317cfec
# -----------------------------------------------------------------------------
resource "aws_instance" "nba_agent_node" {
  ami                    = "ami-0c7217cdde317cfec"   # Ubuntu 22.04 LTS (us-east-1)
  instance_type          = "t3.medium"
  vpc_security_group_ids = [aws_security_group.nba_agent_sg.id]

  # ── Zero-Touch Bootstrap Script ────────────────────────────────────────────
  # Automatically provisions Docker + Minikube on first boot (no manual SSH).
  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    # ── 1. System Update ──────────────────────────────────────────────────────
    sudo apt-get update -y
    sudo apt-get upgrade -y

    # ── 2. Install Docker ─────────────────────────────────────────────────────
    sudo apt-get install -y docker.io
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker ubuntu

    # ── 3. Download & Install Minikube ────────────────────────────────────────
    curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
    sudo install minikube-linux-amd64 /usr/local/bin/minikube
    rm minikube-linux-amd64

    # ── 4. Install kubectl ────────────────────────────────────────────────────
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm kubectl

    # ── 5. Start Minikube (force-mode bypasses VM driver requirement on EC2) ──
    sudo -u ubuntu minikube start --force --driver=docker

    echo "=== Zero-Touch Bootstrap Complete: Minikube is running ==="
  EOF

  root_block_device {
    volume_size           = 30    # GB — enough for Docker images + Minikube
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name    = "nba-agent-minikube-node"
    Project = "NBA-ML-Pipeline"
    Phase   = "6"
    Env     = "dev"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "instance_public_ip" {
  description = "Public IP of the Minikube node"
  value       = aws_instance.nba_agent_node.public_ip
}

output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.nba_agent_node.id
}

output "security_group_id" {
  description = "Security Group ID"
  value       = aws_security_group.nba_agent_sg.id
}
