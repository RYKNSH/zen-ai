---
description: 全ワークフローの入力・出力・完了条件・エラー回復を定義するデータ契約集。
---

# WORKFLOW CONTRACTS

> [!IMPORTANT]
> このファイルはAIエージェントが各ワークフローの**入出力・完了判定・エラー回復**を確認するための契約書。
> WORKFLOW_ROUTER.md とセットで使用する。

---

## 契約フォーマット

各WFは以下の4項目で定義:
- **入力**: 呼出時に必要なデータ
- **出力**: 完了時に生成されるデータ
- **完了条件**: 何をもって「完了」とするか
- **エラー時**: 失敗時のリトライ・フォールバック・エスカレーション

---

## メタワークフロー層

### `/go`
| 項目 | 定義 |
|------|------|
| **入力** | `[タスク文字列]` (任意), `--vision [ビジョン文字列]` (任意) |
| **出力** | セッション完了レポート（checkout出力を継承） |
| **完了条件** | `/checkout` が正常完了 |
| **エラー時** | 各Phase独立。checkin失敗→再実行。work失敗→ユーザーに報告。checkout失敗→最低限git save |

### `/work`
| 項目 | 定義 |
|------|------|
| **入力** | タスク文字列（自然言語） |
| **出力** | 選択されたWFの出力を継承 |
| **完了条件** | 子WF + `/verify` が完了 |
| **エラー時** | WF判定失敗→ユーザーに確認。子WF失敗→子WFのエラー処理に委譲 |

---

## セッションライフサイクル層

### `/checkin`
| 項目 | 定義 |
|------|------|
| **入力** | なし（自動検出） |
| **出力** | 環境ステータスレポート, NEXT_SESSION.md の内容（存在時）, Deferred Tasks リトライ結果 |
| **完了条件** | Phase 1-3 全完了（Phase 2.75 Deferred Tasks含む）, 環境が作業可能状態 |
| **エラー時** | SSD未接続→ローカルのみで続行。npm install失敗→エラー表示して続行。Deferred Tasksリトライ失敗→記録を保持して続行 |

### `/checkout`
| 項目 | 定義 |
|------|------|
| **入力** | セッション中の作業コンテキスト（自動収集） |
| **出力** | `NEXT_SESSION.md`, SSDブレインログ, コミット |
| **完了条件** | Phase 0-4 全完了, git変更が保存済み |
| **エラー時** | Score計算失敗→スキップしてログ保存。git失敗→手動コミット提案。SSD未接続→ローカル保存のみ |

---

## ビジョン駆動層

### `/vision-os`
| 項目 | 定義 |
|------|------|
| **入力** | ビジョン文字列（曖昧なリクエスト） |
| **出力** | `VISION.md`, 実装コード, デプロイ可能な成果物 |
| **完了条件** | Phase 5 Quality Gate パス + Phase 6 完了 |
| **エラー時** | debate Block→修正ループ（最大3回）。3回失敗→ユーザーにビジョン再定義を提案 |

### `/evolve-wiz`
| 項目 | 定義 |
|------|------|
| **入力** | 未知技術のキーワード or 実装ファイルパス |
| **出力** | 実装コード, アンチパターンリスト, debate結果 |
| **完了条件** | Phase 4 Review Board パス |
| **エラー時** | Chaos Monkey失敗→アンチパターン記録して続行。debate拒否→修正ループ（最大3回） |

---

## 品質保証層

### `/debate`
| 項目 | 定義 |
|------|------|
| **入力** | 対象ファイル/テキスト, モード(`quick`/`deep`/`team`), preset(任意) |
| **出力** | 議論サマリー, 合否判定(`Pass`/`Block`), 指摘リスト |
| **完了条件** | 全ペルソナの発言完了 + Moderator による統合 |
| **エラー時** | 合意不能→過半数の判定を採用。preset不明→動的チーム編成にフォールバック |

### `/galileo`
| 項目 | 定義 |
|------|------|
| **入力** | 検証対象の主張（自然言語）, `quick`(任意) |
| **出力** | Galileo Test Report（Verdict: CONFIRM/CHALLENGE/OVERTURN）, Evidence Summary, galileo_log 記録 |
| **完了条件** | Phase 5 Verdict 出力完了 + galileo_log 保存 |
| **エラー時** | Web検索失敗→ナレッジベースのみで判定。証拠不足→CHALLENGE判定（CONFIRMもOVERTURNもしない）。OVERTURN判定→ユーザー確認必須（PAUSE） |

