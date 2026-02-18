---
description: テストを実行する
---

# テスト実行

// turbo-all

1. 全テストを実行

```bash
pnpm test
```

## テストの種類

- **ユニットテスト**: `*.test.ts`, `*.spec.ts`
- **統合テスト**: `*.integration.test.ts`
- **E2Eテスト**: `e2e/*.test.ts`

## 特定テストのみ実行

```bash
pnpm test -- <ファイル名またはパターン>
```

## カバレッジ付きで実行

```bash
pnpm test:coverage
```

## 監視モード（TDD向け）

```bash
pnpm test:watch
```
