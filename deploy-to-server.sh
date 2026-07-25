#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load Cloudflare credentials (CF_ZONE_ID, CF_API_KEY)
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# Guard: deployment pulls from git, so uncommitted changes won't be deployed
if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "ERROR: You have uncommitted changes. These will NOT be deployed (deploy pulls from git)."
    echo "Commit and push first, then deploy."
    git status --short
    exit 1
fi

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
        git clone https://github.com/Poglavar/zagreb-buildings.git ${REPO_PATH}
    fi
    cd ${REPO_PATH} && git pull
"

# 2. Copy viewer.html to web root
echo "Deploying frontend..."
${SSH_CMD} "
    mkdir -p /var/www/zagreb.lol/zgrade/js
    cp ${REPO_PATH}/index.html /var/www/zagreb.lol/zgrade/index.html
    cp ${REPO_PATH}/favicon.svg /var/www/zagreb.lol/zgrade/favicon.svg
    # js/ holds the lazily-imported 3D compare viewer; without it the 3D button 404s.
    cp ${REPO_PATH}/js/*.js /var/www/zagreb.lol/zgrade/js/
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

echo "Purging Cloudflare cache..."
result=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_KEY}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}')
if echo "$result" | python3 -c "import sys,json; r=json.load(sys.stdin); sys.exit(0 if r['success'] else 1)" 2>/dev/null; then
    echo "Cache purged OK."
else
    echo "Cache purge failed: $result"
    exit 1
fi

echo "=== Deployment complete ==="
echo "Frontend: https://zagreb.lol/zgrade"
echo "API:      https://zagreb.lol/zgrade/api/buildings?bbox=15.95,45.80,16.00,45.82"
echo ""
echo "NOTE: nginx must serve index.html for deep link routes (/zgrade/{id})."
echo "Add to your nginx location /zgrade block:"
echo "  try_files \$uri \$uri/ /zgrade/index.html;"
