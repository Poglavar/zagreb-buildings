#!/bin/bash
set -e

SERVER_USER="${DEPLOY_USER:-root}"
SERVER_HOST="${DEPLOY_HOST:-67.205.138.129}"
SSH_KEY="${DEPLOY_SSH_KEY:-~/.ssh/id_ed25519}"
REPO_PATH="${DEPLOY_PATH:-~/code/zagreb-buildings}"

SSH_CMD="ssh ${SERVER_USER}@${SERVER_HOST} -i ${SSH_KEY}"

echo "=== Deploying zagreb-buildings to ${SERVER_HOST} ==="

# 1. Clone or pull the repo
echo "Pulling latest code..."
${SSH_CMD} "
    if [ ! -d ${REPO_PATH} ]; then
        git clone https://github.com/simunkrmek/zagreb-buildings.git ${REPO_PATH}
    fi
    cd ${REPO_PATH} && git pull
"

# 2. Copy viewer.html to web root
echo "Deploying frontend..."
${SSH_CMD} "
    mkdir -p /var/www/zagreb.lol/zgrade
    cp ${REPO_PATH}/index.html /var/www/zagreb.lol/zgrade/index.html
    cp ${REPO_PATH}/favicon.svg /var/www/zagreb.lol/zgrade/favicon.svg
"

# 3. Start/restart PM2 export cron (API is served by cadastre-data/api)
echo "Starting PM2 export cron..."
${SSH_CMD} "
    cd ${REPO_PATH}
    pm2 delete zagreb-buildings 2>/dev/null || true
    pm2 delete zagreb-buildings-export 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
"

echo "=== Deployment complete ==="
echo "Frontend: https://zagreb.lol/zgrade"
echo "API:      https://zagreb.lol/zgrade/api/buildings?bbox=15.95,45.80,16.00,45.82"
