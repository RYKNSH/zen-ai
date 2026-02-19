#!/bin/bash
# ============================================================================
# ZEN AI Runtime — External Watchdog (Supervisor)
# Restarts the runtime if it crashes. Handles OOM kills, segfaults, etc.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="${RUNTIME_DIR}/.zen-runtime"
LOG_FILE="${STATE_DIR}/runtime.log"
PID_FILE="${STATE_DIR}/daemon.pid"
MAX_RESTARTS=10
RESTART_DELAY=5
BACKOFF_MULTIPLIER=2

mkdir -p "$STATE_DIR"

restart_count=0
current_delay=$RESTART_DELAY

echo "🧘 ZEN AI Watchdog started (max restarts: $MAX_RESTARTS)"
echo "   Log: $LOG_FILE"

while [ $restart_count -lt $MAX_RESTARTS ]; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') 🚀 Starting runtime (attempt $((restart_count + 1))/$MAX_RESTARTS)..." | tee -a "$LOG_FILE"

    # Run the runtime, capturing output
    cd "$RUNTIME_DIR"
    node dist/start.js >> "$LOG_FILE" 2>&1
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ Runtime exited cleanly (code 0)" | tee -a "$LOG_FILE"
        break
    fi

    restart_count=$((restart_count + 1))
    echo "$(date '+%Y-%m-%d %H:%M:%S') ❌ Runtime crashed (exit code: $EXIT_CODE). Restart in ${current_delay}s..." | tee -a "$LOG_FILE"

    # Clean up stale PID
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"

    sleep $current_delay
    current_delay=$((current_delay * BACKOFF_MULTIPLIER))

    # Cap backoff at 5 minutes
    [ $current_delay -gt 300 ] && current_delay=300
done

if [ $restart_count -ge $MAX_RESTARTS ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') 💀 Max restarts ($MAX_RESTARTS) reached. Giving up." | tee -a "$LOG_FILE"
    exit 1
fi
