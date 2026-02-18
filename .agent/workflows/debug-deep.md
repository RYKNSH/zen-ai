---
description: エラー上限・タイムアウト到達時にディープリサーチ+First Principlesで根本原因を自律突破する本質的デバッグWF
---

# /debug-deep - 本質的デバッグ

> [!IMPORTANT]
> このWFは `/fbl` や `/verify` でエラー上限（3回）またはタイムアウト（30分）に到達した時に**自動発動**する。
> 付け焼き刃ではなくディープリサーチ + First Principlesで根本原因に到達し、自律的に突破する。

> 🏥 **Health Check Protocol 適用** — `WORKFLOW_CONTRACTS.md` 参照。Step間でswapチェック。

## Cross-Reference

```
/fbl エラー3回 or タイムアウト → /debug-deep（自動発動）
/verify 修正ループ上限 → /debug-deep（自動発動）
/vision-os debate 3回Block → /debug-deep（自動発動）
/error-sweep Self-Repair 5回失敗 → /debug-deep（自動エスカレーション）
/debug-deep 成功 → 元のWFに復帰 + Step 6: 強化学習
/debug-deep 失敗（さらに3回）→ PAUSE（真のエスカレーション）
```

---

## Step 1: コンテキスト保全（最重要）

Compactionに耐えるよう、すべての情報を `.session_state` に永続化する。

`.session_state` に以下を追記:

```markdown
## Debug Context
- trigger: /fbl エラー3回到達
- original_workflow: /bug-fix
- original_phase: Step 6

### Error History
1. [エラー内容1] → [試した修正1] → [結果: 失敗]
2. [エラー内容2] → [試した修正2] → [結果: 失敗]
3. [エラー内容3] → [試した修正3] → [結果: 失敗]

### Files Involved
- [ファイルパス1]: [そのファイルの役割]
- [ファイルパス2]: [そのファイルの役割]

### Design Decisions So Far
- [なぜこのアプローチを選んだか]
- [他に検討した選択肢]
```

> **これが残っていれば、Compactionが起きてもデバッグを続行できる。**

---

## Step 2: ディープリサーチ

**5-Why分析の前に、まず知識を集める。**

コードエラーの突破には正確な情報が不可欠。
以下の順でリサーチし、知見を `.session_state` の Debug Context に蓄積する。

### 2-1. 内部ナレッジ検索
1. **`.debug_learnings.md`**（プロジェクト単位）を読む — 過去に同じパターンはないか？
2. **`SSD/.antigravity/knowledge/`**（グローバル）を検索 — 関連ナレッジはないか？
3. **`.agent/skills/`** を検索 — 使えるスキルはないか？

### 2-2. 公式ドキュメント・Web検索
1. エラーメッセージで **公式ドキュメント** を検索（`search_web` + `read_url_content`）
2. ライブラリ/フレームワークの **GitHub Issues** を検索
3. **Stack Overflow** / 技術ブログで既知の解決策を探す

### 2-3. リサーチ結果の記録
```markdown
### Research Findings
- [ソース1]: [発見した情報]
- [ソース2]: [発見した情報]
- [関連パターン]: [過去の.debug_learningsからの一致]
```

> **リサーチなしに修正に入らない。情報が足りなければ追加リサーチ。ディープリサーチでも情報が足りない場合に限り、ユーザーへインタビュー（PAUSE）。**

---

## Step 3: First Principles 分析

リサーチ結果を踏まえて、First Principlesスキルを発動し5-Why分析を実行する。

```markdown
## 5-Why分析

### Why 1: なぜ[最新のエラー]が起きたか？
→ [直接原因]（リサーチで裏付け: [ソース]）

### Why 2: なぜ[直接原因]なのか？
→ [構造原因]

### Why 3: なぜ[構造原因]なのか？
→ [設計原因]

### Why 4: なぜ[設計原因]なのか？
→ [前提の誤り]

### Why 5: なぜ[前提の誤り]があるのか？
→ [根本原因]
```

