#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# A duplicate watcher produces duplicate commits and can overwhelm the GitHub
# Pages deployment queue. Keep the lock descriptor open for this process's
# entire lifetime so only one watcher can run from this checkout.
WATCH_LOCK_FILE="$(git rev-parse --git-path watch_qe.lock)"
exec 9>"$WATCH_LOCK_FILE"
if ! flock -n 9; then
  echo "Another watch_qe.sh instance is already running for $SCRIPT_DIR." >&2
  exit 1
fi

FAIRUS_DIR="/media/node1/Fairus2TB/fairus"
DEFAULT_FOLDER="Nguyen"
POLL_SECONDS="${QE_WATCH_POLL_SECONDS:-15}"
DEBOUNCE_SECONDS="${QE_WATCH_DEBOUNCE_SECONDS:-5}"
MIN_UPDATE_SECONDS="${QE_WATCH_MIN_UPDATE_SECONDS:-300}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

source_signature() {
  find "$QE_BASE_DIR" \
    \( -type d \( -name .git -o -name __pycache__ -o -name pseudo -o -name output \) -prune \) -o \
    \( -type f \( \
      -name '*.out' -o -name '*.pw.x' -o -name 'output.neb.x' -o \
      -name 'input*.x' -o -name '*.axsf' -o -name '*.dat' -o \
      -name 'bader_charge_changes.csv' \
    \) -printf '%p\t%T@\t%s\n' \) \
    | sort \
    | sha256sum \
    | cut -d ' ' -f 1
}

run_update() {
  log "Relevant QE files changed; starting update cycle..."
  if ./update_and_push.sh; then
    last_update_epoch="$(date +%s)"
  else
    log "Update cycle failed; waiting for the next source change."
  fi
}

resolve_base_dir() {
  local choice="$1"
  if [[ "$choice" == /* ]]; then
    printf '%s\n' "$choice"
  else
    printf '%s\n' "$FAIRUS_DIR/$choice"
  fi
}

pick_folder_interactively() {
  local -a candidates=()
  local entry name
  while IFS= read -r -d '' entry; do
    name="$(basename "$entry")"
    [[ "$name" == qe-live-monitor ]] && continue
    [[ "$name" == .* ]] && continue
    [[ "$name" == __pycache__ || "$name" == pseudo || "$name" == .venv ]] && continue
    candidates+=("$name")
  done < <(find "$FAIRUS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

  if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "$DEFAULT_FOLDER"
    return
  fi

  echo "Select a folder to sync (under $FAIRUS_DIR):" >&2
  local i
  for i in "${!candidates[@]}"; do
    printf '  %d) %s\n' "$((i + 1))" "${candidates[$i]}" >&2
  done
  local reply
  read -r -p "Enter number [default: $DEFAULT_FOLDER]: " reply >&2
  if [[ -z "$reply" ]]; then
    echo "$DEFAULT_FOLDER"
  elif [[ "$reply" =~ ^[0-9]+$ ]] && (( reply >= 1 && reply <= ${#candidates[@]} )); then
    echo "${candidates[$((reply - 1))]}"
  else
    log "Invalid selection; using default '$DEFAULT_FOLDER'."
    echo "$DEFAULT_FOLDER"
  fi
}

if [[ $# -ge 1 ]]; then
  FOLDER_CHOICE="$1"
elif [[ -t 0 ]]; then
  FOLDER_CHOICE="$(pick_folder_interactively)"
else
  FOLDER_CHOICE="$DEFAULT_FOLDER"
fi

export QE_BASE_DIR
QE_BASE_DIR="$(resolve_base_dir "$FOLDER_CHOICE")"
log "Watching folder: $QE_BASE_DIR"

for setting in POLL_SECONDS DEBOUNCE_SECONDS MIN_UPDATE_SECONDS; do
  if ! [[ "${!setting}" =~ ^[0-9]+$ ]]; then
    log "$setting must be a non-negative integer (received '${!setting}')."
    exit 1
  fi
done

last_update_epoch=0
run_update
last_signature="$(source_signature)"
log "Idle until a relevant QE output/input file changes (checking every ${POLL_SECONDS}s; publishing at most once every ${MIN_UPDATE_SECONDS}s)."

while true; do
  sleep "$POLL_SECONDS"
  current_signature="$(source_signature)"
  [[ "$current_signature" == "$last_signature" ]] && continue

  now_epoch="$(date +%s)"
  next_update_epoch="$((last_update_epoch + MIN_UPDATE_SECONDS))"
  if (( now_epoch < next_update_epoch )); then
    wait_seconds="$((next_update_epoch - now_epoch))"
    log "Change detected; batching updates for ${wait_seconds}s to avoid flooding GitHub Pages."
    sleep "$wait_seconds"
  fi

  log "Waiting ${DEBOUNCE_SECONDS}s for writes to settle."
  sleep "$DEBOUNCE_SECONDS"
  current_signature="$(source_signature)"
  run_update
  last_signature="$current_signature"
done
