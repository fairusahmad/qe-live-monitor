#!/usr/bin/env bash
set -e

cd /media/node1/Fairus2TB/fairus/qe-live-monitor

python3 scripts/scan_all_jobs.py

git add docs/data/jobs.json docs/data/*/status.json docs/data/*/energy.csv docs/data/*/total_force.csv docs/data/*/structure.xyz docs/data/*/latest_output_tail.txt

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Update QE dashboard data"
  git push
fi
