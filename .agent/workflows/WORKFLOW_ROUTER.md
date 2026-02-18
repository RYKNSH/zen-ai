---
description: AIエージェントの自律駆動用ルーティングテーブル。全ワークフローの分岐条件・遷移先を集約。
---

# WORKFLOW ROUTER

> [!IMPORTANT]
> このファイルはAIエージェントが**最初に読む**べき単一のルーティングテーブル。
> 全ワークフローの分岐条件・遷移先がここに集約されている。
> 個別WFファイルの Cross-Reference はこのファイルのサブセット。

---

## 0. Signal Protocol（ユーザー発言の解釈優先順）

エージェントは全てのユーザー発言を以下の**優先順**で解釈する:

| 優先度 | 種別 | 判定方法 | 動作 |
|--------|------|---------|------|
| 1 | **明示コマンド** | `/go`, `/work`, `/checkout` 等 | そのWFを直接実行 |
| 2 | **セッション制御語** | AUTO_TRIGGERS.md のパターン一致 | 対応WFを実行 |
| 3 | **現WF内の指示** | `.session_state` に実行中WFあり | 現WFの次ステップとして処理 |
| 4 | **新規タスク指示** | `.session_state` に実行中WFなし or 完了状態 | `/work` でルーティング |
| 5 | **質問・雑談** | 上記いずれにも非該当 | 回答のみ、WF変更なし |

**判定ルール**:
- 優先度 3 vs 4 の判定には `.session_state` の `Current.workflow` を参照する
- WF実行中でも明示コマンドは最優先（ユーザーの意図的な割り込み）
- 割り込み時は現WFの state を `interrupted` に更新

---

## 1. エントリーポイント（トリガー → ワークフロー）

### スラッシュコマンド（直接呼出し）

| コマンド | ワークフロー | 備考 |
|---------|------------|------|
| `/level` | `level.md` | 現在のAutonomy Level表示 |
| `/level 0` `/level manual` | `level.md` | L0 (Manual) に切替 |
| `/level 1` `/level careful` | `level.md` | L1 (Supervised) に切替 |
| `/level 2` `/level auto` | `level.md` | L2 (Autonomous) に切替 |
| `/level 3` `/level turbo` | `level.md` | L3 (Full Auto) — 確認付き |

### 自然言語トリガー

| パターン | ワークフロー | 備考 |
|---------|------------|------|
| 「おはよう」「始めよう」「作業開始」/ 6h+ 空白 | `/checkin` | `/go` が自動呼出し |
| 「終わり」「疲れた」「また明日」 | `/checkout` | `/go` が自動呼出し |
| 「すごいもの作りたい」「ビジョンから」「ゼロから設計」 | `/go --vision` → `/vision-os` | |
| 自然言語でタスク指定 | `/go "タスク"` → `/work` | |
| 「ブレイクタイム」「記事作成」 | `/checkpoint_to_blog` | |
| 「チェックポイント」 | `/checkpoint_to_blog` | |
| 「慎重にやって」「手動で確認して」「ゆっくり」 | `/level 0` or `/level 1` | Autonomy Level切替 |
| 「確認しながら」「一つずつ」 | `/level 1` | Autonomy Level切替 |
| 「いつも通りで」「自動で」「普通に」 | `/level 2` | Autonomy Level切替 |
| 「全自動で」「止まらないで」「ターボ」 | `/level 3` | Autonomy Level切替 |

### `/work` 内部ルーティング

| キーワード | 遷移先 |
|-----------|--------|
| 実装、追加、新機能 | `/new-feature` |
| バグ、修正、直して | `/bug-fix` |
| リファクタ、整理、改善 | `/refactor` |
| 仕様、設計、スペック | `/spec` |
| テスト、検証 | `/test` + `/fbl` |
| エラーチェック、スイープ、精査 | `/error-sweep` |
| デプロイ、リリース | `/ship` |
| レビュー、確認 | `/debate` |
| 本当に？、常識では、一般的に、検証して | `/galileo` |
| マイグレーション | `/db-migrate` |
| 不明 | ユーザーに確認 |

---

## 2. ワークフロー遷移グラフ

### メインフロー（`/go` 経由の標準パス）

```
/go
 ├─ /checkin
 │   ├─ [空き容量 < 10GB] → /cleanup-48h
 │   ├─ [Swap > 80%] → /lightweight
 │   ├─ NEXT_SESSION.md 読込
 │   └─ /dev
 │
 ├─ Phase 2A: /work → (ルーティング表) → 開発WF → /verify
 │
 ├─ Phase 2B: /vision-os (--vision 時)
 │   ├─ Phase 2: /debate deep --preset=titan
 │   ├─ Phase 4: /evolve-wiz → /debate team
 │   ├─ /verify
 │   └─ Phase 5: /debate team --preset=titan
 │
 └─ /checkout
     ├─ [Score ≥ 5] → /checkpoint_to_blog → /publish
     ├─ [Score 1-4] → Daily Log 提案
     └─ NEXT_SESSION.md → SSD保存
```

