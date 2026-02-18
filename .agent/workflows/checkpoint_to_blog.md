---
description: Generates a "Social Knowledge" blog post from recent work and uploads it to Notion. (Global SSD Version)
---

# /checkpoint_to_blog

> **ビジョン**: 「働いた証」を「価値ある資産」に変える

## Cross-Reference

```
/checkout Phase 0 → Social Knowledge Score ≥ 5 → /checkpoint_to_blog
/vision-os Phase 6 → 自動判定 → /checkpoint_to_blog
直接呼び出し → /checkpoint_to_blog
記事生成後 → /publish（配信実行）
          │
          └─ QA: /debate deep --preset=social-knowledge
```

---

## ⚠️ 必須：最初にやること

**記事を書く前に、以下を必ず参照する:**

1. **テンプレート**: `$ANTIGRAVITY_DIR/blogs/article_template.md`
2. **参考例（最新）**: `$ANTIGRAVITY_DIR/blogs/07_verification_team.md`

> [!IMPORTANT]
> 参考例の文体・構成・一人称を完全にコピーすること。
> テンプレートと参考例が矛盾する場合は、**参考例を優先**する。

---

## コンテンツタイプの選択

まず、どちらのコンテンツを作成するか確認：

| タイプ | 目的 | 配信先 | 形式 |
|--------|------|--------|------|
| **Daily Log** | 活動の可視化 | Discord | 3-5行 |
| **Evergreen Article** | 教育・権威構築 | Notion | 1500-2500字 |

---

## A. Daily Log（活動記録）

短い活動報告。毎日配信用。

```
今日やったこと:
- [具体的な作業内容]
- [発見・学び]
- [次にやること]
```

→ Discordに投稿して完了

---

## B. Evergreen Article（永続記事）

### 1. Authentication & Setup
```bash
node $ANTIGRAVITY_DIR/agent/scripts/auth_notion.js
```

### 2. Input Collection
以下の情報を収集：
- **Core Insight**: 今回の作業で得た「普遍的な学び」は何か？
- **Before/After**: 何が変わったか？（数字があれば最高）
- **Framework Name**: この手法に名前をつけるなら？

### 2.5 Quality Assurance (Deep Debate)
記事執筆前、またはドラフト作成後に必ず `/debate deep --preset=social-knowledge` を実行。

プリセットにより以下のチームが自動編成される:
- **Skeptic**: 批判的視点（「本当に価値があるのか？」）
- **Empathy Coach**: 読者目線（「非エンジニアにも伝わるか？」）
- **Storyteller**: 物語力（「感情を動かす構成か？」）

検証3軸:
- [ ] **Universal Value**: 個人的な体験が普遍的な知恵に昇華されているか？
- [ ] **Physical Metaphor**: 物理的・数学的なメタファーで本質を突いているか？
- [ ] **Narrative Arc**: 読者の感情を動かす構成になっているか？

### 3. Content Generation
テンプレートに従って記事を生成:
```
$ANTIGRAVITY_DIR/blogs/article_template.md
```

**5ブロック構成チェック:**
- [ ] 第一ブロック「問いかけ」（普遍的な真理や気づきを短く提示）
- [ ] 第二ブロック「体験」（具体的なエピソード、数字があるとなお良い）
- [ ] 第三ブロック「洞察」（視点の転換、できれば名前をつける）
- [ ] 第四ブロック「解決」（どうやって乗り越えたか、文章として流す）
- [ ] 第五ブロック「普遍化と余韻」（One-Man Orchestraへの接続）

### 3.5 NGワード自動チェック (Mandatory)
記事ファイルに対して以下を実行し、該当があれば修正してから次へ進む:
```bash
grep -n "でもね、\|でもね　\|でもね " [記事ファイル] && echo "⚠️ NGワード検出: 「でもね、」→「ただ、」「ところが、」「けれど、」に置換せよ" || echo "✅ NGワードなし"
```

### 4. Brand Check
ブランドコンセプトに沿っているか確認:
```
$ANTIGRAVITY_DIR/brand_concept.md
```

### 5. Review & Upload
ユーザーに確認後、Notionにアップロード:
```bash
node $ANTIGRAVITY_DIR/agent/scripts/notion_poster.js [file]
```

### 6. Git Save
```bash
git add .
git commit -m "blog: [タイトル]"
git push
```

---

## 文体ガイドライン（article_template.md準拠）

- **一人称**: 「ぼく」
- **語尾**: 「ね」「んです」「ますよ」など、語りかけるトーン
- **文の長さ**: 短い一文で改行。長くなりそうなら、切る
- **段落**: 段落の間には必ず2行以上の空白
- **禁忌**: 記号、テーブル、コマンド、リスト（純粋な散文で構成）
- **クロージング**: 「One-Man Orchestra」への接続、余韻を残すフレーズ

---

## Daily Log 自動提案

`/checkout` Phase 0 で Social Knowledge Score が 1-4 の場合、Evergreen Article ではなく Daily Log を提案。

簡潔な活動報告を作成し、Discord に投稿して完了。
Evergreen Article への昇格は次回以降で判断。

