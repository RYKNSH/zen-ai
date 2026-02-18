---
description: LP構成案からHTML/CSSの実装コードを自動生成する
---

# /generate-lp-structure — LP構造生成ワークフロー

> `/lp` で作成された構成案をもとに、実装可能なHTML/CSS構造を生成する。

## 前提条件

- `/lp` ワークフローで作成された `lp_plan_for_{product}.md` が存在すること
- もし存在しない場合、まず `/lp` を実行するよう案内する

## ワークフロー

### Step 1: 構成案の読み込み

```
最新の lp_plan_for_*.md を読み込む
```

### Step 2: セクション分割

構成案の各セクションを以下の構造に分割:

| セクション | HTML要素 | 目的 |
|-----------|---------|------|
| ファーストビュー | `<header>` / hero section | 直帰率を下げる |
| 問題提起 | `<section class="problem">` | 痛みの共感 |
| 解決策 | `<section class="solution">` | 商品紹介 |
| 証拠・実績 | `<section class="proof">` | 信頼構築 |
| FAQ | `<section class="faq">` | 不安解消 |
| CTA | `<section class="cta">` | 行動誘導 |

### Step 3: HTML/CSS生成

// turbo
各セクションのHTML/CSSを生成する。以下のルールに従う:

1. **レスポンシブ対応**（モバイルファースト）
2. **CTA ボタンは目立つ色**で視認性を確保
3. **セクション間に十分な余白**
4. **フォントはGoogle Fonts**を使用（Inter推奨）
5. **ダークモード対応**（prefers-color-scheme）
6. **スムーズスクロール**対応

### Step 4: ファイル出力

生成したファイルをプロジェクトディレクトリに配置:

```
{project}/
├── index.html
├── styles.css
└── assets/  (必要に応じて generate_image で生成)
```

### Step 5: プレビュー

// turbo
ローカルサーバーで確認:
```bash
cd {project} && python3 -m http.server 8080
```

ブラウザで確認し、FBLループで品質を高める。
