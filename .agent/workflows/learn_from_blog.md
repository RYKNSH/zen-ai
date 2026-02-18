---
description: Notionで手動修正された記事から「正解データ」を学習し、スキルを自動アップデートする
---

# Learn from Blog Workflow

ユーザーがNotion上で手直しした「完成形の記事」を取り込み、AIの執筆スキル（人格・トーン・構成）をその正解データに合わせてチューニングする。

## Cross-Reference

```
/checkpoint_to_blog = コンテンツ生成（作業→記事）
/publish = 配信実行（昇格・予約）
/learn_from_blog = フィードバック（人間の修正から学習）

典型フロー: /checkpoint_to_blog → /publish → ユーザーが手直し → /learn_from_blog
```

## 手順

1. **対象の特定**
   - ユーザーから NotionのURL または Page ID を受け取る。
   - **条件**: ステータスが「未設定 (Empty)」の記事を対象とする（手直し中でまだ配信ラインに乗っていないもの）。
   - 引数がない場合は、ステータスが空の記事を自動検索するか、ユーザーにURLを尋ねる。

2. **正解データの取得**
   - 以下のスクリプトを実行して、記事の全文（タイトル＋本文）を取得する。
   ```bash
   node $ANTIGRAVITY_DIR/agent/scripts/fetch_notion_page.js <PAGE_ID>
   ```

3. **現状スキルの確認**
   - 以下のファイルを読む。
   - `$ANTIGRAVITY_DIR/agent/skills/checkpoint_social_blog.md`

4. **差分分析と学習 (Active Learning)**
   - **取得したテキスト（正解）** と **現在のスキル定義** を比較し、以下の観点で分析する：
     - **トーンの乖離**: 語尾、リズム、言い回しはどう変わったか？
     - **比喩の傾向**: どんな新しい比喩が使われたか？
     - **構成の変化**: 導入や結びのパターンが変わったか？
     - **NGワード**: AIが使ってしまい、ユーザーが消した言葉は何か？

5. **スキルの更新**
   - 分析結果に基づき、`checkpoint_social_blog.md` を書き換える。
   - **注意**: 既存のルールを全て上書きするのではなく、「よりユーザーの好みに近づける」微修正を行うこと。
   - 特に `Core Persona` や `Absolute Constraints` に具体的な事例（Good/Bad）を追加すると効果的。

6.  **予約配信 (Smart Scheduling)**
    -   以下のスクリプトを実行し、記事をNotion上で「予約状態 (Ready)」にする。
    -   (実際の配信はクラウド上のGASが担当する)
    ```bash
    node $ANTIGRAVITY_DIR/agent/scripts/schedule_posts.js
    ```
    -   ※実行後、「〇〇日〇〇時に予約されました」とユーザーに伝える。

7.  **Social Commentary Generation (価値ある誘導)**
    -   投稿した記事の内容に基づき、他SNS（X, Threads, note）でシェアするための「価値あるコメント」を3パターン生成する。
    -   単なる「更新しました」ではなく、記事の核心を突く「問い」や「気づき」を短く抜き出すこと。
    -   生成したコメントをユーザーに提示する。

8.  **完了報告**
    -   「〇〇というクセを学習しました。また、Discordへの投稿とSNS用コメントの生成を行いました」と報告する。
