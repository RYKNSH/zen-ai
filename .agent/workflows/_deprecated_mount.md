---
description: SSD上のプロジェクトをDesktopに「マウント」（同期）し、高速なPCネイティブ環境で作業する
---

# /mount - Project Mount System

SSD (`${CORE_ROOT%/.antigravity}`) 上のプロジェクトを、PC内蔵SSD (`~/Desktop/AntigravityWork`) に同期し、高速なI/O環境で作業するためのワークフロー。

**Concept**:
- **Source**: `${CORE_ROOT%/.antigravity}/STUDIO/Apps/[Project]` (低速I/O, 真実のソース)
- **Work**: `~/Desktop/AntigravityWork/[Project]` (高速I/O, 使い捨て作業領域)

> [!WARNING]
> マウント中は、**必ずDesktop側のファイルを編集**すること。SSD側を直接いじると競合する。
> 作業終了時は必ず `/unmount` または `/checkout` で変更を書き戻すこと。

---

## Phase 1: プロジェクト選択

1. マウント先ディレクトリの準備
```bash
MOUNT_ROOT="$HOME/Desktop/AntigravityWork"
mkdir -p "$MOUNT_ROOT"
```

2. SSD上のプロジェクト一覧を表示
```bash
SSD="${CORE_ROOT%/.antigravity}"
echo "=== Available Projects on SSD ==="
find "$SSD/STUDIO/Apps" -maxdepth 2 \( -name "package.json" -o -name "pyproject.toml" \) -not -path "*/node_modules/*" -not -path "*/.venv/*" 2>/dev/null | while read manifest; do
    DIR=$(dirname "$manifest")
    NAME=$(basename "$DIR")
    echo "  📂 $NAME ($DIR)"
done
```

3. ユーザーに選択させる
**「どのプロジェクトをDesktopにマウントしますか？」**
（プロジェクト名を入力してもらう）

---

## Phase 2: 同期 (Mount) + キャッシュ利用

選択されたプロジェクトを `rsync` で高速同期する。
`node_modules` や `.venv` は重すぎる＆アーキテクチャ依存の可能性があるため、**コピーしない**。

> [!TIP]
> **Debate結論**: キャッシュテンプレートを使用することで、2回目以降のマウントが数秒で完了します。

```bash
PROJECT_NAME="[ユーザー入力]"
SOURCE_DIR="$SSD/STUDIO/Apps/$PROJECT_NAME"
TARGET_DIR="$MOUNT_ROOT/$PROJECT_NAME"
CACHE_DIR="$SSD/.cache/$PROJECT_NAME"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Project not found: $PROJECT_NAME"
    exit 1
fi

echo "🚀 Mounting $PROJECT_NAME to Desktop..."

# rsync: node_modules, .venv, .git, .next 等を除外してソースコードのみ同期
rsync -av --progress \
    --exclude 'node_modules' \
    --exclude '.venv' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '__pycache__' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

# .git は別途コピー（履歴保持のため。ただし巨大な場合は注意）
# 今回は「作業用」として .git もコピーするが、軽量化したい場合は除外も検討
cp -R "$SOURCE_DIR/.git" "$TARGET_DIR/" 2>/dev/null

echo "✅ Mounted to: $TARGET_DIR"
```

---

## Phase 3: 高速インストール & セットアップ (キャッシュ利用)

Desktop上で依存関係をインストールする。SSD上で行うより圧倒的に速い。
**キャッシュがあれば数秒で完了**します。

```bash
cd "$TARGET_DIR"

# Node.js (キャッシュ利用)
if [ -f "package.json" ]; then
    echo "📦 Installing Node dependencies (Fast I/O)..."
    
    # キャッシュがあれば復元
    if [ -d "$CACHE_DIR/node_modules" ]; then
        echo "⚡️ Restoring from cache..."
        rsync -a "$CACHE_DIR/node_modules/" "$TARGET_DIR/node_modules/"
    fi
    
    # インストール（キャッシュがあれば差分のみ）
    if [ -f "pnpm-lock.yaml" ]; then pnpm install
    elif [ -f "yarn.lock" ]; then yarn install
    else npm install; fi
    
    # キャッシュ更新（次回用）
    mkdir -p "$CACHE_DIR"
    rsync -a "$TARGET_DIR/node_modules/" "$CACHE_DIR/node_modules/"
fi

# Python (キャッシュ利用)
if [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
    echo "🐍 Setting up Python venv (Fast I/O)..."
    
    # キャッシュがあれば復元
    if [ -d "$CACHE_DIR/.venv" ]; then
        echo "⚡️ Restoring from cache..."
        rsync -a "$CACHE_DIR/.venv/" "$TARGET_DIR/.venv/"
    else
        python3 -m venv .venv
    fi
    
    source .venv/bin/activate
    if [ -f "requirements.txt" ]; then pip install -r requirements.txt; fi
    if [ -f "pyproject.toml" ]; then pip install .; fi
    
    # キャッシュ更新（次回用）
    mkdir -p "$CACHE_DIR"
    rsync -a "$TARGET_DIR/.venv/" "$CACHE_DIR/.venv/"
fi
```

---

## Phase 4: 作業開始

1. VS Code で開く
```bash
code "$TARGET_DIR"
```

2. 完了メッセージ
```bash
echo "🎉 Project mounted successfully!"
echo "📍 Location: $TARGET_DIR"
echo "⚠️  IMPORTANT: Edit files in this Desktop folder."
echo "🔄 Run '/unmount' when finished to sync back to SSD."
```
