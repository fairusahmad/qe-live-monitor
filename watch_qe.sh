#!/usr/bin/env bash
set -e

cd /media/node1/Fairus2TB/fairus/qe-live-monitor

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting update cycle..."
  ./update_and_push.sh || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sleeping for 300 seconds."
  sleep 300
done
