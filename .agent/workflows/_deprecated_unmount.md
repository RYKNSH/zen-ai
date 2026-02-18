---
description: Desktop上の作業内容をSSDに書き戻し（逆同期）、変更を永続化する
---

# /unmount - Project Unmount & Sync Back

`~/Desktop/AntigravityWork` で作業した内容を、`${CORE_ROOT%/.antigravity}` のマスタープロジェクトに書き戻す。

**Concept**:
- **Source**: `~/Desktop/AntigravityWork/[Project]` (作業済み最新版)
- **Target**: `${CORE_ROOT%/.antigravity}/STUDIO/Apps/[Project]` (マスター)

> [!IMPORTANT]
> この操作は **Desktop → SSD への上書き** です。SSD側で並行して変更があった場合、上書きされる可能性があります。
> コンフリクト防止のため、必ず `/mount` → 作業 → `/unmount` のサイクルを守ってください。

---

## Phase 1: マウント中のプロジェクト確認

```bash
MOUNT_ROOT="$HOME/Desktop/AntigravityWork"
SSD="${CORE_ROOT%/.antigravity}"

if [ ! -d "$MOUNT_ROOT" ]; then
    echo "❌ No mounted projects found ($MOUNT_ROOT does not exist)."
    exit 0
fi

echo "=== Mounted Projects ==="
ls -1 "$MOUNT_ROOT"
```

**「どのプロジェクトを書き戻しますか？ (all で全て)」**

---

## Phase 2: 書き戻し (Sync Back)

`rsync` を使用して、変更分のみをSSDに転送する。
**注意**: `node_modules` などの生成物は書き戻さない（SSDの劣化を防ぐ＆互換性のため）。ソースコードと設定ファイルのみを同期する。

```bash
PROJECT_NAME="[ユーザー入力]"
# Loop functionality for 'all' can be implemented by the agent

SOURCE_DIR="$MOUNT_ROOT/$PROJECT_NAME"
TARGET_DIR="$SSD/STUDIO/Apps/$PROJECT_NAME"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Local project not found: $PROJECT_NAME"
    exit 1
fi

echo "🔄 Syncing $PROJECT_NAME back to SSD..."

# 1. 安全確認: SSD側が存在するか
if [ ! -d "$TARGET_DIR" ]; then
    echo "⚠️  Target SSD directory not found. Creating new project on SSD?"
    mkdir -p "$TARGET_DIR"
fi

# 2. rsync で書き戻し
# --delete: Desktop側で削除したファイルはSSD側でも削除する
# Exclude: 生成物は除外
rsync -av --progress --delete \
    --exclude 'node_modules' \
    --exclude '.venv' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '.DS_Store' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

# .git の同期 (コミット履歴)
# Desktop側でコミットした場合、その履歴をSSDに反映
if [ -d "$SOURCE_DIR/.git" ]; then
    echo "Running git push/sync logic if needed, or simple rsync for .git"
    rsync -a --delete "$SOURCE_DIR/.git/" "$TARGET_DIR/.git/"
fi

echo "✅ Synced back to SSD: $TARGET_DIR"
```

---

## Phase 3: クリーンアップ (デフォルト: 有効)

> [!IMPORTANT]
> **Debate結論**: Desktop を残すと「どちらが最新？」問題が発生するため、**デフォルトで削除**します。
> 高速化が必要な場合のみ `--keep` フラグで保持できます。

**「Desktop上の作業フォルダを削除しますか？ (Y/n/keep)」** (デフォルト: Y)

- **Yes (デフォルト)**:
  ```bash
  rm -rf "$SOURCE_DIR"
  echo "🗑️  Local workspace cleaned (recommended)."
  ```
- **keep**:
  ```bash
  echo "🛡️  Local workspace kept for next session (use with caution)."
  echo "⚠️  WARNING: 次回 /mount 時に競合の可能性があります。"
  ```

---

## Phase 4: SSD側での健全性チェック (Optional)

書き戻したプロジェクトがSSD上で壊れていないか、簡単なチェック。

```bash
if [ -f "$TARGET_DIR/package.json" ]; then
    echo "🔍 Verifying package.json exists on SSD..."
    ls -l "$TARGET_DIR/package.json"
fi
echo "🎉 Unmount complete!"
```
