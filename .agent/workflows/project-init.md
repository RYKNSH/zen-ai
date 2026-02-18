---
description: プロジェクト初期化 - First Principles開発環境を構築
---

// turbo-all

# /project-init - プロジェクト環境構築

既存または新規のプロジェクトに「First Principles」開発環境をセットアップ。

## 前提条件
- Antigravity (`~/.antigravity`) がセットアップ済みであること（GitHub clone or SSD）
- ワークスペースがAntigravityで開かれていること

---

## 0. 依存関係チェック (First Principles Init)

「環境がないなら作る」の精神で、必須ツールをチェック・自動修復。

### Docker Check
Dockerがない場合、自動インストールを促すか、DMGダウンロードフローへ誘導。

```bash
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker not found. Starting autonomous installation flow..."
    # Check architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        echo "Detected Apple Silicon (arm64). Downloading Docker.dmg..."
        curl -L -o Docker.dmg "https://desktop.docker.com/mac/main/arm64/Docker.dmg"
        echo "Installing..."
        hdiutil attach Docker.dmg
        cp -R /Volumes/Docker/Docker.app /Applications/
        hdiutil detach /Volumes/Docker -force
        rm Docker.dmg
        open -a Docker
        echo "✅ Docker installed & launched. Please wait for the whale."
    else
        echo "❌ Intel Mac detected. Manual installation required: https://www.docker.com/"
    fi
else
    echo "✅ Docker is installed."
    # Ensure it's running
    if ! docker info > /dev/null 2>&1; then
        echo "Docker is not running. Launching..."
        open -a Docker
    fi
fi
```

## 1. グローバルルール（GEMINI.md）の同期

SSD上のマスターをホームディレクトリにコピー（初回または更新時）:

```bash
mkdir -p ~/.gemini
if [ -f "$ANTIGRAVITY_DIR/agent/rules/GEMINI.md.master" ]; then
    cp $ANTIGRAVITY_DIR/agent/rules/GEMINI.md.master ~/.gemini/GEMINI.md
    echo "✅ GEMINI.md synced from SSD"
else
    echo "⚠️ GEMINI.md.master not found on SSD"
fi
```

---

## 2. .agentディレクトリの確認・作成

```bash
mkdir -p .agent/{skills,workflows,mcp,plugins}
```

---

## 3. グローバルスキルの同期

SSD上のスキルをワークスペースにコピー:

```bash
cp -R $ANTIGRAVITY_DIR/agent/skills/* .agent/skills/ 2>/dev/null || echo "No skills to copy"
```

---

## 4. グローバルワークフローの同期

```bash
cp $ANTIGRAVITY_DIR/agent/workflows/*.md .agent/workflows/ 2>/dev/null || echo "No workflows to copy"
```

---

## 5. docs/ディレクトリの初期化（未存在時のみ）

```bash
if [ ! -d "docs" ]; then
  mkdir -p docs
  cp $ANTIGRAVITY_DIR/project-templates/docs/*.md docs/
  echo "docs/ initialized from templates"
else
  echo "docs/ already exists, skipping"
fi
```

---

## 6. 設定ファイルの確認

以下のファイルが存在しない場合、テンプレートからコピー:
- `.env.example` → `.env.local`
- `tsconfig.json`
- `turbo.json`（Turborepoプロジェクトの場合）

```bash
[ ! -f ".env.local" ] && [ -f "$ANTIGRAVITY_DIR/project-templates/configs/.env.example" ] && cp $ANTIGRAVITY_DIR/project-templates/configs/.env.example .env.local
```

---

## 7. 完了メッセージ

✅ Project environment initialized - First Principles開発環境がセットアップされました。

**次のステップ:**
- `docs/PRINCIPLES.md` を読んで開発原則を確認
- `/new-feature` で新機能開発を開始