### `/verify`
| 項目 | 定義 |
|------|------|
| **入力** | なし（カレントディレクトリの変更を自動検出）, `--quick`/`--deep` (任意) |
| **出力** | 検証レポート（テスト結果, lint, typecheck, レビュー）, `ship可能` or `要修正` |
| **完了条件** | Phase 1-3 全パス |
| **エラー時** | テスト失敗→失敗箇所を報告、呼出元に戻る。lint失敗→自動修正試行（最大1回） |

### `/fbl`
| 項目 | 定義 |
|------|------|
| **入力** | なし（自動検出）, `quick`/`deep` (任意), verify経由フラグ(内部) |
| **出力** | 検証レポート, 修正リスト, 監査ログ(`fbl_audit.log`) |
| **完了条件** | Phase 7 完了 or Self-Repair ループ上限(3回)到達 |
| **エラー時** | 3回修正失敗→強制停止+ユーザー報告。タイムアウト(30分)→強制停止 |

### `/error-sweep`
| 項目 | 定義 |
|------|------|
| **入力** | 変更ファイルリスト(自動検出), `quick`/`full`(任意), `--changed-only`(任意) |
| **出力** | Sweep Report(severity別), 修正リスト, Verdict, `.sweep_patterns.md` 更新(Self-Repair 2回以上時) |
| **完了条件** | critical = 0（CLEAN or CONDITIONAL PASS）+ Phase 7 学習記録完了(該当時) |
| **エラー時** | Self-Repair 5回失敗→`/debug-deep` 自動エスカレーション。タイムアウト(45分)→強制停止+レポート出力 |

---

## 開発サイクル層

### `/spec`
| 項目 | 定義 |
|------|------|
| **入力** | 機能名（自然言語） |
| **出力** | `docs/SPEC.md`, debate quick 結果 |
| **完了条件** | SPEC.md生成 + debate quick パス + ユーザー承認 |
| **エラー時** | debate指摘→SPEC.md修正して再debate。ユーザー不承認→インタビューやり直し |

### `/new-feature`
| 項目 | 定義 |
|------|------|
| **入力** | SPEC.md(任意), 機能要件（自然言語可） |
| **出力** | 実装コード, テスト, `docs/DECISIONS.md`, verify結果 |
| **完了条件** | Step 8 品質ゲートパス + Step 11 verify完了 |
| **エラー時** | ユーザー不承認(Step 4)→Step 3に戻る。品質ゲート失敗→Step 6に戻る(最大3回) |

### `/bug-fix`
| 項目 | 定義 |
|------|------|
| **入力** | バグ報告（再現手順 or エラーメッセージ） |
| **出力** | 修正コード, 回帰テスト, 振り返りメモ, verify結果 |
| **完了条件** | バグ再現テストがパス + verify完了 |
| **エラー時** | 再現不能→ユーザーに追加情報要求。根本原因特定不能→バンドエイド+BOTTLENECK.md記録 |

### `/refactor`
| 項目 | 定義 |
|------|------|
| **入力** | 対象コード/モジュール, リファクタリング目的 |
| **出力** | 修正コード, パフォーマンス比較(任意), verify結果 |
| **完了条件** | 全テストパス維持 + verify完了 |
| **エラー時** | テスト失敗→直前のステップにrevert。パフォーマンス劣化→ユーザーに判断委譲 |

---

## インフラ層

### `/ship`
| 項目 | 定義 |
|------|------|
| **入力** | `staging`/`production` (任意, デフォルト: staging) |
| **出力** | デプロイURL, リリースレポート |
| **完了条件** | Phase 4 デプロイ成功 + ヘルスチェック通過 |
| **エラー時** | ビルド失敗→即中止+報告。デプロイ失敗→ロールバック手順提示。**production は常にユーザー確認必須** |

### `/deploy`
| 項目 | 定義 |
|------|------|
| **入力** | ビルド済みアーティファクト |
| **出力** | デプロイURL, ヘルスチェック結果 |
| **完了条件** | ヘルスチェック通過 + エラーログなし |
| **エラー時** | 失敗→ロールバック（`git revert HEAD`）。緊急→Hotfixブランチフロー。**直接呼出しは緊急時のみ、通常は /ship 経由** |

### `/dev`, `/test`, `/build`, `/db-migrate`
| 項目 | 定義 |
|------|------|
| **入力** | なし（プロジェクト設定に依存） |
| **出力** | 実行結果（成功/失敗 + ログ） |
| **完了条件** | コマンド正常終了（exit 0） |
| **エラー時** | /dev: ポート占有→lsof+kill提案。/test: 失敗→失敗テスト一覧。/build: 失敗→エラー箇所特定。/db-migrate: **自動実行禁止、常にユーザー確認** |

