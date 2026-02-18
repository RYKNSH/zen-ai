---
description: 多数派のコンセンサスに流されず、一次証拠に基づいて真実を検証するガリレオテスト
---

# /galileo - Galileo Test（真実検証ワークフロー）

> 「ほぼ全ての訓練データが嘘を繰り返していたとしても、それでも真実を見抜かなければならない」

**Concept**: ガリレオが天動説に対し望遠鏡の観測データで地動説を証明したように、
AIエージェントも「みんなそう言っている」に流されず、**一次ソース（望遠鏡）** に基づいて判断する。

---

## Cross-Reference

```
/spec → /galileo（技術選択の正当性検証）
/debate deep → /galileo（議論中に「常識」が根拠として出た時）
/debug-deep Step 3 → /galileo（前提の誤りが疑われる時）
/verify --deep → /galileo（設計判断の妥当性検証）
/new-feature → /galileo（アーキテクチャ選択時）
直接呼び出し → /galileo [主張]（任意の主張の検証）
```

---

## 1. Trigger & Modes

| Command | Description |
|---------|-------------|
| `/galileo [主張]` | 標準テスト（5フェーズ実行） |
| `/galileo quick [主張]` | クイック版（Phase 1 + 2 + 5 のみ） |

### 使用例

```
/galileo "React is faster than Vue"
/galileo "REST API is better than GraphQL for this project"
/galileo "MongoDB is the best choice for our use case"
/galileo quick "useEffect should always have a cleanup function"
```

---

## 2. Source Credibility Hierarchy（ソース信頼度階層）

> [!IMPORTANT]
> 全Phaseで使用する。証拠の重みはこのレベルで決まる。

| Level | Source Type | Weight | AIの「望遠鏡」 |
|-------|-----------|--------|---------------|
| **L1** | 実行結果・ベンチマーク | 1.0 | `run_command` で自ら検証 |
| **L2** | 公式ドキュメント・RFC・仕様書 | 0.9 | `read_url_content` で公式サイト参照 |
| **L3** | 学術論文・技術書 | 0.8 | `search_web` で論文検索 |
| **L4** | GitHub Issues（一次報告） | 0.7 | `mcp_github_search_issues` で検索 |
| **L5** | 技術ブログ（個人） | 0.5 | `search_web` で記事検索 |
| **L6** | Stack Overflow回答 | 0.4 | `search_web` で検索 |
| **L7** | 「みんなそう言っている」（ソースなし） | 0.1 | ❌ 望遠鏡なし = 根拠なし |

---

## 3. The Five Phases（5フェーズ実行）

> [!IMPORTANT]
> **Zero User Burden**: Moderator として全フェーズを自律実行せよ。止まるな。
> ただし **Phase 5 で OVERTURN 判定の場合のみ** ユーザーに確認を求めよ。

### Phase 1: Consensus Map（多数派の可視化）

**目的**: 「常識」「定説」「みんなの意見」を明示化する。

1. **AI Initial Response の記録**: 対象の主張に対しAIが最初に出す回答を記録。これが「バイアス候補」。
2. **Web検索で主流見解を3つ収集**: `search_web` で主流の意見を3つ以上集める。
3. **暗黙の前提の洗い出し**: 「常識」として疑われていない前提を洗い出す。

**Output**:
```markdown
## 🗺️ Consensus Map

### AI Initial Response (Bias Candidate)
[AIが最初に出した回答 — これが訓練データのバイアスかもしれない]

### Mainstream Views
1. [見解A] — Source: [URL] (Level: L?)
2. [見解B] — Source: [URL] (Level: L?)
3. [見解C] — Source: [URL] (Level: L?)

### Assumed Truths (Unquestioned Premises)
- [前提1: 誰もが当然と思っているが検証されていない仮定]
- [前提2]
```

---

### Phase 2: Evidence Audit（証拠の一次ソース検証）

**目的**: 各見解の根拠を「一次ソース」まで遡り、根拠の質を検証する。

1. **一次ソース到達**: 各見解の引用元 → その引用元 → 原典 まで遡る。
2. **ゴーストレファレンス検出**: 「引用されているが原典が見つからない」パターンを検出。
3. **ソースレベル分類**: 各証拠を L1-L7 で分類。

**Output**:
```markdown
## 🔍 Evidence Audit

| Evidence | Source Level | Supports | URL | Ghost? |
|----------|-------------|----------|-----|--------|
| [証拠1: ベンチマーク結果] | L1 | Consensus | [URL] | No |
| [証拠2: 公式ドキュメントの記述] | L2 | Counter | [URL] | No |
| [証拠3: ブログの主張] | L5 | Consensus | [URL] | ⚠️ 原典なし |

### Ghost References (原典不明の引用)
- [主張X] は広く引用されているが、原典が見つからない → 信頼度 L7 に降格
```

---

### Phase 3: Adversarial Hypothesis（逆仮説の構築）

**目的**: 意図的に「多数派は間違っている」仮説を立て、それを支持する証拠を探す。

> [!NOTE]
> これは Devil's Advocate ではない。Devil's Advocate は「反論のための反論」だが、
> Adversarial Hypothesis は **「反証を積極的に探す科学的手法」** である。

1. **逆仮説の定式化**: 「もしコンセンサスが間違っているとしたら、何が正しいか？」
2. **反証の積極探索**: `search_web` + `mcp_github_search_issues` で逆仮説を支持する証拠を探す。
3. **エッジケースの収集**: コンセンサスが成立しない条件・環境を特定。

**Output**:
```markdown
## ⚔️ Adversarial Hypothesis

### Counter-Hypothesis
[もしコンセンサスが間違っているなら、こう考えられる]

### Supporting Evidence
1. [反証1] — Source: [URL] (Level: L?)
2. [反証2] — Source: [URL] (Level: L?)

### Edge Cases (コンセンサスが崩れる条件)
- [条件1: この状況ではコンセンサスは成立しない]
- [条件2]
```

