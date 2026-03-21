#!/bin/bash
# commit-claims.sh — Export claims and commit if changed.
# Intended to run via cron daily at midnight.

set -e
cd "$(dirname "$0")/.."

node scripts/export-claims.js

if git diff --quiet data/claims.json 2>/dev/null; then
    echo "No changes to claims."
else
    git add data/claims.json
    git commit -m "data: update claims export $(date -u +%Y-%m-%d)"
    git push
    echo "Claims committed and pushed."
fi