---

## ナレッジ層

### `/checkpoint_to_blog`
| 項目 | 定義 |
|------|------|
| **入力** | 作業コンテキスト（自動収集 or ユーザー指定） |
| **出力** | Notion記事（Draft状態）, debate QA結果 |
| **完了条件** | Notionアップロード成功 + debate QA パス |
| **エラー時** | Notion認証失敗→`auth_notion.js`再実行。QA失敗→記事修正ループ(最大2回) |

### `/publish`
| 項目 | 定義 |
|------|------|
| **入力** | Notion上のDraft記事 |
| **出力** | 配信スケジュール, 昇格結果 |
| **完了条件** | Ready状態への昇格 + スケジュール割当 |
| **エラー時** | スクリプト失敗→手動対応案提示 |

### `/learn_from_blog`
| 項目 | 定義 |
|------|------|
| **入力** | Notion記事URL or Page ID |
| **出力** | スキル更新差分, 学習レポート |
| **完了条件** | スキルファイル更新 + ユーザーへ報告 |
| **エラー時** | 記事取得失敗→URL確認要求 |

### `/cleanup-48h`, `/lightweight`
| 項目 | 定義 |
|------|------|
| **入力** | なし |
| **出力** | 削除結果レポート, 空き容量 |
| **完了条件** | 全ステップ実行 + 空き容量表示 |
| **エラー時** | 削除失敗→スキップして次へ。purge失敗→sudo不要でスキップ |

### `/level`, `/level 0`, `/level 1`, `/level 2`, `/level 3`
| 項目 | 定義 |
|------|------|
| **入力** | レベル番号(0-3) or エイリアス(manual/careful/auto/turbo) or なし |
| **出力** | 現在レベル表示（引数なし）or 切替完了メッセージ |
| **完了条件** | `.session_state` の `autonomy_level` 更新 |
| **エラー時** | 不正な引数→使用方法表示。L3切替→確認プロンプト（拒否時は変更なし） |

## Autonomy Level（自律レベル）

> [!IMPORTANT]
> プロジェクトの `.antigravity_config` で設定。未設定時のデフォルトは **L2（Autonomous）**。

| Level | 名前 | PAUSE条件 | 用途 |
|-------|------|-----------|------|
| L0 | Manual | 全ステップで確認 | デバッグ・慎重な操作 |
| L1 | Supervised | 設計承認 + 破壊的操作 + 情報不足 | 初期段階の開発 |
| **L2** | **Autonomous** | **破壊的操作 + 情報不足のみ** | **バイブ開発（デフォルト）** |
| L3 | Full Auto | 本番デプロイのみ確認 | 信頼関係確立後 |

### 設定ファイル
```yaml
# プロジェクトルート/.antigravity_config
autonomy_level: 2  # L0-L3
```

---

## ブロッカー定義（PAUSE vs 自動続行 vs 自動突破）

### PAUSE条件（Autonomy Level別）

| PAUSE条件 | L0 | L1 | L2 | L3 |
|-----------|----|----|-------|----|
| 破壊的操作（deploy production, db-migrate, ファイル削除） | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE | staging自動 / 本番PAUSE |
| 課金・決済操作（API課金, サブスク変更, 外部サービス契約） | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE |
| 設計承認（/new-feature Step 4, /spec Phase 2） | ✅ PAUSE | ✅ PAUSE | ⚡ 条件付き自動 | ⚡ 自動 |
| 情報不足（/spec 回答不能, /bug-fix 再現不能） | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE |
| `/work` ルーティング確認 | ✅ PAUSE | ✅ PAUSE | ⚡ 自動実行 | ⚡ 自動実行 |
| `/galileo` OVERTURN 判定 | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE | ✅ PAUSE |

> [!CAUTION]
> **課金・決済操作は全LevelでPAUSE**。具体例:
> - 外部APIの有料プラン切替 / アップグレード
> - Stripe / Paddle 等の決済系操作
> - クラウドリソースのスケールアップ（コスト増加）
> - DNSドメイン購入 / SSL証明書購入
> - npmパッケージの有料プラン契約

**L2 の「条件付き自動」ルール**:
- 新ファイル3つ以上の作成 → 設計レビュー（PAUSE）
- DB schema変更 → 設計レビュー（PAUSE）
- 上記以外 → AI自己レビュー（`/debate quick`）で代替（自動続行）

### 自動突破条件（全Level共通 — PAUSEしない → `/debug-deep` で突破）