**重要: 「何を前提にしていたか」を洗い出す。**

3回失敗したということは、前提自体が間違っている可能性が高い。
修正すべきはコードではなく、前提かもしれない。

---

## Step 4: アプローチ転換

これまでの修正アプローチを**全て破棄**する。

```markdown
## アプローチ転換

### 破棄するアプローチ
- [これまで試した修正方針]

### リサーチから導かれた正しい手法
- [公式ドキュメント/先行事例に基づく修正方針]

### 根本原因から導かれる新アプローチ
- [First Principlesで導いた新しい修正方針]

### 理想系（制約なし）
- [もし何でもできるなら、どう解決するか]

### 現実的な実装パス
- [理想系から逆算した現実的な手順]
```

必要なら設計自体を変更する。
「このコードを直す」ではなく「この設計を変える」という視点。

---

## Step 5: 再実行 + git保全

新アプローチで修正→テスト。

**修正前に必ず git checkpoint を作る:**
```bash
git add -A && git commit -m "debug-deep: checkpoint before approach change"
```

- 成功 → git commit → 元のWFに復帰 + **Step 6: 強化学習**
- 失敗 → git revert でロールバック → 別アプローチで再試行
- 失敗（さらに3回） → **真のPAUSE**（ユーザーにエスカレーション）
  - このとき `.session_state` の Debug Context + Research Findings が完全な報告書になる

---

## Step 6: 強化学習（自動・二重保存）

成功・失敗に関わらず、デバッグ結果を**二重に**保存する。

### 6-1. プロジェクト単位: `.debug_learnings.md`

プロジェクトルートに追記:

```markdown
## [日時] [元WF] [エラー概要]

### 根本原因
[5-Why分析の結果]

### 誤っていた前提
[最初に何を前提にしていて、それが間違っていたか]

### 正しいアプローチ
[最終的にどう解決したか]

### リサーチソース
[解決に役立った公式ドキュメント/Issues/記事のURL]

### 次回への教訓
[同様のエラーが起きたらどう対処すべきか]
```

### 6-2. グローバル: `SSD/.antigravity/knowledge/debug_patterns/`

エラーパターンが**プロジェクト固有でない場合**（フレームワーク起因、OS起因、一般的なパターン等）、グローバルナレッジにも保存:

```
SSD/.antigravity/knowledge/debug_patterns/
├── [framework]_[pattern].md    # e.g. nextjs_hydration_mismatch.md
├── [category]_[pattern].md     # e.g. macos_permission_sandbox.md
└── INDEX.md                    # パターン一覧（検索用）
```

> **次回の debug-deep Step 2 で、エージェントはプロジェクト `.debug_learnings.md` + グローバル `debug_patterns/` の両方を検索する。**
> これにより「同じ失敗を繰り返さない」強化学習ループが成立する。

### 6-3. 即時反映

学習記録は保存と同時にエージェントの知識として即時反映される:
- **同一セッション内**: `.session_state` に記録済みのため、Compaction後も参照可能
- **次回セッション**: `/checkin` でプロジェクトの `.debug_learnings.md` を自動参照
- **他プロジェクト**: グローバル `debug_patterns/` を Step 2 で自動検索

---

## 発動条件まとめ

| トリガー | 発動元 |
|---------|--------|
| `/fbl` Self-Repair 3回失敗 | 自動 |
| `/fbl` タイムアウト 30分 | 自動 |
| `/verify` 修正ループ上限 | 自動 |
| `/vision-os` debate 3回Block | 自動 |
| `/evolve-wiz` debate 3回拒否 | 自動 |
| `/error-sweep` Self-Repair 5回失敗 | 自動 |

**真のPAUSE（ユーザーエスカレーション）は `/debug-deep` がさらに3回失敗 + ディープリサーチでも情報不足の時のみ。**