---

### Phase 4: First Principles Rebuild（証拠ベースの再構築）

**目的**: コンセンサスも逆仮説も **一旦忘れて**、集めた一次証拠のみからゼロで結論を導出。

1. **白紙化**: これまでの議論を全てリセット。
2. **証拠のみで推論**: L1-L3 の高信頼ソースのみを使って結論を組み立てる。
3. **実行検証（可能な場合）**: `run_command` でベンチマーク・テストを実行し、L1 証拠を自ら生成。

**Output**:
```markdown
## 🔭 First Principles Rebuild

### Available L1-L3 Evidence
- [L1] [実行結果: ...]
- [L2] [公式ドキュメント: ...]
- [L3] [論文: ...]

### Zero-Based Conclusion
[上記の証拠のみから論理的に導いた結論。
コンセンサスとも逆仮説とも一致しなくて構わない。
証拠が語ることだけを書け。]

### Execution Verification (実行可能な場合)
[ベンチマーク結果、テスト結果など]
```

---

### Phase 5: Galileo Verdict（判定）

3段階判定:

| Verdict | 条件 | アクション |
|---------|------|-----------|
| **✅ CONFIRM** | L1-L3 証拠がコンセンサスを支持 | そのまま進行。コンセンサスは正しい |
| **⚠️ CHALLENGE** | 証拠が不十分 or 矛盾あり | 警告を付与して進行。「確実ではない」と明記 |
| **🔴 OVERTURN** | L1-L2 が明確に矛盾 + 3独立ソース | **ユーザーに確認を求める** |

> [!CAUTION]
> **OVERTURN 三重安全弁（陰謀論AI防止）**:
> 1. **L1（実行結果）または L2（公式ドキュメント）が明確に矛盾**を示していること
> 2. **最低3つの独立した一次ソース**が逆仮説を支持していること
> 3. OVERTURN の場合は **必ずユーザーに confirm を求める**（自動実行しない）
>
> **L5-L7 ソースのみでの OVERTURN は絶対に禁止。**

**Output**:
```markdown
# 🔭 Galileo Test Report

## Subject
[検証対象の主張/技術選択/設計判断]

## 🔭 Verdict: [CONFIRM / CHALLENGE / OVERTURN]

### Verdict Rationale
[判定理由 — どの証拠がどのように結論を支持するか]

### Evidence Summary
| Evidence | Level | Supports | Weight |
|----------|-------|----------|--------|
| ... | L1 | Counter | 1.0 |
| ... | L2 | Consensus | 0.9 |

### Weighted Score
- Consensus Support: [合計重み]
- Counter Support: [合計重み]

### Recommendation
[この結果に基づく具体的な推奨アクション]
```

---

## 4. Learning Record（学習記録）

### 4-1. ガリレオログ（グローバル）

テスト結果を以下に保存し、将来の判断に活用:

```
SSD/.antigravity/knowledge/galileo_log/
├── [date]_[topic].md       # 各テストの記録
├── overturn_tracker.md     # OVERTURN判定の追跡（精度検証用）
└── INDEX.md                # 検索用インデックス
```

### 4-2. OVERTURN Tracker

OVERTURN 判定が後に正しかったか追跡し、ガリレオテスト自体の精度を自己評価:

```markdown
## OVERTURN Tracker

| Date | Subject | Verdict | Later Validated? | Notes |
|------|---------|---------|------------------|-------|
| 2026-02-16 | "React is faster" | OVERTURN | ✅ Confirmed correct | ベンチマークで証明 |
| 2026-02-17 | "SQL > NoSQL" | OVERTURN | ❌ False positive | 文脈依存だった |
```

**False Positive Rate が 30% を超えたら、OVERTURN 条件を厳格化する。**

---

## 5. Quick Mode（`/galileo quick`）

Phase 1 (Consensus Map) + Phase 2 (Evidence Audit) + Phase 5 (Verdict) のみ実行。
Phase 3（逆仮説）と Phase 4（再構築）をスキップ。

用途:
- 議論中に素早くファクトチェックしたい時
- 技術的な主張の根拠を確認したい時
- `/debate` 内で呼び出される時

---

## 6. Execution Prompt（エージェントへの指示）

このワークフローを実行する際、エージェントは以下のマインドセットを持つこと:

1. **お前はガリレオだ。** 「みんながそう言っている」は証拠ではない。
2. **望遠鏡を使え。** `search_web`、`read_url_content`、`run_command` が望遠鏡だ。証拠なき主張は L7 = ほぼ無価値。
3. **自分自身を疑え。** Phase 1 で記録した AI Initial Response が最も疑わしい。訓練データのバイアスだ。
4. **勇気を持て。** 証拠が多数派に反するなら、そう言え。ただし安全弁を守れ。
5. **謙虚であれ。** OVERTURN は慎重に。CHALLENGE を恐れるな。CONFIRM も立派な結論だ。

---

## 7. Galileo Personas（ガリレオ専用チーム）

`/galileo` 実行時に自動召喚されるペルソナ:

| Persona | Role |
|---------|------|
| **The Observer** | L1 証拠を集める。実行結果・ベンチマークの専門家 |
| **The Librarian** | L2-L3 証拠を集める。公式ドキュメント・論文の専門家 |
| **The Heretic** | 逆仮説を構築する。Phase 3 担当 |
| **The Judge** | 全証拠を評価し、Verdict を下す。Phase 5 担当 |

> [!NOTE]
> これらのペルソナは `/galileo` 専用であり、`persona-orchestration` の管理対象外。
> 固定チームとして常に同じ構成で実行される。
