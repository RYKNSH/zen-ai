---
description: 本番ビルドを作成する
---

# 本番ビルド

// turbo-all

1. TypeScriptの型チェック

```bash
pnpm typecheck
```

2. Lint検証

```bash
pnpm lint
```

3. 本番ビルドを作成

```bash
pnpm build
```

## ビルド出力

- `dist/` または `.next/` または `build/` フォルダにビルド成果物が生成
- 各プロジェクトの設定に依存

## 本番サーバー起動

```bash
pnpm start
```
