#!/usr/bin/env bash
set -e

cd /media/node1/Fairus2TB/fairus/qe-live-monitor

while true; do
  ./update_and_push.sh || true
  sleep 300
done
