---
description: Trust Level System - 基礎実装
---

# Trust Level System

## 概要

実行履歴に基づいてTrust Scoreを計算し、自動/手動判定を行うシステム。

---

## Trust Score計算

### 基本ロジック

```javascript
// セッション状態に追加
{
  "trust_score": 0.8,  // 0.0 - 1.0
  "execution_history": [
    {
      "workflow": "/work",
      "success": true,
      "timestamp": "2026-02-17T15:00:00Z"
    }
  ]
}
```

### スコア計算式

```
Trust Score = (成功回数) / (総実行回数)

- 1.0: 完全信頼（全て成功）
- 0.8+: 高信頼（自動実行推奨）
- 0.5-0.8: 中信頼（確認推奨）
- 0.5未満: 低信頼（手動推奨）
```

---

## 自動/手動判定

### Level 2（Autonomous）での判定

```bash
if [ trust_score >= 0.8 ]; then
  # 自動実行
  実行
elif [ trust_score >= 0.5 ]; then
  # 確認あり
  echo "Trust Score: $trust_score"
  echo "続行しますか？ (Y/n)"
  read -r response
else
  # 手動推奨
  echo "⚠️ Trust Score低下: $trust_score"
  echo "手動確認を推奨します"
fi
```

---

## 実装状態

**Phase 1（基礎）**: ✅ 完了
- セッション状態定義
- スコア計算ロジック
- 判定ロジック

**Phase 2（実装）**: 計画中
- 実行履歴DB作成
- 実際のスコア計算
- ワークフローへの統合

---

## 使用例

```bash
# 初回実行
/go "タスク"
# → Trust Score: 0.0（履歴なし）
# → 確認あり

# 成功後
/go "タスク2"
# → Trust Score: 1.0（1/1成功）
# → 自動実行

# 失敗後
/go "タスク3"
# → Trust Score: 0.5（1/2成功）
# → 確認あり
```

---

> [!NOTE]
> 現在は基礎実装のみ。Phase 2で完全実装予定。
