---
description: データを整理し自己評価を行いクリーンな状態で終了
---
# /checkout - Ultra-Lean

// turbo-all

```bash
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-$HOME/.antigravity}"

# 1. Scoring & Sync
SCORE=$(( ( $(timeout 5 git diff --shortstat HEAD~1 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo 0) / 100 ) + $(timeout 5 git log --oneline --since='6 hours ago' 2>/dev/null | wc -l) ))
echo "🎯 Score: $SCORE/10"

if [ -d "$ANTIGRAVITY_DIR/.git" ] && [ -n "$(timeout 5 git status --porcelain 2>/dev/null)" ]; then
  cd "$ANTIGRAVITY_DIR" && timeout 5 git add -A && timeout 5 git commit -m "auto-sync: $(date +%m%d%H%M)" && timeout 15 git push origin main 2>/dev/null &
fi

# 2. Parallel Cleanup
# [Process Cleanup] Kill lingering dev servers
pkill -f "next-server" || true
pkill -f "next dev" || true
pkill -f "Antigravity Helper" || true

timeout 10 rm -rf ~/.gemini/antigravity/{browser_recordings,implicit}/* \
       ~/Library/Application\ Support/{Google/Chrome/Default/Service\ Worker,Adobe/CoreSync,Notion/Partitions} \
       ~/.npm/_{npx,logs,prebuilds,cacache} 2>/dev/null &
timeout 15 find ~/.Trash -mindepth 1 -mtime +2 -delete 2>/dev/null &

# 3. Session Info & State
[ -f "NEXT_SESSION.md" ] && cp NEXT_SESSION.md "$ANTIGRAVITY_DIR/brain_log/session_$(date +%m%d%H%M).md" 2>/dev/null
timeout 5 node "$ANTIGRAVITY_DIR/agent/scripts/session_state.js" snapshot 2>/dev/null

wait && echo "✅ Checkout complete!" && df -h . | tail -1
```

## 🔍 自己評価 (必須)
| 項目 | スコア | 課題 |
|---|---|---|
| 効率/正確/コミュ/自律/品質 | X/5 | [簡潔に] |

### 改善ソリューション (即時実装)
[評価に基づく改善案と実装結果]

## 📋 NEXT_SESSION.md
1. [タスク]
2. [注意]
