---
description: リリース準備を一括実行（deploy/db-migrate統合）
---

# /ship - 統合リリースワークフロー

検証完了（`/verify`）後に実行するリリースフェーズ。
DBマイグレーション、最終テスト、デプロイを連鎖実行。

## Cross-Reference

```
/verify → /ship → /build + /db-migrate + /deploy
/go Phase 3 → /ship（任意）
/new-feature, /bug-fix → /verify → /ship
```

> [!NOTE]
> `/deploy` は `/ship` の内部 Phase 4 として実行される。
> リリース時は常に `/ship` を使うこと。

---

## 使用方法

```
/ship
/ship staging      # ステージング環境
/ship production   # 本番環境（確認必須）
```

---

## 自動連鎖プロセス

### Phase 1: プリフライトチェック
// turbo

```bash
# git_guard: CWDとプロジェクトの一致を検証
$ANTIGRAVITY_DIR/agent/scripts/git_guard.sh --check
```

```bash
pnpm build
```

ビルド失敗時 → 即座に中止

---

### Phase 2: DBマイグレーション（必要な場合）

マイグレーションファイルが検出された場合のみ実行:

```markdown
📋 マイグレーション検出

新規マイグレーション:
- 20260206_add_user_preferences.sql

実行しますか？ (Y/n)
```

---

### Phase 3: 最終テスト
// turbo

```bash
pnpm test
```

---

### Phase 4: デプロイ

```markdown
🚀 デプロイ準備完了

**環境**: [staging/production]
**変更ファイル**: 12件
**マイグレーション**: 1件

デプロイを実行しますか？ (Y/n)
```

> [!WARNING]
> production へのデプロイは必ず確認プロンプトを表示

---

## 出力

```markdown
## ✅ /ship 完了

| フェーズ | 結果 |
|----------|------|
| ビルド | ✅ 成功 |
| マイグレーション | ✅ 1件適用 |
| テスト | ✅ 全パス |
| デプロイ | ✅ 完了 |

**デプロイURL**: https://staging.example.com
```

---

## オプション

| オプション | 効果 |
|-----------|------|
| `staging` | ステージング環境へデプロイ |
| `production` | 本番環境へデプロイ（確認必須） |
| `--dry-run` | 実行せずに計画のみ表示 |
| `--skip-migrate` | マイグレーションをスキップ |

---

> [!CAUTION]
> `/ship production` は必ずチームレビュー後に実行してください