### 開発WF完了後の遷移

```
/spec → /galileo (技術選択時) → /debate quick → /new-feature
/new-feature → /galileo (アーキテクチャ選択時) → /verify --quick
/bug-fix → /verify --quick
/refactor → /verify --quick
```

### 検証・リリースチェーン

```
/verify
 ├─ Phase 1: /test
 ├─ Phase 2: /fbl [verify経由→Phase 0スキップ]
 │   └─ [エラー3回 or 30分超] → /debug-deep（自動突破）
 ├─ Phase 2.5: /error-sweep [--deep時フル / 通常時quick]
 │   └─ [Self-Repair 5回失敗] → /debug-deep（自動エスカレーション）
 └─ Phase 3: /debate quick

/debug-deep（自動発動）
 ├─ Step 1: コンテキスト保全（.session_stateに全記録）
 ├─ Step 2: First Principles 5-Why分析
 ├─ Step 3: アプローチ転換（前提を疑う）
 ├─ Step 4: 再実行
 └─ Step 5: 学習記録（.debug_learnings.md）

/galileo（直接 or 他WFから呼出）
 ├─ Phase 1: Consensus Map
 ├─ Phase 2: Evidence Audit
 ├─ Phase 3: Adversarial Hypothesis
 ├─ Phase 4: First Principles Rebuild
 └─ Phase 5: Verdict → CONFIRM / CHALLENGE / OVERTURN
     └─ [OVERTURN] → ユーザー確認必須

/verify 成功 → /ship
 ├─ Phase 1: /build
 ├─ Phase 2: /db-migrate
 └─ Phase 4: /deploy (内部実装)
```

### Autonomy Level 切替

```
/level [0|1|2|3]
 └─ .session_state の autonomy_level を更新
 └─ 全WFのPAUSE条件がリアルタイムで切替
 └─ [L3] 確認プロンプト表示
```

### ナレッジサイクル

```
/checkpoint_to_blog
 ├─ QA: /debate deep --preset=social-knowledge
 └─ → /publish → ユーザー手直し → /learn_from_blog
```

---

## 3. 条件分岐テーブル

| 分岐ポイント | 条件 | True パス | False パス |
|-------------|------|----------|-----------|
| `/go` Phase 2 | `--vision` フラグ | `/vision-os` | `/work` |
| `/checkin` Phase 1 | 空き容量 < 10GB | `/cleanup-48h` 実行 | スキップ |
| `/checkin` Phase 1 | Swap > 80% | `/lightweight` 提案 | スキップ |
| `/checkin` Phase 2.7 | NEXT_SESSION.md 存在 | 内容表示+確認 | 新規セッション |
| `/checkout` Phase 0 | Score ≥ 5 | `/checkpoint_to_blog` 提案 | Daily Log or スキップ |
| `/checkout` Phase 2 | Vision OSセッション | 乖離チェック実行 | スキップ |
| `/verify` Phase 2 | verify経由か直接か | `/fbl` Phase 0 スキップ | `/fbl` 全Phase |
| `/verify` 結果 | 全パス | `/ship` 提案 | 修正ループ |
| `/fbl` Phase 6 | ループ回数 < 3 | 再検証 | → `/debug-deep`（自動突破） |
| `/fbl` 経過時間 | 30分未満 | 続行 | → `/debug-deep`（自動突破） |
| `/vision-os` Phase 5 | debate 合否 | Phase 6 へ | → `/debug-deep`（自動突破） |
| `/debug-deep` Step 4 | 再実行成功 | 元WFに復帰 | さらに3回失敗→真のPAUSE |
| `/error-sweep` Phase 6 | critical = 0 | CLEAN / CONDITIONAL PASS | Self-Repairループ（上限5回） |
| `/error-sweep` Self-Repair | 5回失敗 | - | → `/debug-deep` 自動エスカレーション |
| `/debate` | preset指定あり | preset チーム使用 | 動的チーム編成 |
| `/galileo` Phase 5 | Verdict = OVERTURN | ユーザー確認必須 | 自動進行 |
| `/evolve-wiz` | vision-os経由 | `--preset=titan` 適用 | 動的チーム編成 |

---

## 4. 優先度ルール

1. **安全性 > 自律性**: 破壊的操作（deploy, db-migrate, ファイル削除）は全Levelでユーザー確認必須（L3のstaging除く）
2. **verify は省略不可**: 開発WF完了後、verify をスキップして ship してはならない
3. **checkin は冪等**: 何回呼んでも同じ結果になる（副作用: cleanup のみ）
4. **checkout は一度きり**: デュアル実行を防止（state で管理）
5. **Autonomy Level は `.antigravity_config` で制御**: デフォルト L2。PAUSE条件は `WORKFLOW_CONTRACTS.md` の Autonomy Level セクションを参照
6. **verify は規模自動判定**: `--quick`/`--deep` 未指定時は Phase 0 で変更規模から自動判定
