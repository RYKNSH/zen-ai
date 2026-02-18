---
description: 未知のスキルを自律的に・リサーチ・獲得し、実装・検証を行う進化型ウィザード（Chaos-First Edition）
---

# /evolve-wiz - Evolution Wizard Workflow (Chaos-First Edition)

**Concept**: 未知の技術領域に対し、「学習 -> 破壊的検証 -> 実装 -> 監査」のプロセスを回す。
**Philosophy**: "Failure-Driven Evolution" - 実際にエラーを起こさせ、その対策を実装することで堅牢性を担保する。

## Cross-Reference

```
/vision-os Phase 4 → /evolve-wiz → /debate team (監査)
/go --vision → /vision-os → /evolve-wiz
直接呼出し → /evolve-wiz → /debate team
```

---

## 1. Trigger

ユーザーが以下のコマンドを入力した場合に発動：

```bash
/evolve-wiz "<Topic or Goal>"
```

---

## 2. The Wizard Process

### Phase 1: Skill Hunting (Research & Acquire)
1.  **Execute**: `node agent/scripts/skill_hunter.js "<Topic>"`
2.  **Action**: スクリプトの出力に従い、`search_web` を実行して情報を収集。
3.  **Compile**: `temp_skills/<topic>.md` を作成。

### Phase 2: Validation Shot (Try & Break)
**Objective**: 「動くこと」を確認した後、「どこで壊れるか」を確認する。

#### Sub-phase A: Sunny Day (正常系)
1.  **Create**: 最小限のサンプルコード (`validation_shot.ts`) を作成。
2.  **Run**: コードを実行し、正常動作を確認。

#### Sub-phase B: Rainy Day (Chaos / 破壊的検証) ★NEW
1.  **Execute**: `node agent/scripts/chaos_monkey.js <target> fuzz`
2.  **Attack**: スクリプトが提示する攻撃パターン（SQLi, Max Int, Null等）を実際に試す。
3.  **Learn**: クラッシュや予期せぬ挙動が発生したら、それを `temp_skills/<topic>.md` の `Observed Anti-Patterns` セクションに記録する。
4.  **Fix**: 発見された脆弱性を修正するコードを追加する。

**Retry Limit**: 検証・修正ループは最大3回まで。

### Phase 3: Implementation (Apply)
1.  **Plan**: 検証済みスキル（および対策済みのアンチパターン）を使って本番コードを実装。

### Phase 4: Review Board (Audit)
1.  **Execute**: `/debate team` を実行（独自実装ではなく、統合ディベートシステムを使用）。
2.  **Team**: タスクに応じたペルソナが自動編成される。
    -   Vision OS 経由の場合: `--preset=titan` が適用される。
3.  **Fix**: 指摘事項を修正。

---

## 3. Completion

```markdown
# 🧙‍♂️ Evolution Complete
## Status: [Success / Aborted]
## Acquired: [Link to temp_skill]
## Chaos Test: [Passed / Fixed N issues]
## Implemented: [Link to file]
```

## 4. Safety Rules
1.  **Chaos Environment**: 破壊的検証は必ずローカルの非本番環境で行うこと。
2.  **Learn from Failures**: エラーは「失敗」ではなく「学習データ」である。必ず記録せよ。
