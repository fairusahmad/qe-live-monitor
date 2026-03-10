#!/usr/bin/env bash
set -e

cd /media/node1/Fairus2TB/fairus/qe-live-monitor

git fetch origin
git pull --rebase origin main

python3 scripts/scan_all_jobs.py

git add docs/data/jobs.json docs/data/*/status.json docs/data/*/energy.csv docs/data/*/total_force.csv docs/data/*/structure.xyz docs/data/*/trajectory.xyz docs/data/*/latest_output_tail.txt

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Update QE dashboard data"
  git pull --rebase origin main
  git push origin main
fi


