---
description: セッション開始から作業まで全自動化
---
# /go - Ultra-Lean

// turbo-all

```bash
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-$HOME/.antigravity}"
timeout 5 node "$ANTIGRAVITY_DIR/agent/scripts/session_state.js" init 2>/dev/null

# Sequential core steps
echo "🚀 Starting session..."
# Use internal call equivalents to stay low-overhead
# 1. checkin
# 2. task analysis
# 3. work

echo "✅ Ready."
```

## Shortcuts
- `/go` -> Start
- `/go "task"` -> Start + Work
- `/go --vision` -> Vision Mode
