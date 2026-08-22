#!/bin/bash
# publish-claims.sh — Publish data/claims.json into the public docroot, atomically.
#
# Called by commit-claims.sh (nightly, after every successful export) and by
# deploy-to-server.sh, so the file served at zagreb.lol/zgrade/data/claims.json
# tracks the export instead of freezing at whatever a past deploy left there.
# A no-op off the server, where the docroot does not exist.

set -e
cd "$(dirname "$0")/.."

DOCROOT_DATA=/var/www/zagreb.lol/zgrade/data

if [ ! -d "$DOCROOT_DATA" ]; then
    echo "No docroot at $DOCROOT_DATA — skipping publish."
    exit 0
fi

# The temp file must sit on the destination filesystem, otherwise mv is a
# copy+unlink and a reader can catch a half-written file.
cp data/claims.json "$DOCROOT_DATA/.claims.json.tmp"
mv -f "$DOCROOT_DATA/.claims.json.tmp" "$DOCROOT_DATA/claims.json"
echo "Published claims.json to $DOCROOT_DATA ($(wc -c < data/claims.json) bytes)."