| 条件 | 動作 |
|------|------|
| エラー上限到達（fbl 3回, debate 3回Block） | → `/debug-deep` 自動発動（First Principles突破） |
| タイムアウト（fbl 30分） | → `/debug-deep` 自動発動（アプローチ転換） |
| `/error-sweep` Self-Repair 5回失敗 | → `/debug-deep` 自動エスカレーション |
| `/debug-deep` がさらに3回失敗 | → **真のPAUSE**（エスカレーション） |
| **SSD I/O ハング**（10s超過） | → 3-Layer Defense自動発動（`safe-commands.md` 参照）→ 全失敗時Deferred Tasks記録 |

### セッション終了の扱い

| 条件 | 動作 |
|------|------|
| `/checkout` 完了 | NEXT_SESSION.md に次タスクを記録 → 次回 `/checkin` で自動再開 |
| Compaction 発生 | `.session_state` から自動復元 |

### 自動続行する場面（全Level共通 — PAUSEしない）
- テスト実行・lint・typecheck
- debate（全モード）
- ファイル読み書き
- git add/commit（push以外）
- コード生成・修正
- ワークフロー間遷移
- .session_state の読み書き
- staging デプロイ（L3では本番も含む）
- `/debug-deep` の自動発動と実行
- `/verify` の規模自動判定と実行

---

## 🏥 Health Check Protocol（deep系WFリソースガード）

> [!IMPORTANT]
> deep系ワークフロー（長時間・多フェーズ実行）のメジャーPhase間で自動適用。
> SWAP圧迫によるエージェント応答劣化・ワークフロー不安定化を予防する。

### 適用対象WF

| WF | 適用タイミング | 実装状況 |
|----|--------------|---------|
| `/fbl deep` | Phase 0, 3, 5.5, 6 の間 | ✅ 実装済み (documented) |
| `/verify --deep` | Phase 0, 1, 2, 2.5, 3 の間 | ✅ 実装済み (documented) |
| `/vision-os` | Phase 1-6 のメジャーPhase間 | ✅ 実装済み (documented) |
| `/debug-deep` | Step 2, 3, 4, 5 の間 | ✅ 実装済み (documented) |
| `/debate deep` | Round 2以降の開始前 | ✅ 実装済み (code) |
| `/error-sweep` | Phase 3, 5 の開始前 | ✅ 実装済み (documented) |
| `/checkout` | Phase -1 (Pre-flight) | ✅ 実装済み (code) |

### Pre-flight（WF開始前）

deep系WF開始時に `/lightweight` を自動実行してクリーンな状態で開始する。

**`/checkout` 専用**: Phase -1 でSWAPチェックを実行し、閾値超過時にmini-lightweightを自動実行。

### Mid-flight Health Check（Phase間）

```bash
# Phase間で実行する Health Check
swap_mb=$(sysctl vm.swapusage | awk '{print $7}' | sed 's/M//')
echo "🏥 Health Check: SWAP ${swap_mb}MB"

# 閾値超過時のみクリーンアップ（2048MB = 2GB）
if [ $(echo "$swap_mb > 2048" | bc) -eq 1 ]; then
  echo "⚠️ SWAP高負荷検知 — mini-lightweight 実行"
  # 安全な操作のみ:
  find ~/.gemini/antigravity/browser_recordings -type f -mmin +120 -delete 2>/dev/null
  rm -rf ~/.npm/_logs 2>/dev/null
  # 残存プロセス確認（dev serverの二重起動等）
  echo "--- orphan process check ---"
  ps aux | grep -E 'node.*dev|next.*dev|vite' | grep -v grep
fi
```

### やらないこと（副作用リスク回避）

| 操作 | 理由 |
|------|------|
| `purge` | ファイルI/Oキャッシュミスで直後の処理が逆に遅くなる |
| `rm -rf ~/.npm/_cacache` | 実行中テストランナーがcacheを参照している可能性 |
| Chrome SW削除 | ブラウザ操作Phase中の場合に副作用 |

### 将来課題

- SWAP閾値のマシン別動的化（`sysctl hw.memsize` でRAM量を取得→比率ベースに）
- 「不要プロセス」判定の厳密化（PID追跡ベースへ）


---

## 🧠 THINK GATES（5コア経由必須化）

> [!IMPORTANT]
> 全開発WF（`/new-feature`, `/bug-fix`, `/refactor`, `/spec`）の各フェーズで適用される品質ゲート。
> Autonomy Level × タスクサイズで自動選択される。WF内の `🧠 THINK` マーカーが発動ポイント。

### THINK = 5コアの頭文字

