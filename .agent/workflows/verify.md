---
description: 実装後の検証を一括実行（/fblにリダイレクト）
---

# /verify - 統合検証ワークフロー

> [!NOTE]
> **このワークフローは `/fbl` にリダイレクトされます。**
> 
> `/verify` と `/fbl` の機能が重複していたため、統合しました。
> 今後は直接 `/fbl` を使用してください。

---

## 自動リダイレクト

```bash
echo "⚠️  /verify は /fbl にリダイレクトされます"
echo "📋 /fbl を実行中..."
echo ""

# /fbl を実行
/fbl
```

---

## 移行ガイド

### Before
```bash
/verify
```

### After
```bash
/fbl          # 標準検証（全フェーズ）
/fbl quick    # 高速検証（Phase 0+3のみ）
/fbl deep     # フルスタック検証 + ペルソナ批評
```

---

## /fbl の機能

`/fbl` (Feedback Loop) は以下を提供します:

**Phase 0**: Pre-Flight Check（lint, typecheck, test）  
**Phase 1**: DB Layer検証  
**Phase 2**: API Layer検証  
**Phase 3**: Frontend Layer検証  
**Phase 4**: E2E Data Flow検証  
**Phase 5**: 120% Quality Gate  
**Phase 6**: Self-Repair Loop  
**Phase 7**: Completion Report

詳細は `/fbl` ワークフローを参照してください。

実装作業（`/work`）完了後に実行する検証フェーズ。

## Cross-Reference

```
/work → /new-feature|/bug-fix|/refactor → /verify
/vision-os Phase 4完了後 → /verify
/verify → /test + /fbl + /error-sweep + /debate quick
/verify 成功後 → /ship
```
テスト、FBL（フィードバックループ）、エラースイープ、クイックレビューを連鎖実行。

---

## 使用方法

```
/verify              # 自動判定（変更規模から最適レベルを選択）
/verify --quick       # 強制quick（テストのみ）
/verify --deep        # 強制deep（全検証 + debate deep）
```

> 🏥 `--deep` 実行時は **Health Check Protocol 適用** — `WORKFLOW_CONTRACTS.md` 参照。

> [!TIP]
> デフォルトではAIが変更規模を分析して自動判定。`--quick`/`--deep`は強制指定時のみ。

---

## 自動連鎖プロセス

### Phase 0: Auto-Level Detection（規模自動判定）

> 🧠 **THINK GATE — 検証フェーズ**: `WORKFLOW_CONTRACTS.md` の Core Engagement Matrix を参照。
> Small: K(参照) | Medium: K + N(quick) | Large: K + N(deep) + T

変更規模を分析し、最適な検証レベルを自動選択:

| 条件 | 判定レベル | 実行内容 |
|------|-----------|----------|
| 変更ファイル 1-2個 | **quick** | Phase 1のみ |
| 変更ファイル 3-5個 | **standard** | Phase 1 + 2 + 2.5(quick) + 3 |
| 変更ファイル 6+個 or 新API追加 | **deep** | 全Phase + debate deep |
| DB schema 変更 or アーキテクチャ変更 | **deep + galileo** | 全Phase + debate deep + galileo |

```bash
# 変更ファイル数の検出
git diff --name-only HEAD~1 | wc -l
```

`--quick` / `--deep` が明示的に指定された場合は自動判定をスキップ。

### Phase 1: テスト実行
// turbo
```bash
pnpm test
```

テスト失敗時 → 即座に報告、Phase 2 をスキップ

---

### Phase 2: FBL（フィードバックループ）
// turbo

変更ファイルに対して自動検証:

```bash
pnpm lint && pnpm typecheck
```

- Lint エラー → 自動修正を提案
- Type エラー → 該当箇所を表示

---

### Phase 2.5: Error Sweep

`/error-sweep` によるコードレベルの徹底チェック:

- 通常時: `/error-sweep quick`（Phase 0 + 1 + 6 のみ）
- `--deep` 指定時: `/error-sweep`（全Phase実行）

critical = 0 でなければ Phase 3 に進まない。

---

### Phase 3: クイックレビュー

`/debate quick` 相当の簡易レビュー:

- Skeptic: 「この変更は本当に必要か？」
- Security: 「セキュリティリスクはないか？」

問題なければスキップ可能。

---

## 出力

```markdown
## ✅ /verify 完了

| 検証項目 | 結果 |
|----------|------|
| テスト | ✅ 全パス (12/12) |
| Lint | ✅ エラーなし |
| Typecheck | ✅ エラーなし |
| Error Sweep | ✅ CLEAN (critical: 0, warning: 1) |
| クイックレビュー | ✅ 問題なし |

**判定**: 🚀 ship 可能です
```

---

## オプション

| オプション | 効果 |
|-----------|------|
| `--quick` | 強制quick（テストのみ）— Phase 0 自動判定をスキップ |
| `--deep` | 強制deep（全検証 + `/debate deep`）— Phase 0 自動判定をスキップ |
| `--fix` | Lint エラーを自動修正 |
| (指定なし) | **Phase 0 で変更規模から自動判定** |

---

> [!TIP]
> `/verify` が成功したら `/ship` でリリースできます
