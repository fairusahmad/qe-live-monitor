#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export GIT_TERMINAL_PROMPT=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

push_with_diagnostics() {
  local push_output

  if push_output=$(git push origin main 2>&1); then
    [[ -n "$push_output" ]] && printf '%s\n' "$push_output"
    return 0
  fi

  printf '%s\n' "$push_output" >&2

  if grep -qiE "Authentication failed|could not read Username|could not read Password|terminal prompts disabled" <<<"$push_output"; then
    local push_url
    push_url="$(git remote get-url --push origin)"
    log "Push failed because origin requires non-interactive credentials on this machine."
    log "Current push URL: $push_url"
    log "Set up SSH for origin or configure a Git credential helper/PAT on node1, then retry."
  fi

  return 1
}

log "Fetching latest changes..."
git fetch origin
log "Rebasing onto origin/main..."
git pull --rebase --autostash origin main

log "Scanning QE jobs..."
python3 scripts/scan_all_jobs.py

git add docs/data/jobs.json docs/data/*/status.json docs/data/*/energy.csv docs/data/*/gradient_error.csv docs/data/*/total_force.csv docs/data/*/structure.xyz docs/data/*/trajectory.xyz docs/data/*/original_structure.xyz docs/data/*/lattice.json docs/data/*/original_lattice.json docs/data/*/latest_output_tail.txt

if git diff --cached --quiet; then
  log "No changes to commit."
else
  log "Committing dashboard updates..."
  git commit -m "Update QE dashboard data"
  log "Syncing with origin/main before push..."
  git pull --rebase --autostash origin main
  log "Pushing changes..."
  push_with_diagnostics
fi