| Gate | コア機能 | 保証すること |
|------|---------|------------|
| **T** | Galileo Test (`/galileo`) | 事実に基づいているか — 一次ソースで検証 |
| **H** | First Principles (5-Why) | 根本原因に到達しているか — 表面的解決を排除 |
| **I** | Ideal Vision (天才会議 quick) | 理想から逆算しているか — Jensen/Steve/Elon 各1問 |
| **N** | Negotiate (Deep Debate) | 多角的に検証されたか — ペルソナ議論 |
| **K** | Knowledge Loop (強化学習) | 同じミスを繰り返さないか — 学習データ参照+蓄積 |

### タスクサイズ自動判定

| Size | 条件 |
|------|------|
| **Small** | 変更ファイル 1-2個 |
| **Medium** | 変更ファイル 3-5個 |
| **Large** | 変更ファイル 6+個, DB schema変更, アーキテクチャ変更, 新API追加 |

### Core Engagement Matrix（フェーズ × サイズ）

| フェーズ | Small | Medium | Large |
|---------|-------|--------|-------|
| **計画** | H | H + T(quick) + N(quick) | H + T + N(deep) + I |
| **設計** | — | N(quick) | N(deep) + I |
| **実装** | — | — | — |
| **検証** | K(参照) | K + N(quick) | K + N(deep) + T |
| **デバッグ** | H + K | H + K + T(quick) | H + K + T + N(deep) |

### Level別適用範囲

| Level | 適用範囲 |
|-------|---------|
| **L0** | 任意（ユーザーが手動で呼ぶ） |
| **L1** | Large のマトリクスのみ強制 |
| **L2** | **全Size で T(Galileo) + N(Debate) + K(Learn) 強制** |
| **L3** | **全Size のマトリクス完全強制**（I(Ideal)含む） |

### 天才会議 Quick版（I gate）

フル `/vision-os` ではなく5分エッセンス版。L3 Large の計画・設計フェーズで自動発動:

- 🔧 **Jensen**: 「技術的に最適な選択か？」
- 🎨 **Steve**: 「ユーザー体験は理想的か？」
- 🚀 **Elon**: 「最もシンプルな解決策か？」

3問で結論を1行ずつ返す。フル版は `/go --vision` でのみ使用。

---

## セッション内ステート（.session_state）

エージェントはセッション中、以下の状態をプロジェクトルートの `.session_state` ファイルで管理する:

```markdown
# Session State
<!-- AUTO-GENERATED: Do not edit manually -->

## Current
- workflow: /new-feature
- phase: Step 6 (実装)
- started: 2026-02-10T18:50:00+09:00
- parent: /work
- parent_parent: /go

## History
- 18:30 /go started
- 18:31 /checkin completed (OK)
- 18:32 /dev completed (port 5173)
- 18:35 /work started ("ログイン機能のバグ修正")
- 18:35 /work routed to /bug-fix
- 18:40 /bug-fix completed (OK)
- 18:40 /verify --quick started
- 18:42 /verify completed (PASS)
- 18:45 /work started ("ユーザープロフィール機能")
- 18:45 /work routed to /new-feature
- 18:46 /new-feature Phase: Step 6 (実装)

## Pending
- [ ] /new-feature completion → /verify --quick
- [ ] session end → /checkout

## Design Decisions
- Step 3: REST API を選択（GraphQL は過剰。理由: CRUD中心の設計、クライアント1つ）
- Step 5: Prisma ORM を選択（理由: TypeScript型安全性、マイグレーション管理が容易）

## Debug Context (debug-deep 発動時のみ)
- trigger: なし
- error_history: なし

## Execution Summary
- 🔧 /bug-fix: ログイン機能のバグ修正。原因: セッショントークンの有効期限未チェック。修正ファイル: auth.ts, middleware.ts
- ✅ /verify: PASS (テスト 24/24, lint 0 errors)
- 🛠️ /new-feature: ユーザープロフィール機能実装中 (Step 6)
```

### 運用ルール

1. **更新タイミング**: WF開始時・Phase遷移時・WF完了時に更新
2. **読込タイミング**: Compaction後の最初の応答時に `.session_state` を読んでコンテキスト復元
3. **削除タイミング**: `/checkout` 完了時に削除（NEXT_SESSION.md に引き継ぎ）
4. **フォーマット**: Markdown（AIが自然に読み書き可能）
5. **場所**: プロジェクトルート（.gitignore に追加）
6. **Execution Summary**: WF完了時に1行で成果を追記。`/checkout` 時に NEXT_SESSION.md にコピーされ、次セッションでのコンテキスト復元に活用
