---
description: 新しいSSDにポータブル開発環境を複製
---

// turbo-all

# /clone-environment - 環境構築クローン作成

新しいSSDに完全なポータブル開発環境を複製します。

## 前提条件
- 現在のSSD（CommonCore）が接続されていること
- 新しいSSDがマウントされていること

---

## 1. 新しいSSDの確認

```bash
ls /Volumes/ | grep -v "Macintosh HD"
```

新しいSSDのボリューム名を確認してください。

---

## 2. クローン先のボリューム名を入力

ユーザーに新しいSSDのボリューム名を確認：
- 例: `NewSSD`, `CommonCore2`, `Samsung_T7` など

---

## 3. 環境をクローン

```bash
# 変数設定（ユーザー入力に基づく）
NEW_SSD="/Volumes/[新しいSSD名]"

# .antigravityディレクトリをコピー
cp -R $ANTIGRAVITY_DIR "$NEW_SSD/.antigravity"

# リソースフォーク（._ファイル）を削除
find "$NEW_SSD/.antigravity" -name "._*" -delete
```

---

## 4. シンボリックリンクの更新

```bash
# 古いリンクを削除
rm ~/.agent 2>/dev/null
rm ~/.gemini/antigravity/knowledge 2>/dev/null

# 新しいリンクを作成
ln -s "$NEW_SSD/.antigravity/agent" ~/.agent
ln -s "$NEW_SSD/.antigravity/knowledge" ~/.gemini/antigravity/knowledge
```

---

## 5. 検証

```bash
ls -la ~/.agent
ls -la ~/.gemini/antigravity/knowledge
echo "---"
ls ~/.agent/workflows/
ls ~/.agent/skills/
```

---

## 6. 完了メッセージ

✅ 環境クローン完了

新しいSSD `$NEW_SSD` に以下がコピーされました：
- グローバルルール
- 5つのワークフロー（checkin, checkout, lightweight, cleanup-48h, project-init）
- 7つのスキル（first-principles, architecture等）
- プロジェクトテンプレート
- ナレッジベース

シンボリックリンクも新しいSSDを指すように更新されました。
