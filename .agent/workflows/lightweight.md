---
description: セッション開始前にメモリを軽量化し安定動作を確保
---
# Lightweight Operation (軽量動作モード)

Antigravityセッション開始前にシステムを軽量化。

## Cross-Reference

```
/checkin Phase 1 = 基本クリーンアップ（毎セッション）
/lightweight = メモリ軽量化（オンデマンド）
/cleanup-48h = ディープクリーンアップ（定期実行）
Memory Guardian = 5分間隔の自動メモリ監視デーモン（常時稼働）
```

> [!NOTE]
> **Memory Guardian** が launchd で5分間隔の自動監視を行っているため、通常は手動実行不要。
> `/lightweight` はGuardian が対応しきれない場合、または即座にメモリを解放したい場合に使う。
> 手動トリガー: `memory_guardian.sh --force`
> 状態確認: `memory_status.sh`

## 実行タイミング

- 複数セッション開始前
- 重いタスク（ブラウザ操作、長時間作業）開始前
- エラー頻発時

// turbo-all

## チェック & 軽量化

1. メモリ状態確認
```bash
echo "=== Memory ===" && vm_stat | head -5 && echo "---" && sysctl vm.swapusage
```

2. 48h+キャッシュ削除 (browser_recordings)
```bash
find ~/.gemini/antigravity/browser_recordings -type f -mtime +2 -delete && find ~/.gemini/antigravity/browser_recordings -type d -empty -delete
```

3. Chrome Service Worker削除
```bash
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Service\ Worker 2>/dev/null && echo "Chrome SW cleared"
```

4. npm cache削除
```bash
rm -rf ~/.npm/_npx ~/.npm/_logs ~/.npm/_prebuilds ~/.npm/_cacache 2>/dev/null && echo "npm cache cleared"
```

5. macOSメモリ圧縮 (sudo不要)
```bash
purge 2>/dev/null || echo "purge requires sudo, skipping"
```

6. 最終確認
```bash
df -h / | tail -1 && echo "---" && sysctl vm.swapusage
```

## Memory Guardian 自動対応

Memory Guardian デーモンが5分間隔で自動監視・回復を実行:

| フリー% | Level | アクション |
|---------|-------|-----------|
| < 30% | L1 | purge + browser_recordings + Chrome SW |
| < 20% | L2 | L1 + Adobe/Notion/npm + ビルドキャッシュ |
| < 10% | L3 | L2 + Spotlight一時停止 + metadata削除 |

```bash
# 手動トリガー
memory_guardian.sh --force

# 状態確認
memory_status.sh

# Dry-run（何が実行されるか確認）
memory_guardian.sh --dry-run
```

> [!TIP]
> Guardian が常時稼働しているため、再起動やアプリ終了は不要。
