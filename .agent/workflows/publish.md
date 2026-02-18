---
description: 記事配信（学習・昇格・予約）の統合ワークフロー
---

# Publish & Distribute Workflow

概要: Notion上の記事配送状況を確認し、下書きの昇格、スケジューリング、および必要に応じた学習ループを一括管理する統合コマンド。

## Cross-Reference

```
/checkpoint_to_blog = コンテンツ生成（作業→記事変換）
/publish = 配信実行（昇格・予約・配信）
/learn_from_blog = フィードバック（正解データから学習）

典型フロー: /checkout → /checkpoint_to_blog → /publish → /learn_from_blog
```

## 手順

1.  **ドラフト記事の確認と昇格 (Promote Drafts)**
    -   Notion上で「Draft」状態の記事を検索し、配信待ち（Ready）へ昇格させる。
    -   ※ 実行前に確認が入るようにスクリプト側で制御（現在は一括処理だが、将来的には対話モードを検討）
    ```bash
    node $ANTIGRAVITY_DIR/agent/scripts/promote_drafts.js
    ```

2.  **予約スケジュールの最適化 (Smart Scheduling)**
    -   「Ready」状態の記事に対し、直近のゴールデンタイム（08, 12, 18, 22時）を割り当てる。
    -   **Zero Overlap**: 既に予約が入っている日時を認識し、重複を避けて末尾に追加する。
    ```bash
    node $ANTIGRAVITY_DIR/agent/scripts/schedule_posts.js
    ```

3.  **配信の自動化 (GAS Deployment)**
    -   配信処理はクラウド（Google Apps Script）が担当する。
    -   以下のコードをGASプロジェクトにコピペし、トリガー（1時間毎）を設定済みか確認する。
    -   Code: `$ANTIGRAVITY_DIR/agent/scripts/gas_publisher.js`
    ```bash
    cat $ANTIGRAVITY_DIR/agent/scripts/gas_publisher.js | pbcopy
    ```

5.  **社会知学習 (Optional Learning Loop)**
    -   もし手動で修正した「正解記事」がある場合、以下のコマンドで学習を行う。
    -   `node $ANTIGRAVITY_DIR/agent/scripts/fetch_notion_page.js <URL>`
    -   ※これは `/learn_from_blog` ワークフローとして独立しても良い。

---
*Note: このワークフローは「Article Distribution System」タスクで整備されたスクリプト群（SSD First / Zero-Config対応版）を使用します。*
