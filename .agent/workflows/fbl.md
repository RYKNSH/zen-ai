---
description: FBL (Feedback Loop) - ユーザー体験を極限まで高める自律検証ループ
---

# FBL (Feedback Loop)

> **哲学**: 機能実装の要望があった時に、フロント・バック・DB全てにおいて120点の完全体として機能実装されるまで、最高最強の天才チームが自律的にフィードバックループを繰り返して成果物を仕上げる

---

## 概要

FBLは実装後に自動で品質を検証し、問題があれば自己修正するフィードバックループ。
ユーザーに確認を求める前に、可能な限り高品質な状態に仕上げる。

## Cross-Reference

```
/verify Phase 2 → /fbl（Phase 0スキップ）→ Phase 1-7
/fbl 直接呼出し → Phase 0-7 全実行
/fbl deep → Phase 0-7 + Phase 5.5: /error-sweep + /debate quick
```

> [!IMPORTANT]
> `/verify` 経由で呼ばれた場合、Phase 0（lint/typecheck/test）は `/verify` Phase 1 で既に実行済みのためスキップする。
> 重複実行を防止し、検証速度を向上させる。

---

## バリエーション

| コマンド | 動作 | 用途 |
|---------|------|------|
| `/fbl` | 標準検証（全フェーズ） | 通常の機能実装後 |
| `/fbl quick` | 高速版（Phase 0 + 3 のみ） | 小さな修正、CSS調整 |
| `/fbl deep` | フルスタック検証 + ペルソナ批評 | 重要な機能、リリース前 |

---

## FBL チーム（Intern Personas）

| ペルソナ | 担当フェーズ | 専門 |
|---------|-------------|------|
| 🐛 **Bug Hunter** | Phase 0 | エラー検出・デバッグ |
| 🌐 **Browser Inspector** | Phase 3 | 視覚検証・レスポンシブ |
| 👤 **UX Advocate** | Phase 5 | ユーザー体験・120%品質 |
| ⚡ **Full-Stack Verifier** | Phase 1, 2, 4 | DB・API・E2E横断検証 |

---

## 検証フェーズ

### Phase 0: Pre-Flight Check 🐛
// turbo
**担当**: Bug Hunter
**目的**: 基本的なコード品質を確認

```bash
pnpm lint && pnpm typecheck && pnpm test
```

**発見した問題があれば即座に修正**

---

### Phase 1: DB Layer ⚡
**担当**: Full-Stack Verifier
**目的**: データベース層の整合性を確認

- マイグレーションが正常に適用されているか
- スキーマ変更がアプリケーションに反映されているか
- データ整合性（外部キー、ユニーク制約）

**注意**: マイグレーション実行は手動確認必須（自動実行禁止）

---

### Phase 2: API Layer ⚡
**担当**: Full-Stack Verifier
**目的**: APIエンドポイントの動作確認

- エンドポイントが正常にレスポンスを返すか
- リクエスト/レスポンスの型が契約と一致しているか
- エラーハンドリングが適切か

---

### Phase 3: Frontend Layer 🌐
**担当**: Browser Inspector
**目的**: 見た目と操作性を確認

- スクリーンショットを撮影して確認
- 期待される表示と比較
- レスポンシブデザインの確認（Mobile / Tablet / Desktop）

**発見した問題があれば即座に修正**

---

### Phase 4: E2E Data Flow ⚡
**担当**: Full-Stack Verifier
**目的**: 全層を通したデータフローの一貫性

- ユーザー入力 → API → DB → 表示 の一貫性
- 状態の同期（フロントの状態 = DBの状態）
- エラーバウンダリの連携確認

---

### Phase 5: 120% Quality Gate 👤
**担当**: UX Advocate
**目的**: 「期待以上」を実現しているか確認

```markdown
120%チェックリスト：
- [ ] ユーザーが「おっ」と思う演出があるか
- [ ] エラーメッセージは親切か
- [ ] ローディング状態は美しいか
- [ ] アニメーションは心地よいか
- [ ] アクセシビリティは考慮されているか
```

---

### Phase 5.5: Error Sweep 🔬
**担当**: Static Analyzer + Contract Verifier
**目的**: テストでは捕捉できないコードレベルの不整合を検出

> `/fbl deep` 実行時にのみ発動。`/fbl quick` では省略。

`/error-sweep` を自動実行。
critical 発見時は Phase 6 で Self-Repair 対象に含める。

---

### Phase 6: Self-Repair Loop 🔄
**目的**: 問題を発見したら即座に修正（Error Sweep の critical を含む）

```
発見 → 分析 → 修正 → 再検証
```

**セーフティ機構**:
- ループ上限: **3回まで**
- タイムアウト: **30分で強制停止**
- 破壊的操作（本番デプロイ、DBマイグレーション）は自動実行禁止

**監査ログ**: 修正履歴を記録
```bash
echo "[$(date)] Fixed: $ISSUE" >> fbl_audit.log
```

---

### Phase 7: Completion Report 📋
**目的**: ユーザーに完了を報告

- 実施した内容のサマリー
- 発見・修正した問題のリスト
- 残る改善余地があれば提案
- 監査ログのハイライト

---

## `/fbl quick` フロー

高速版。小さな修正やCSS調整に使用。

1. **Phase 0**: Pre-Flight Check（lint, typecheck, test）
2. **Phase 3**: Frontend Layer（視覚確認のみ）
3. **Phase 7**: Completion Report

---

## `/fbl deep` フロー

フルスタック検証 + ペルソナ批評。重要な機能やリリース前に使用。

> 🏥 **Health Check Protocol 適用** — `WORKFLOW_CONTRACTS.md` 参照。Pre-flight + メジャーPhase間でswapチェック。

1. **全Phase（0-7）を実行**
2. **Phase 7 の前に `/debate quick`** を実行
   - Bug Hunter, Browser Inspector, UX Advocate, Full-Stack Verifier が批評
   - 見落としがないか最終確認

---

## 適用場面

- 新機能の実装完了後
- UIコンポーネントの作成後
- バグ修正後の確認
- リファクタリング後

---

## 注意事項

> [!IMPORTANT]
> このワークフローは**自律的に**実行される。
> ユーザーへの確認は最終段階まで行わない。
> ただし、**破壊的操作が必要な場合は確認を求める**。

> [!CAUTION]
> **自動実行禁止の操作**:
> - データベースマイグレーション
> - 本番環境へのデプロイ
> - シークレット/環境変数の変更
> - ファイルの削除（テスト用一時ファイル除く）
