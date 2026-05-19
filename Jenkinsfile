pipeline {
    agent any

    stages {
        stage('Build AI Image') {
            steps {
                sh 'docker build -t nba-agent:latest .'
            }
        }
        stage('Test Engine') {
            steps {
                sh 'docker run --rm nba-agent:latest'
            }
        }
        stage('Cleanup') {
            steps {
                sh 'docker image prune -f'
            }
        }
    }
}
