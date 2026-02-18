---
description: 48時間経過したキャッシュを自動削除するクリーンアップ
---
# Auto Cleanup (48h Cache Purge)

48時間以上経過したキャッシュとデータを削除するワークフロー。

## Cross-Reference

```
/checkin Phase 1 = 基本クリーンアップ（毎セッション）
/cleanup-48h = ディープクリーンアップ（定期実行）
/lightweight = メモリ軽量化（オンデマンド）
```

> [!NOTE]
> `/checkin` は毎セッションで軽いクリーンアップを行う。
> `/cleanup-48h` はそれより深いレベル（Adobe/Notion/Chrome）のキャッシュを対象とし、
> 空き容量が少ない時や、`/checkin` で空き容量警告が出た時に呼び出される。

## 対象

- Antigravity browser_recordings (48h+)
- Chrome Service Worker
- Adobe CoreSync
- Notion Partitions
- npm cache

## 手動実行

// turbo-all

1. Antigravity browser_recordings削除
```bash
find ~/.gemini/antigravity/browser_recordings -type f -mtime +2 -delete && find ~/.gemini/antigravity/browser_recordings -type d -empty -delete
```

2. Chrome Service Worker削除
```bash
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Service\ Worker
```

3. Adobe CoreSync削除
```bash
rm -rf ~/Library/Application\ Support/Adobe/CoreSync
```

4. Notion Partitions削除
```bash
rm -rf ~/Library/Application\ Support/Notion/Partitions
```

5. npm cache削除
```bash
rm -rf ~/.npm/_npx ~/.npm/_logs ~/.npm/_prebuilds ~/.npm/_cacache
```

6. 結果確認
```bash
df -h / | tail -1
```

## 自動実行 (launchd)

launchdで48時間ごとに自動実行するには:

```bash
launchctl load ~/Library/LaunchAgents/com.user.cleanup48h.plist
```

停止する場合:
```bash
launchctl unload ~/Library/LaunchAgents/com.user.cleanup48h.plist
```
