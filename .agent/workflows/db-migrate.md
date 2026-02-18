---
description: データベースマイグレーションを実行する
---

# DBマイグレーション

// turbo-all

## 一般的なマイグレーションコマンド

### Drizzle ORM
```bash
pnpm db:push
```

### Prisma
```bash
pnpm prisma migrate dev
pnpm prisma generate
```

### Supabase
```bash
supabase db push
```

## マイグレーションファイルの場所

- **Drizzle**: `drizzle/` フォルダにSQLファイル、スキーマは `drizzle/schema.ts`
- **Prisma**: `prisma/migrations/` フォルダ、スキーマは `prisma/schema.prisma`
- **Supabase**: `supabase/migrations/` フォルダ

## スキーマ変更時の手順

1. スキーマファイルを編集
2. マイグレーションコマンドを実行
3. マイグレーションが自動生成・適用される

## 本番環境へのマイグレーション

> ⚠️ **注意**: 本番環境へのマイグレーションは慎重に

1. ステージング環境でテスト
2. ロールバック手順を確認
3. 低トラフィック時に実行

```bash
# Drizzle
pnpm db:push --accept-data-loss

# Prisma
pnpm prisma migrate deploy

# Supabase
supabase db push --include-all
```
