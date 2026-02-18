---
description: Autonomy Levelの即時切替
---
# /level - Ultra-Lean

// turbo-all

```bash
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-$HOME/.antigravity}"
SCRIPT="$ANTIGRAVITY_DIR/agent/scripts/session_state.js"
LEVEL="$1"

if [ -z "$LEVEL" ]; then
  echo "⚙️ Current:"
  node "$SCRIPT" summary | grep "Level"
  echo "Usage: /level [0-3]"
else
  node "$SCRIPT" set-level "$LEVEL" 2>/dev/null
  echo "⚙️ Switched to L$LEVEL"
fi
```

| Level | Name | Confirmation |
|---|---|---|
| L0 | Manual | All steps |
| L1 | Supervised | Design + Destructive |
| L2 | Auto | Destructive only |
| L3 | Full | Production only |
