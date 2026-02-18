---
description: セッションコンテキストを圧縮して永続化し、情報の損失を防ぐ
---

# Context Compression System

## 概要

セッション終了時にコンテキストを圧縮し、次回セッションで復元可能にする。

**問題**: セッション終了後、コンテキストが消える
**解決**: 重要情報を抽出・圧縮して永続化

---

## アーキテクチャ

### 1. セッションサマリー生成

**実行タイミング**: `/checkout` Phase 0

```bash
# セッション情報を収集
SESSION_SUMMARY=$(cat << EOF
{
  "session_id": "$(date +%Y%m%d_%H%M%S)",
  "duration": "$(($(date +%s) - $SESSION_START))",
  "metrics": {
    "commits": $(git log --oneline --since='6 hours ago' | wc -l),
    "files_changed": $(git diff --name-only HEAD~$(git log --oneline --since='6 hours ago' | wc -l) | wc -l),
    "lines_changed": $(git diff --stat HEAD~$(git log --oneline --since='6 hours ago' | wc -l) | tail -1 | grep -oE '[0-9]+' | paste -sd+ - | bc)
  },
  "achievements": [
    $(git log --oneline --since='6 hours ago' | sed 's/^[^ ]* //' | jq -R . | paste -sd,)
  ],
  "artifacts": [
    $(find ~/.gemini/antigravity/brain -name "*.md" -mmin -360 | jq -R . | paste -sd,)
  ]
}
EOF
)
```

---

### 2. 重要情報の抽出

**抽出対象**:
- 実装した機能
- 解決した問題
- 生成したアーティファクト
- Debateの結論
- 未完了タスク

**抽出ロジック**:
```javascript
// extract_context.js
const extractContext = (sessionData) => {
  return {
    // 最重要: ブログ候補
    blogCandidate: {
      score: calculateSocialScore(sessionData),
      title: extractTitle(sessionData),
      keyPoints: extractKeyPoints(sessionData),
      artifacts: sessionData.artifacts
    },
    
    // 重要: 未完了タスク
    pendingTasks: extractPendingTasks(sessionData),
    
    // 参考: セッション統計
    stats: sessionData.metrics
  };
};
```

---

### 3. 圧縮データの永続化

**保存先**: `.session_archive/YYYYMMDD_HHMMSS.json`

**構造**:
```json
{
  "session_id": "20260217_153000",
  "compressed_context": {
    "blog_candidate": {
      "score": 8.5,
      "title": "62.5点から100点へ",
      "key_points": [
        "Debate駆動開発",
        "Progressive Autonomy",
        "3層防御システム"
      ],
      "source_artifacts": [
        "/path/to/debate_fbl_in_go.md",
        "/path/to/final_evaluation_100.md"
      ]
    },
    "pending_tasks": [
      {
        "task": "checkpoint_to_blog",
        "reason": "Social Score: 8.5",
        "context_preserved": true
      }
    ]
  }
}
```

---

## 自己改善ループ

### Phase 1: セッション終了時

```bash
# /checkout Phase 0
echo "🧠 コンテキスト圧縮中..."

# 1. セッション情報収集
node $ANTIGRAVITY_DIR/agent/scripts/collect_session_data.js

# 2. 重要情報抽出
CONTEXT=$(node $ANTIGRAVITY_DIR/agent/scripts/extract_context.js)

# 3. 圧縮データ保存
echo "$CONTEXT" > .session_archive/$(date +%Y%m%d_%H%M%S).json

echo "✅ コンテキスト保存完了"
```

---

### Phase 2: 次回セッション開始時

```bash
# /checkin Phase 0
echo "📋 前回セッション確認中..."

# 最新のセッションアーカイブを取得
LATEST_SESSION=$(ls -t .session_archive/*.json | head -1)

if [ -f "$LATEST_SESSION" ]; then
  # ブログ候補チェック
  BLOG_SCORE=$(jq -r '.compressed_context.blog_candidate.score' "$LATEST_SESSION")
  
  if [ $(echo "$BLOG_SCORE >= 5" | bc) -eq 1 ]; then
    echo "📝 前回セッションのブログ候補があります（Score: $BLOG_SCORE）"
    echo "タイトル: $(jq -r '.compressed_context.blog_candidate.title' "$LATEST_SESSION")"
    echo ""
    echo "/checkpoint_to_blog を実行しますか？ (Y/n)"
    read -r response
    
    if [ "$response" != "n" ]; then
      # アーティファクトパスを復元
      ARTIFACTS=$(jq -r '.compressed_context.blog_candidate.source_artifacts[]' "$LATEST_SESSION")
      /checkpoint_to_blog --from-archive "$LATEST_SESSION"
    fi
  fi
  
  # Pending Tasksチェック
  PENDING=$(jq -r '.compressed_context.pending_tasks[]' "$LATEST_SESSION" 2>/dev/null)
  if [ -n "$PENDING" ]; then
    echo "📋 保留タスクがあります:"
    echo "$PENDING" | jq -r '.task + " (" + .reason + ")"'
  fi
fi
```

---

## ブログ提案の改善

### 即座実行 vs 保留

**判定ロジック**:
```bash
if [ $SCORE -ge 5 ]; then
  echo "🎯 ブログ価値あり（Score: $SCORE）"
  echo ""
  echo "1. 今すぐ実行"
  echo "2. 次回セッションで実行（コンテキスト保存）"
  echo "3. スキップ"
  echo ""
  read -p "選択 (1/2/3): " choice
  
  case $choice in
    1)
      /checkpoint_to_blog
      ;;
    2)
      # コンテキスト保存
      node $ANTIGRAVITY_DIR/agent/scripts/save_blog_context.js
      echo "✅ 次回セッションで提案します"
      ;;
    3)
      echo "スキップしました"
      ;;
  esac
fi
```

---

## 実装ファイル

### 新規作成

**`agent/scripts/collect_session_data.js`**:
- Git履歴収集
- アーティファクト収集
- メトリクス計算

**`agent/scripts/extract_context.js`**:
- 重要情報抽出
- ブログ候補判定
- Pending Tasks抽出

**`agent/scripts/save_blog_context.js`**:
- ブログソース保存
- アーティファクトコピー
- メタデータ保存

---

## 効果

**情報損失ゼロ**:
- セッション終了後もコンテキスト保持
- 次回セッションで復元可能

**自己改善ループ**:
- 毎セッションで評価
- 改善提案を次回に引き継ぎ

**ブログ提案の確実性**:
- 保留してもコンテキスト保存
- 次回セッションで再提案

---

> [!NOTE]
> これにより、「忘れる」ことが構造的に不可能になります。
