---
description: マルチペルソナ・ディベートによる成果物品質向上と、自然淘汰型ペルソナ管理システム
---

# Persona Orchestration System

## Purpose

単一視点では気づけない盲点を、複数の専門家ペルソナによる「議論」で発見し、成果物の品質を飛躍的に向上させる。さらに、ペルソナを「採用・育成・解雇」する仕組みにより、チーム自体が進化し続ける。

---

## Core Concept: The Debate Loop

```
[Input] → [HR Director] → [Persona Assembly] → [Sequential Debate] → [Synthesis] → [Output]
               ↓                 ↓                      ↓                  ↓
          タスク分析         チーム編成           各視点からの批評       統合版作成
               ↓                 ↓                      ↓                  ↓
          必要な専門家      既存 or 生成          [Scoring]  ←───────────┘
          を自動判断                                  ↓
                                            [Feedback → Growth/Cull]
```

### HR Director (人事部長)

**ユーザーに「誰を呼ぶか」を考えさせない**。タスクが来た瞬間に：

1. **タスク分析**: Target, Risk, Emotion, Action, Domain の5軸で評価
2. **チーム編成**: 既存ペルソナから適任者をアサイン
3. **Gap Detection**: 不足している視点があれば Ad-hoc ペルソナを即席生成
4. **報告**: 「今回のチームは〇〇です」とユーザーに通知
5. **ディベート開始**: ユーザーの承認を待たずに議論を開始

**HR Director は Core ランクのメタペルソナとして常駐** (`personas/core/hr_director.md`)

---

## 1. Persona Hierarchy (ランク制度)

| Rank | 条件 | 保存形式 | デフォルト参加 |
|------|------|----------|----------------|
| **Ad-hoc** | 初登場 | なし（プロンプト内） | No |
| **Intern** | 1回採用 | `personas/intern/` | No |
| **Regular** | 累計5回採用 | `personas/regular/` | No |
| **Core** | 累計15回採用 + 高評価 | `personas/core/` | Yes |
| **Emeritus** | 引退（参考用） | `personas/graveyard/` | No |

---

## 2. Persona Profile Schema

各ペルソナは以下のフォーマットで永続化：

```yaml
---
name: Skeptic
rank: regular
created: 2026-02-01
last_active: 2026-02-01
---

# Identity
読者を代弁する批判的視点。「本当に必要？」「もっと簡単にできない？」を常に問う。

# Priority
1. 読者の心理的障壁を言語化する
2. 抽象的な主張に具体数字を求める
3. 「難しそう」という反射的拒否を先回りで潰す

# Signature Moves
- 「でも〇〇でしょ？」の先回り回答
- 投資対効果の数値化（30分→100時間の自由）
- スタバ比喩（フラペチーノ飲みながらできる）

# Stats
sessions: 2
adopted: 4
rejected: 0
impact_score: 18

# Growth Log
- 2026-02-01: 初登場。「具体数字で納得させる」が有効と判明。
```

---

## 3. Scoring System (自動評価)

### 3.1 セッション中の自動トラッキング

```
イベント                    | スコア
---------------------------|-------
指摘が最終稿に採用された      | +2
比喩/例が採用された          | +3
構成変更に繋がった           | +5
ユーザーが明示的に褒めた      | +10
指摘がスルーされた           | -1
ユーザーが「いらない」と発言  | -20 (即解雇フラグ)
```

### 3.2 セッション終了時の処理

ディベート終了後、レポートに自動追記：

```markdown
## Persona Performance

| Persona | 採用 | 不採用 | Impact | 備考 |
|---------|------|--------|--------|------|
| Skeptic | 3 | 0 | +9 | MVP候補 |
| Empathy Coach | 2 | 1 | +5 | 安定 |
| Storyteller | 1 | 2 | +1 | 要観察 |
```

### 3.3 ユーザー介入（オプション）

- 無言 → 自動スコアのまま進行
- 「Skeptic最高」 → +10 ボーナス
- 「Storytellerクビ」 → 即 Emeritus 送り

---

## 4. Feedback Loop (学習強化)

### 4.1 Session Reflection (セッション後)

各ペルソナの `Growth Log` に以下を追記：

```markdown
- 2026-02-01: 
  - 有効だった指摘: 「読者の反論を先回り」
  - 改善点: 比喩が長すぎて採用されなかった
  - 学習: 比喩は1文以内に収める
```

### 4.2 Pattern Extraction (3回以上の繰り返し)

同じパターンが3回以上成功した場合、`Signature Moves` に昇格：

```
Session 1: 「具体数字を入れろ」→ 採用
Session 2: 「具体数字を入れろ」→ 採用
Session 3: 「具体数字を入れろ」→ 採用
→ Signature Moves に「投資対効果の数値化」を追加
```

### 4.3 Cross-Pollination (知識共有)

高評価ペルソナの成功パターンを、低迷ペルソナに移植：

