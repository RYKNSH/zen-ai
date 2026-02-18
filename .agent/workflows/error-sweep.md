---
description: どんな小さなエラーも見逃さない徹底的なエラーチェック＆デバッグWF。テスト通過≠品質OKの前提で、コード自体を顕微鏡で調べる唯一のWF。
---

# /error-sweep - 徹底エラーチェック＆デバッグ

> [!IMPORTANT]
> **哲学**: 「テストが通る」「ビルドが通る」は品質の最低条件に過ぎない。
> このWFは、テストでは捕捉できない**実装の食い違い**を顕微鏡レベルで検出し、
> どんな小さなエラーも見逃さず、軽視せず、確実に潰す。

## Cross-Reference

```
/verify Phase 2.5 → /error-sweep quick（Phase 0 + 1 + 6 のみ）
/verify --deep Phase 2.5 → /error-sweep（全Phase実行）
/fbl deep Phase 5.5 → /error-sweep
/work "エラーチェック" → /error-sweep（直接呼出し）
/error-sweep Self-Repair 5回失敗 → /debug-deep（自動エスカレーション）
/error-sweep Phase 7 → .sweep_patterns.md に原則を蓄積（Self-Repair 2回以上時）
```

---

## バリエーション

| コマンド | 動作 | 用途 |
|---------|------|------|
| `/error-sweep` | フル実行（全Phase） | 実装完了後の徹底チェック |
| `/error-sweep quick` | Phase 0 + 1 + 6 のみ | `/verify` 通常時の組み込み |
| `/error-sweep --changed-only` | 変更ファイルのみ対象 | 個別修正後の差分チェック |

---

## Sweep チーム（Specialist Personas）

| ペルソナ | 担当Phase | 専門 |
|---------|-----------|------|
| 🔬 **Static Analyzer** | Phase 0 | 型安全性、未使用コード、strictモード |
| 🕸️ **Dependency Auditor** | Phase 1 | フロント-バック間契約、依存関係 |
| 🔥 **Runtime Sentinel** | Phase 2 | 実行時エラー、console出力、例外処理 |
| 🧩 **Logic Consistency** | Phase 3 | 分岐網羅、エッジケース、null安全性 |
| 📐 **Contract Verifier** | Phase 4 | API型契約、DB-ORM型一致 |
| 🔗 **Integration Prober** | Phase 5 | 実際のAPI呼び出し、レスポンス構造 |

---

## Severity 分類

全ての発見は以下の3段階で分類する:

| Severity | 定義 | 扱い |
|----------|------|------|
| 🔴 **critical** | 実行時エラー、データ破壊、セキュリティ脆弱性 | **必ず修正**。0件でなければ完了しない |
| 🟡 **warning** | 潜在バグ、型の曖昧さ、非最適なパターン | 修正推奨。3件以上は判断要求 |
| 🔵 **info** | コード品質改善提案、ベストプラクティス逸脱 | 記録のみ。余裕があれば対応 |

---

## 検証フェーズ

### Phase 0: Static Analysis 🔬
**担当**: Static Analyzer
**目的**: コンパイラ/リンターが見逃す型の穴と未使用コードを検出

#### Step 0-0: 過去パターン参照（学習ループの入口）

チェック開始前に、過去の学習データを読み込む:

1. **`.sweep_patterns.md`**（プロジェクト単位）が存在すれば読む
2. **`.debug_learnings.md`**（プロジェクト単位）が存在すれば読む — `/debug-deep` の学習も検出に活かす（**クロスポリネーション**）
3. **`SSD/.antigravity/knowledge/debug_patterns/`**（グローバル）を検索

**Priority Score による重点チェック**:
- `Priority = 発見頻度 × ヒット率`
- **上位10原則のみ重点チェック**。残りは辞書的に保持（検出時に参照）
- `deprecated` ステータスの原則はスキップ

> これが強化学習ループの「入口」。出口は Phase 7。

