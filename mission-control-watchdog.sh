#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/status}"
WATCH_INTERVAL_SECONDS="${WATCH_INTERVAL_SECONDS:-15}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-45}"
WATCHDOG_LOG="${WATCHDOG_LOG:-/tmp/missioncontrol-watchdog.log}"
SERVER_OUT_LOG="${SERVER_OUT_LOG:-/tmp/missioncontrol-server.out.log}"
SERVER_ERR_LOG="${SERVER_ERR_LOG:-/tmp/missioncontrol-server.err.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/missioncontrol-watchdog.lock}"
SERVER_PID_FILE="${SERVER_PID_FILE:-/tmp/missioncontrol-server.pid}"
START_SCRIPT="${START_SCRIPT:-$ROOT_DIR/mission-control-start.sh}"

mkdir -p "$(dirname "$WATCHDOG_LOG")"
mkdir -p "$(dirname "$SERVER_OUT_LOG")"
mkdir -p "$(dirname "$SERVER_ERR_LOG")"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$WATCHDOG_LOG"
}

healthy() {
  curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1
}

running_pid() {
  if [[ -f "$SERVER_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SERVER_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "$pid"
      return 0
    fi
  fi
  pgrep -f "$ROOT_DIR/server.js" | head -n 1 || true
}

start_server() {
  local pid
  pid="$(running_pid)"
  if [[ -n "${pid:-}" ]]; then
    log "Mission Control process already running (pid=$pid); waiting for health."
    return 0
  fi

  if [[ ! -x "$NODE_BIN" ]]; then
    log "Node not found at $NODE_BIN; cannot restart Mission Control."
    return 1
  fi

  if [[ ! -x "$START_SCRIPT" ]]; then
    log "Start script missing or not executable: $START_SCRIPT"
    return 1
  fi

  log "Mission Control is down; starting server."
  nohup "$START_SCRIPT" >>"$SERVER_OUT_LOG" 2>>"$SERVER_ERR_LOG" &
  echo $! > "$SERVER_PID_FILE"
}

wait_for_health() {
  local end_ts
  end_ts=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
  while (( SECONDS < end_ts )); do
    if healthy; then
      log "Mission Control recovered and is healthy."
      return 0
    fi
    sleep 2
  done
  log "Mission Control did not recover within ${STARTUP_TIMEOUT_SECONDS}s."
  return 1
}

log "Mission Control watchdog started."

while true; do
  if healthy; then
    log "Mission Control healthy."
  else
    start_server
    wait_for_health || true
  fi
  sleep "$WATCH_INTERVAL_SECONDS"
done
