#!/usr/bin/env bash
set -e

cd /media/node1/Fairus2TB/fairus/qe-live-monitor

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetching latest changes..."
git fetch origin
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rebasing onto origin/main..."
git pull --rebase origin main

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Scanning QE jobs..."
python3 scripts/scan_all_jobs.py

git add docs/data/jobs.json docs/data/*/status.json docs/data/*/energy.csv docs/data/*/gradient_error.csv docs/data/*/total_force.csv docs/data/*/structure.xyz docs/data/*/trajectory.xyz docs/data/*/original_structure.xyz docs/data/*/lattice.json docs/data/*/original_lattice.json docs/data/*/latest_output_tail.txt

if git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to commit."
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Committing dashboard updates..."
  git commit -m "Update QE dashboard data"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Syncing with origin/main before push..."
  git pull --rebase origin main
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing changes..."
  git push origin main
fi

