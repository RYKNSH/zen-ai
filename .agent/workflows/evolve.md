---
description: 自己進化提案 - 使用データに基づく改善案を生成
---

# /evolve - 自己進化ワークフロー

観察→分析→提案→実装→検証のサイクルを実行し、システムの自己改善を促進する。

---

## 1. 使用データ収集

```bash
echo "=== Usage Analysis ==="
cat $ANTIGRAVITY_DIR/USAGE_TRACKER.md 2>/dev/null | grep -E "^\| /" | head -10
```

---

## 2. エラーログ分析

```bash
echo "=== Recent Errors ==="
find $ANTIGRAVITY_DIR/logs -name "*.log" -mtime -7 -exec grep -l "error\|Error\|ERROR" {} \; 2>/dev/null | head -5
```

---

## 3. ナレッジ鮮度チェック

```bash
echo "=== Stale Knowledge (14+ days) ==="
find $ANTIGRAVITY_DIR/knowledge -name "metadata.json" -mtime +14 2>/dev/null | wc -l
```

---

## 4. 改善提案生成

分析結果に基づき、以下のカテゴリで改善案を提案:

| カテゴリ | チェック項目 |
|---------|-------------|
| **冗長性** | 類似機能を持つワークフロー/スキルはないか？ |
| **未使用** | 30日以上使われていないリソースはないか？ |
| **エラー頻発** | 同じエラーが繰り返されていないか？ |
| **不足** | よく手動で行う操作をワークフロー化できないか？ |
| **鮮度** | 古いナレッジは更新が必要か？ |

---

## 5. Multi-Persona Debate

提案に対して `/debate` を実行し、品質を担保:

```
/debate quick
```

---

## 6. 実装 & 記録

ユーザー承認後:
1. ワークフロー/スキル/ルールを更新
2. SELF_EVOLUTION.md の進化履歴に記録
3. GEMINI.md.master に同期

---

## 完了メッセージ

✅ Evolution cycle complete
- [N]件の改善を実装
- 次回の自動/evolve: 7日後
