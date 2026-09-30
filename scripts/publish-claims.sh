#!/bin/bash
# publish-claims.sh — Publish data/claims.json into the public docroot, atomically.
#
# Called by commit-claims.sh (nightly, after every successful export) and by
# deploy-to-server.sh, so the file served at zagreb.lol/zgrade/data/claims.json
# tracks the export instead of freezing at whatever a past deploy left there.
# A no-op off the server, where the docroot does not exist.

set -e
cd "$(dirname "$0")/.."

DOCROOT_DATA="${DOCROOT_DATA:-/var/www/zagreb.lol/zgrade/data}"

if [ ! -d "$DOCROOT_DATA" ]; then
    echo "No docroot at $DOCROOT_DATA — skipping publish."
    exit 0
fi

# The temp file must sit on the destination filesystem, otherwise mv is a
# copy+unlink and a reader can catch a half-written file.
cp data/claims.json "$DOCROOT_DATA/.claims.json.tmp"
mv -f "$DOCROOT_DATA/.claims.json.tmp" "$DOCROOT_DATA/claims.json"
echo "Published claims.json to $DOCROOT_DATA ($(wc -c < data/claims.json) bytes)."

# The manifest (row count, newest claim, checksum) is written by export-claims.js and is not in
# git, so after a deploy there may be none. It is published only when it describes THIS claims.json;
# otherwise the public copy is removed so a stale manifest never vouches for a different file.
MANIFEST_MATCHES=$(node -e '
  const fs = require("fs"), crypto = require("crypto");
  try {
    const m = JSON.parse(fs.readFileSync("data/claims.manifest.json", "utf8"));
    const sha = crypto.createHash("sha256").update(fs.readFileSync("data/claims.json")).digest("hex");
    process.stdout.write(m.claims_sha256 === sha ? "yes" : "no");
  } catch { process.stdout.write("no"); }
')
if [ "$MANIFEST_MATCHES" = "yes" ]; then
    cp data/claims.manifest.json "$DOCROOT_DATA/.claims.manifest.json.tmp"
    mv -f "$DOCROOT_DATA/.claims.manifest.json.tmp" "$DOCROOT_DATA/claims.manifest.json"
    echo "Published claims.manifest.json."
else
    rm -f "$DOCROOT_DATA/claims.manifest.json"
    echo "No manifest matching this claims.json; none published (the next export writes one)."
fi
