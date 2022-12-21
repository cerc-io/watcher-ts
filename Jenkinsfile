pipeline {
    agent any

    stages {
        stage('Packaging') {
            agent {
                docker {
                    image 'cerc-io/foundation_node16:jenkinscicd'
                }
            }

            environment {
                NODE_AUTH_TOKEN = "${ GITHUB_BASTION_PAT }"
            }

            steps {
                sh 'npm config set -- "//npm.pkg.github.com/:_authToken" "${ GITHUB_BASTION_PAT }"'
                //sh 'echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >> ~/.npmrc'
                //sh 'echo "registry=https://npm.pkg.github.com/" >> ~/.npmrc'
                //sh 'echo "always-auth=true" >> ~/.npmrc'
                sh 'yarn'
                sh 'yarn build'
                sh 'npm config set @cerc-io:registry https://git.vdb.to/api/packages/cerc-io/npm/'
                sh 'npm config set -- "//git.vdb.to/api/packages/cerc-io/npm/:_authToken" "${ GITEA_JENKINS_PUBLISH }"'
                sh 'lerna publish from-package --no-git-tag-version --yes'
            }
        }
    }
}