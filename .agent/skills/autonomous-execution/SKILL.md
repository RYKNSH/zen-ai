---
name: Autonomous Execution
description: 自律的なタスク実行とエージェントオーケストレーションを支援するスキル
---

# Autonomous Execution Skill

## 概要

このスキルは、複雑なタスクを自律的に分解・実行するためのフレームワーク **+ 実行エンジン** を提供する。
エージェントが人間の介入なしにタスクを完遂するための思考パターン、実行戦略、**および自律駆動ループ**を定義する。

## 発動条件

- 複数のステップを要するタスクが与えられた時
- 「自動で」「自律的に」「最後まで」などのキーワードがある時
- エラーからの自己回復が必要な時
- **`/go` が実行された時（自動的にこのスキルがアクティブになる）**

---

## Part 1: Execution Loop（実行エンジン）

> [!IMPORTANT]
> これがエージェントの自律駆動の**コアループ**。
> WORKFLOW_ROUTER.md で次の行き先を判断し、WORKFLOW_CONTRACTS.md で入出力を確認し、
> このループで実行し続ける。

### ループ構造

```
┌──────────────────────────────────────────────┐
│              EXECUTION LOOP                   │
│                                               │
│  1. READ     .session_state.json を読む       │
│      ↓                                        │
│  2. DECIDE   ROUTER + CONTRACTS で次を決定     │
│      ↓                                        │
│  3. CHECK    ブロッカー？（CONTRACTS参照）      │
│      ├─ YES → PAUSE（ユーザー確認待ち）        │
│      └─ NO  ↓                                 │
│  4. EXECUTE  アクションを実行                   │
│      ↓                                        │
│  5. UPDATE   .session_state.json を更新        │
│      ↓                                        │
│  └──→ Step 1 に戻る                           │
└──────────────────────────────────────────────┘
```

### 各ステップの詳細

#### Step 1: READ
```bash
# 実ファイルから読み込み
STATE=$(node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js read)
if [ "$STATE" != "null" ]; then
  # 現在のWF、Phase、親WFを読み込み
  # Compaction後のコンテキスト復元としても機能
  node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js summary
else
  # 新規セッション（/checkin から開始）
  node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js init
fi
```

#### Step 2: DECIDE
```
1. Signal Protocol でユーザー発言を分類（ROUTER Section 0）
2. 現WFの次Phaseを特定（個別WFファイル参照）
3. WF完了の場合:
   - CONTRACTS の出力を生成
   - 親WFの次ステップに遷移
   - 遷移先は ROUTER の遷移グラフで判定
```

#### Step 3: CHECK BLOCKER
```
CONTRACTS の「ブロッカー定義」を参照:
PAUSEは3条件だけ:
- 破壊的操作 → PAUSE
- 設計承認必要 → PAUSE
- 情報不足 → PAUSE
- それ以外 → 自動続行（エラー上限含む）
```

#### Step 4: EXECUTE
```
0. 実行前に git checkpoint:
   git add -A && git commit -m "wip: [current phase description]"
1. アクションを実行（コード編集、コマンド実行、debate等）
2. 結果を評価:
   - 成功 → git commit → Step 5 へ
   - 失敗 → CONTRACTS のエラー時処理を実行
     - まず .debug_learnings.md + debug_patterns/ を検索（過去の同パターン）
     - リトライ可能 → リトライ（カウント増加）
     - 代替手段あり → git revert → 代替手段実行
     - エラー上限到達(3回) or タイムアウト(30分)
       → /debug-deep 自動発動（PAUSEしない）
       → ディープリサーチ + First Principlesで突破
       → 成功すれば元WFに復帰 + 強化学習記録
       → debug-deepもさらに3回失敗 → 真のPAUSE
```

#### Step 5: UPDATE
```bash
# WF遷移時
node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js set-workflow '<wf>' '<phase>'

# 設計判断時（Compaction対策: 設計判断の理由が消えない）
node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js add-decision '<context>' '<decision>' '<reason>'

# タスク完了時
node ${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/scripts/session_state.js complete-task '<task>'
```

**WF完了時の仕上げが必要か判定 → Step 6 へ**

#### Step 6: POLISH（仕上げフェーズ — WF完了時のみ）
```
開発系 WF（/new-feature, /bug-fix, /refactor）の完了時に発動:

1. ユーザーペルソナテスト（複数パターン）:
   - 初心者ユーザー: 「これ分かる？使える？」
   - パワーユーザー: 「效率的？ショートカットは？」
   - エッジケースユーザー: 「壊れるパターンは？」
   ⇒ 各ペルソナの声を収集し改善ソースとする

2. 議論の余地がなくなるまで反復:
   - ペルソナテスト → 改善 → 再テスト → 改善...
   - 全ペルソナが「問題なし」と判定するまで繰り返す
   - その上で初めてプロジェクトオーナー（開発者）に提案

3. git 保全:
   git add -A && git commit -m "polish: [improvement summary]"
```

> **POLISHが完了して初めて /verify → /ship のパスに進む。**
> **議論の余地がある限り、オーナーに提案しない。**

---

### Loop図

```
READ → DECIDE → CHECK → EXECUTE(+git) → UPDATE → [WF完了?]
                                                      │
                                              No → READに戻る
                                              Yes → POLISH
                                                      │
                                              全ペルソナ OK? → オーナー提案
                                              ↑ No → 改善→再テスト
```

## Part 2: 思考フレームワーク（Goal-Driven Execution）

### 1. 目標駆動（Goal-Driven）
常に最終目標を意識し、現在のアクションが目標達成に寄与するかを確認する。

### 2. 段階的分解（Progressive Decomposition）
大きなタスクを実行可能な最小単位まで分解する。
各サブタスクは独立して検証可能であること。

### 3. 失敗耐性（Failure Tolerance）
失敗を前提とした設計。各ステップでのロールバック戦略を持つ。

---

## Part 3: 自己回復パターン

| パターン | 条件 | アクション | 上限 |
|---------|------|----------|------|
| リトライ | 一時的エラー（ネットワーク、タイムアウト） | バックオフを伴うリトライ | 3回 |
| 代替手段 | 特定のツール/方法が失敗 | 別のツール/方法で同じ目標を達成 | 2回 |
| 部分ロールバック | タスク途中での致命的エラー | 最後の安定状態までロールバック | 1回 |
| エスカレーション | 自己回復不可能なエラー | PAUSE + ユーザーに通知 | - |

---

## Part 4: 出力形式

### 自律実行レポート（WF完了時）
```markdown
## 🤖 自律実行レポート

### 目標: [最終目標]
### ステータス: [成功|部分成功|失敗]

### 実行したタスク
| タスク | ステータス | 所要時間 |
|--------|-----------|---------| 
| ...    | ✅ 完了    | 1.2s    |

### 成果物
- [作成/変更されたファイル]

### 学習事項
- [今回学んだこと]
```

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `WORKFLOW_ROUTER.md` | 地図（どこへ行くか） |
| `WORKFLOW_CONTRACTS.md` | 契約（何を受け取り何を返すか + ブロッカー定義） |
| `.session_state.json` | 現在地（今どこにいるか）— `session_state.js` で管理 |
| このスキル | エンジン（ループを回し続ける） |
