pipeline {
    agent any

    stages {
        stage('Build AI Image') {
            steps {
                bat 'docker build -t nba-agent:latest .'
            }
        }
        stage('Test Engine') {
            steps {
                bat 'docker run --rm nba-agent:latest'
            }
        }
        stage('Cleanup') {
            steps {
                bat 'docker image prune -f'
            }
        }
    }
}