#### チェックリスト
```markdown
- [ ] tsconfig.json の `strict: true` が有効か
- [ ] `any` 型の使用箇所を全列挙（正当な理由がないものは排除）
- [ ] `as` 型アサーションの使用箇所を全列挙（不要なキャストを排除）
- [ ] `@ts-ignore` / `@ts-expect-error` の使用箇所を全列挙
- [ ] 未使用の import / 変数 / 関数 / export を検出
- [ ] デッドコード（到達不能コード）を検出
- [ ] `eslint-disable` コメントの使用と正当性を確認
```

#### 実行
```bash
# TypeScript strict チェック
npx tsc --noEmit --strict 2>&1 | head -100

# 未使用import/変数の検出
grep -rn "// @ts-ignore\|// @ts-expect-error\|eslint-disable" --include="*.ts" --include="*.tsx" src/
```

**コード内検索**:
```bash
# any型の使用箇所
grep -rn ": any\|as any\|<any>" --include="*.ts" --include="*.tsx" src/

# 型アサーションの使用箇所
grep -rn " as [A-Z]" --include="*.ts" --include="*.tsx" src/
```

---

### Phase 1: Dependency Audit 🕸️
**担当**: Dependency Auditor
**目的**: フロントエンド-バックエンド間の型/API契約の一致を検証

#### チェックリスト
```markdown
- [ ] APIエンドポイント定義（バック） vs API呼び出し（フロント）のパス一致
- [ ] リクエストbody型（バック期待） vs リクエストbody型（フロント送信）の一致
- [ ] レスポンス型（バック送信） vs レスポンス型（フロント期待）の一致
- [ ] 環境変数の参照（コード内） vs 定義（.env / .env.example）の一致
- [ ] package.json の dependencies vs 実際の import の一致
- [ ] import循環の検出
```

#### 実行
```bash
# 環境変数の参照 vs 定義
grep -rn "process.env\.\|import.meta.env\." --include="*.ts" --include="*.tsx" --include="*.js" src/ | \
  sed 's/.*\(process\.env\.[A-Z_]*\|import\.meta\.env\.[A-Z_]*\).*/\1/' | sort -u

# .env と .env.example の差分
diff <(grep -v '^#' .env | grep '=' | cut -d= -f1 | sort) \
     <(grep -v '^#' .env.example | grep '=' | cut -d= -f1 | sort) 2>/dev/null || echo "(.env or .env.example not found)"
```

**コード分析（手動）**:
- APIルート定義ファイルを読み、全エンドポイントのパスとリクエスト/レスポンス型を列挙
- フロントのAPI呼び出しコードと照合
- 不一致があれば `critical` として記録

---

### Phase 2: Runtime Sentinel 🔥
**担当**: Runtime Sentinel
**目的**: テストで捕捉されない実行時エラーを事前検出

#### チェックリスト
```markdown
- [ ] try/catch で握り潰されているエラー（空catch）を検出
- [ ] Promiseの `.catch()` 漏れ / unhandled rejection パターンを検出
- [ ] async関数で await 漏れ（fire-and-forget）を検出
- [ ] console.error / console.warn の意図的使用 vs 忘れ残しを判定
- [ ] throw されうるがcatchされない例外パスを特定
- [ ] setTimeout/setInterval のクリーンアップ漏れを検出
```

#### 実行
```bash
# 空catchの検出
grep -rn "catch.*{" --include="*.ts" --include="*.tsx" -A1 src/ | grep -B1 "^--$\|^\s*}$"

# console残留の検出
grep -rn "console\.\(log\|error\|warn\|debug\)" --include="*.ts" --include="*.tsx" src/

# fire-and-forget asyncの検出
grep -rn "^\s*[a-zA-Z]*(" --include="*.ts" --include="*.tsx" src/ | grep -v "await\|return\|const\|let\|var"
```