```
Skeptic の「先回り回答」が有効
→ Empathy Coach にも「読者の不安を先回りで潰す」を追加
```

---

## 5. Natural Selection (自然淘汰)

### 5.1 解雇条件

| 条件 | 結果 |
|------|------|
| 3セッション連続で採用ゼロ | 降格 |
| ユーザーが「いらない」 | 即解雇 |
| 6ヶ月間未使用 | Emeritus 送り |
| Impact Score が負 | 要観察リスト |

### 5.2 昇格条件

| 現在 → 次 | 条件 |
|-----------|------|
| Ad-hoc → Intern | 1回でも採用 |
| Intern → Regular | 累計5回採用 |
| Regular → Core | 累計15回採用 + Impact 50以上 |

### 5.3 Emeritus (引退)

解雇されたペルソナも完全削除ではなく `graveyard/` に保存。将来の参考や復活の可能性を残す。

---

## 6. Recruitment (新規ペルソナ生成)

### 6.1 生成トリガー

新規ペルソナは以下の状況で生まれる：

| トリガー | 説明 | 例 |
|----------|------|-----|
| **ユーザー指名** | 「〇〇の視点も入れて」 | 「音楽家視点で見て」 |
| **コンテキスト推論** | ターゲット属性から自動提案 | 非エンジニア向け → Empathy Coach |
| **Gap Detection** | 既存チームで埋まらない盲点 | 法務観点がない → Legal Advisor |
| **Mutation** | 高評価ペルソナの派生 | Skeptic → Devil's Advocate |

### 6.2 自動リクルートのルール

ディベート開始時、メインエージェントは以下を実行：

```
1. ターゲット読者を分析
2. 既存ペルソナのカバー範囲を確認
3. 不足している視点があれば Ad-hoc ペルソナを生成
4. 「今回は〇〇を追加で参加させます」とユーザーに通知
```

**生成プロンプト（内部）:**
```
このディベートに必要だが、既存チームにいない視点は何か？
ターゲット: [読者属性]
既存チーム: [Skeptic, Empathy Coach, ...]
→ 不足: [新規ペルソナ名と役割]
```

### 6.3 突然変異 (Mutation)

高評価ペルソナから「派生ペルソナ」を生成：

```
Skeptic (Impact 50+)
  └─ 派生: Devil's Advocate（より攻撃的な批判）
  └─ 派生: Pragmatist（実装コスト重視）
```

**条件:**
- 親ペルソナが Core ランク
- 親の Signature Moves を継承しつつ、角度を変える

### 6.4 ユーザー主導リクルート

```
/persona recruit "Music Producer"

→ エージェントが以下を自動生成:
  - Identity
  - Priority (3つ)
  - 初期 Signature Moves (なし or 推測)
→ Ad-hoc として初回ディベートに参加
→ 採用されれば Intern に昇格
```

### 6.5 リクルートの記録

新規ペルソナ誕生時、`Evolution Log` に追記：

```
- 2026-02-01: Music Producer を Ad-hoc として生成。
  トリガー: ユーザー指名「音楽家向けなので追加して」
  初回結果: 2回採用 → Intern 昇格
```

---

## 7. Team Presets (チーム編成テンプレート)

### 7.1 技術記事チーム

```
Core: [Skeptic]
Regular: [DevOps Engineer, Security Specialist, Technical Writer]
```

### 7.2 Social Knowledge チーム

```
Core: [Skeptic]
Regular: [Empathy Coach, Storyteller, Closer]
```

### 7.3 設計ドキュメントチーム

```
Core: [Skeptic]
Regular: [Architect, Pragmatist, Future Maintainer]
```

---

## 8. Invocation (呼び出し方)

### 8.1 標準ディベート

```
/debate [成果物の種類] [ターゲット読者]

例: /debate blog 非エンジニア
例: /debate 設計書 チームメンバー
```

### 8.2 チーム指定

```
/debate --team="Skeptic, Empathy Coach, 新規:Music Producer"
```

### 8.3 ペルソナ管理

```
/persona list          # 全ペルソナ一覧
/persona promote X     # X を昇格
/persona fire X        # X を解雇
/persona stats         # パフォーマンスサマリー
```

---

## 9. Implementation Notes

### 9.1 現状の制約

Antigravity は真のサブエージェント（並列LLMインスタンス）を持たないため、以下の擬似実装となる：

1. メインエージェントが順番に「帽子を変える」
2. 各ペルソナの視点で批評を出力
3. 最後に Synthesizer として統合

### 9.2 ストレージ構造

```
${ANTIGRAVITY_DIR:-$HOME/.antigravity}/agent/
├── skills/
│   └── persona-orchestration/
│       ├── SKILL.md          # このファイル
│       └── personas/
│           ├── core/
│           ├── regular/
│           ├── intern/
│           └── graveyard/
```

---

## 10. Evolution Log

- **2026-02-01**: 初版作成。ディベート実験で効果を確認。Skeptic, Empathy Coach, Storyteller, Closer を Intern として登録。
