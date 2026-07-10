#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FAIRUS_DIR="/media/node1/Fairus2TB/fairus"
DEFAULT_FOLDER="Nguyen"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
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

while true; do
  log "Starting update cycle..."
  ./update_and_push.sh || log "Update cycle failed; retrying after sleep."
  log "Sleeping for 300 seconds."
  sleep 300
done