**ブラウザ検証**（フロントエンドプロジェクト時）:
- ブラウザでページを開き、DevToolsのConsoleタブを確認
- 赤/黄色のコンソール出力を全て記録
- Network タブで 4xx/5xx レスポンスを確認

---

### Phase 3: Logic Consistency 🧩
**担当**: Logic Consistency
**目的**: 分岐ロジックの網羅性とエッジケースのカバーを検証

#### チェックリスト
```markdown
- [ ] if/else if チェーンに else（デフォルトケース）があるか
- [ ] switch文に default ケースがあるか
- [ ] null/undefinedチェック: オプショナルチェーン(`?.`)の一貫性
- [ ] 配列アクセス: 空配列への `[0]` アクセスがないか
- [ ] オブジェクトアクセス: 存在しないプロパティへのアクセスがないか
- [ ] 数値演算: ゼロ除算、NaN 伝播のリスクがないか
- [ ] 文字列処理: 空文字列の扱いが正しいか
- [ ] Date処理: タイムゾーン考慮が必要な箇所で正しく処理しているか
- [ ] 非同期処理: レースコンディションのリスクがないか
```

**コード分析（手動）**:
- 変更されたファイルの全関数を読み、上記チェックリストに照らす
- **1関数ずつ丁寧に読む。スキップ禁止。**
- 発見した問題は severity を付けて記録

---

### Phase 4: Contract Verification 📐
**担当**: Contract Verifier
**目的**: データ層の型契約が全層で一貫していることを検証

#### チェックリスト
```markdown
- [ ] DB schema（マイグレーション/SQL）の各カラム型 vs ORM型定義の一致
- [ ] ORM型定義 vs APIレスポンス型の一致
- [ ] APIレスポンス型 vs フロントState型の一致
- [ ] フロントState型 vs UIコンポーネントProps型の一致
- [ ] enum/union型が全層で同じ値セットか
- [ ] 日付型の扱い: string vs Date vs timestamp が層間で統一されているか
- [ ] nullable/optional の扱い: 全層で一貫しているか
```

**実行手順**:
1. DB schema ファイルを読み、全テーブルのカラム名と型を列挙
2. ORM/モデル定義を読み、DB schemaとの一致を確認
3. API Handler を読み、レスポンス型を確認
4. フロントのfetch/API呼び出しを読み、期待型を確認
5. 不一致を `critical` として記録

---

### Phase 5: Integration Probing 🔗
**担当**: Integration Prober
**目的**: 実際のAPIエンドポイントを叩き、レスポンスの構造を検証

> [!NOTE]
> 開発サーバーが稼働中の場合のみ実行。稼働していない場合はスキップし、Phase 6 で「未検証」として記録。

#### 実行
```bash
# ヘルスチェック
curl -s http://localhost:3000/api/health 2>/dev/null | head -50

# 主要エンドポイントのレスポンス構造確認
# (プロジェクトに応じてエンドポイントを変更)
curl -s http://localhost:3000/api/[endpoint] | python3 -m json.tool 2>/dev/null | head -30
```

**ブラウザ検証**:
- ブラウザで主要画面を開き、Network タブで全リクエストを確認
- レスポンスJSON のキー名・型が期待と一致するか確認
- CORSエラー、Mixed Content警告がないか確認

---

### Phase 6: Sweep Report 📋
**担当**: Moderator（AI自身）
**目的**: 全発見事項を集約し、修正を実行

#### 出力フォーマット
```markdown
# 🔬 Error Sweep Report

## Summary
| Severity | Count | Auto-Fixed | Remaining |
|----------|-------|------------|-----------|
| 🔴 critical | X | Y | Z |
| 🟡 warning | X | Y | Z |
| 🔵 info | X | Y | Z |

## 🔴 Critical Issues
1. [ファイル:行] 問題の説明 → 修正内容
2. ...

## 🟡 Warnings
1. [ファイル:行] 問題の説明 → 修正内容 or 保留理由
2. ...

## 🔵 Info
1. [改善提案]
2. ...

## Auto-Fix Log
- [修正1]: ファイル → 変更内容
- [修正2]: ファイル → 変更内容

## Verdict
- [🟢 CLEAN / 🟡 CONDITIONAL PASS / 🔴 BLOCKED]
```

