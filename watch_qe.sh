#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

while true; do
  log "Starting update cycle..."
  ./update_and_push.sh || log "Update cycle failed; retrying after sleep."
  log "Sleeping for 300 seconds."
  sleep 300
done