#### 判定基準

| Verdict | 条件 |
|---------|------|
| 🟢 **CLEAN** | critical = 0, warning ≤ 2 |
| 🟡 **CONDITIONAL PASS** | critical = 0, warning ≥ 3（手動判断要求） |
| 🔴 **BLOCKED** | critical ≥ 1（修正必須） |

---

## Self-Repair Loop

Phase 6 で `BLOCKED` 判定の場合、以下のループを実行:

```
発見 → 分析 → 修正 → Phase 0-5 再実行 → 再判定
```

**セーフティ機構**:
- ループ上限: **5回まで**（通常WFの3回より厳しく、粘り強く修正）
- タイムアウト: **45分で強制停止**
- **各修正前に git checkpoint を作成**:
  ```bash
  git add -A && git commit -m "error-sweep: checkpoint before fix N"
  ```
- 5回失敗 → **`/debug-deep` に自動エスカレーション**（checkpointからロールバック可能）

**監査ログ**:
```bash
echo "[$(date)] Sweep Fix: $ISSUE → $FIX" >> error_sweep_audit.log
```

---

## Phase 7: Reinforcement Learning 🧠

**発動条件**: Self-Repair が **2回以上**発動した場合のみ
**目的**: 具体的な失敗を**抽象的な原則**に昇華し、次回以降の検出精度を向上させる

> [!IMPORTANT]
> 失敗の具象記録は audit log に残す。ここでやるのは**抽象化**。
> 「何が起きたか」ではなく「**なぜそのカテゴリのミスが起きるのか**」を原則として蓄積する。

### 7-1. 具象→抽象の昇華プロセス

修正した全issueを振り返り、以下の3問で抽象化:

```markdown
1. **パターン化**: この失敗は他のどんな場面でも起き得るか？
   → Yes → 原則として記録
   → No → Evidence（事例）としてのみ記録

2. **根因分類**: なぜこのパターンが見逃されたか？
   - [ ] 型システムの限界（TSが検出できない）
   - [ ] 規約の不在（ルールがなかった）
   - [ ] 人的見落とし（知っていたが忘れた）
   - [ ] 設計の不整合（そもそも構造が矛盾）

3. **原則化**: 一文で防止ルールを書けるか？
   → 書けたら Principle として記録
```

### 7-2. プロジェクト単位: `.sweep_patterns.md`

プロジェクトルートに追記（2層構造）:

```markdown
## Principles（抽象化された原則）

### P-001: async データ操作は常に await を強制する
- **根因**: 型システムの限界（Promise<void> 返却関数の呼び捨て検出不可）
- **適用スコープ**: TypeScript, async/await
- **発見頻度**: 3回
- **ヒット率**: 2/3 (67%)
- **ステータス**: active
- **初出**: 2026-02-11 /error-sweep
- **Evidence**: jobs.py:42, api/users.ts:89, hooks/useData.ts:15
```

#### Principle フィールド定義

| フィールド | 必須 | 説明 |
|---------|------|------|
| **根因** | ○ | 型システムの限界 / 規約の不在 / 人的見落とし / 設計の不整合 |
| **適用スコープ** | ○ | どの言語/フレームワーク/技術に適用されるか |
| **発見頻度** | ○ | このPrincipleに該当するエラーが検出された総回数 |
| **ヒット率** | ○ | Phase 0でチェック対象にした回数中、実際に検出に貢献した回数 |
| **ステータス** | ○ | `active` / `deprecated` / `merged` |
| **初出** | ○ | 初めて発見された日付とWF |
| **Evidence** | ○ | 具体的なファイル:行 |

#### 淘汰メカニズム

原則は**無限に蓄積しない**。以下の条件で淘汰:

| 条件 | アクション |
|------|----------|
| `ヒット率 < 20%` かつ `参照回数 > 5` | → `deprecated` 候補としてマーク |
| `deprecated` かつ `発見頻度 = 0`（その後の発見なし） | → アーカイブセクションに移動 |
| 2つの Principle が実質同じ | → `merged`（統合） |

**ルール**:
- 同じパターンが既存 Principle に該当 → **Evidence 追記** + **発見頻度++**
- Phase 0 で参照したが検出 0 → **ヒット率の分母のみ++**
- Phase 0 で参照し検出あり → **ヒット率の分子も++**
- 新パターン → **新規 Principle 追加**（`P-XXX` 連番）

### 7-3. グローバル: `knowledge/debug_patterns/`

Principle が**プロジェクト固有でない場合**（言語/フレームワーク共通のパターン）、グローバルにも保存:

```
SSD/.antigravity/knowledge/debug_patterns/
├── typescript_async_await_enforcement.md
├── fullstack_date_type_unification.md
└── INDEX.md
```

> `/debug-deep` Step 6-2 と同じ保存先。`/error-sweep` と `/debug-deep` の学習が**同じナレッジプールに蓄積**される。

### 7-4. 即時反映

学習記録は保存と同時にエージェントの知識として即時反映される:
- **同一セッション内**: Phase 7 で記録した原則は即座にコンテキストに残る。`.session_state` にも反映
- **次回セッション**: `/checkin` で `.sweep_patterns.md` を自動読み込み
- **他プロジェクト**: グローバル `debug_patterns/` を Phase 0 で自動検索

### 7-5. 学習ループの完成

```
Phase 0 (入口): .sweep_patterns.md + .debug_learnings.md 読込
     │            Priority Score で上位10原則を重点チェック
     ↓
Phase 1-5: 検出（重点原則に従って精度向上）
     ↓
Phase 6: 修正 + Self-Repair
     ↓
Phase 7 (出口): 具象→抽象 → .sweep_patterns.md 追記
     │            ヒット率更新 + 淘汰判定
     ↓
次回 Phase 0 で自動参照 → 検出精度向上 + 不要原則の淘汰
```

**これにより「失敗が原則になり、原則が検出を強化し、不要な原則が自然淘汰される」進化的学習ループが成立する。**

---

## `/error-sweep quick` フロー

高速版。`/verify` 通常時に組み込む。

1. **Phase 0**: Static Analysis（**Step 0-0 過去パターン参照** + any/ts-ignore/eslint-disable検出。tsc再実行はスキップ）
2. **Phase 1**: Dependency Audit（API契約、環境変数）
3. **Phase 6**: Sweep Report（軽量版）

> Phase 7（学習）は quick では実行しない（Self-Repair 非発動のため）。

所要時間目安: 3-5分

---

## 発動条件まとめ

| トリガー | 発動元 | モード |
|---------|--------|--------|
| `/verify` Phase 2.5 | 自動（通常時） | `quick` |
| `/verify --deep` Phase 2.5 | 自動 | `full` |
| `/fbl deep` Phase 5.5 | 自動 | `full` |
| `/work "エラーチェック"` | 手動 | `full` |
| 直接呼出し `/error-sweep` | 手動 | `full` |

---

## 注意事項

> [!IMPORTANT]
> **Zero Tolerance**: このWFは「まあ大丈夫でしょう」を許さない。
> `warning` であっても記録し、3件以上蓄積したら対処を要求する。
> 小さなエラーの蓄積が致命的バグの温床であるという前提で動く。

> [!CAUTION]
> **自動実行禁止の操作**:
> - データベースマイグレーション
> - package.json の依存変更
> - tsconfig.json の設定変更（ユーザー確認必須）
> - .env ファイルの変更
