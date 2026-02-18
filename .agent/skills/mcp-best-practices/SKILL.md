---
name: MCP Development Best Practices
description: MCP公式ドキュメントに基づくMCPサーバー開発のベストプラクティス
---

# MCP Development Best Practices

## 概要

このスキルは、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 公式ドキュメントから抽出したベストプラクティスを提供します。MCPサーバーの設計・実装・セキュリティに関する公式ガイドラインを統合しています。

## 発動条件

- MCPサーバーを新規実装する時
- MCPツールを追加・修正する時
- MCPリソースを設計する時
- MCPに関するセキュリティレビュー時

---

## MCP アーキテクチャ基礎

### 参加者（Participants）

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  MCP Host   │────▶│  MCP Client │────▶│  MCP Server │
│ (AI App)    │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

| 役割 | 説明 | 例 |
|------|------|-----|
| **MCP Host** | AIアプリケーション。複数のMCP Clientを調整・管理 | Claude Desktop, Claude Code |
| **MCP Client** | MCP Serverと接続を維持し、コンテキストを取得 | Host内のコンポーネント |
| **MCP Server** | コンテキスト（Tools/Resources/Prompts）を提供 | filesystem, github等 |

### レイヤー構造

1. **Data Layer**: JSON-RPC 2.0ベースのプロトコル
   - ライフサイクル管理
   - コアプリミティブ（Tools, Resources, Prompts）
   - 通知

2. **Transport Layer**: 通信メカニズム
   - **Stdio**: ローカルプロセス間通信（推奨）
   - **Streamable HTTP**: リモート通信（OAuth認証対応）

---

## Tool 設計ベストプラクティス

### 公式セキュリティ要件

#### サーバー側（MUST）

```typescript
// ✅ 必須: 全ツール入力のバリデーション
function validateInput(args: unknown): void {
  const schema = z.object({
    path: z.string().min(1).max(1000),
    content: z.string().max(100000),
  });
  schema.parse(args);
}

// ✅ 必須: アクセス制御の実装
function checkAccess(path: string): boolean {
  const allowedPaths = ['/workspace/', '/tmp/'];
  return allowedPaths.some(p => path.startsWith(p));
}

// ✅ 必須: レート制限
const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});

// ✅ 必須: 出力のサニタイズ
function sanitizeOutput(content: string): string {
  // 機密情報を除去
  return content.replace(/API_KEY=\S+/g, 'API_KEY=***');
}
```

#### クライアント側（SHOULD）

```typescript
// ⚠️ 推奨: センシティブ操作の確認
async function callToolWithConfirmation(
  tool: string,
  args: any
): Promise<Result> {
  if (isSensitiveOperation(tool)) {
    const confirmed = await promptUserConfirmation(tool, args);
    if (!confirmed) throw new Error('User cancelled');
  }
  return callTool(tool, args);
}

// ⚠️ 推奨: 入力の事前表示（データ流出防止）
function showInputsToUser(tool: string, args: any): void {
  console.log(`Calling ${tool} with:`, JSON.stringify(args, null, 2));
}

// ⚠️ 推奨: タイムアウト設定
const TOOL_TIMEOUT_MS = 30000;

// ⚠️ 推奨: 監査ログ
function logToolUsage(tool: string, args: any, result: any): void {
  logger.info('Tool invocation', { tool, args, result, timestamp: Date.now() });
}
```

### エラーハンドリング

```typescript
// Protocol Errors (JSON-RPC標準)
const ERROR_CODES = {
  UNKNOWN_TOOL: -32602,
  INVALID_ARGUMENTS: -32602,
  SERVER_ERROR: -32603,
  RESOURCE_NOT_FOUND: -32002,
};

// Tool Execution Errors (isError: true)
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;  // trueの場合、エラーを示す
}

// 例: APIエラーの返し方
function handleApiError(error: Error): ToolResult {
  return {
    content: [{ type: 'text', text: `Failed: ${error.message}` }],
    isError: true,
  };
}
```

---

## Resource 設計ベストプラクティス

### URI スキーム設計

```typescript
// 公式で推奨されるURIスキーム
const URI_SCHEMES = {
  // HTTPS: Web リソース
  HTTPS: 'https://example.com/resource',
  
  // File: ローカルファイル
  FILE: 'file:///path/to/file.txt',
  
  // Git: リポジトリリソース
  GIT: 'git://repo/path/to/file',
  
  // カスタム: プロジェクト固有
  CUSTOM: 'myprotocol://resource/id',
};
```

### セキュリティ要件

```typescript
// ✅ MUST: URIのバリデーション
function validateResourceUri(uri: string): boolean {
  const allowed = ['file://', 'https://', 'git://'];
  return allowed.some(scheme => uri.startsWith(scheme));
}

// ✅ SHOULD: アクセス制御
function checkResourceAccess(uri: string, user: User): boolean {
  const permissions = getPermissions(uri);
  return permissions.includes(user.role);
}

// ✅ MUST: バイナリデータのエンコーディング
function encodeResource(content: Buffer): ResourceContents {
  return {
    uri: 'file:///path/to/binary',
    mimeType: 'application/octet-stream',
    blob: content.toString('base64'),
  };
}
```

---

## ライフサイクル管理

### 接続初期化

```typescript
// Capability Negotiation
const serverCapabilities = {
  tools: { listChanged: true },
  resources: { subscribe: true, listChanged: true },
  prompts: { listChanged: true },
};

// 初期化ハンドシェイク
async function initialize(clientCapabilities: Capabilities): Promise<ServerInfo> {
  return {
    protocolVersion: '2025-06-18',
    capabilities: serverCapabilities,
    serverInfo: {
      name: 'my-server',
      version: '1.0.0',
    },
  };
}
```

### 変更通知

```typescript
// リソースリストが変更された場合
server.notification({
  method: 'notifications/resources/list_changed',
});

// ツールリストが変更された場合
server.notification({
  method: 'notifications/tools/list_changed',
});
```

---

## Tool 定義テンプレート

```typescript
{
  name: 'tool_name',
  description: '日本語で具体的な説明。何ができるか、いつ使うか、制限は何か。',
  inputSchema: {
    type: 'object',
    properties: {
      required_param: {
        type: 'string',
        description: '必須パラメータの説明',
      },
      optional_param: {
        type: 'number',
        description: 'オプションパラメータの説明（デフォルト: 10）',
      },
    },
    required: ['required_param'],
  },
}
```

---

## チェックリスト

### MCP Server 実装前

- [ ] Data Layer: JSON-RPC 2.0準拠か
- [ ] Transport: Stdio or HTTP を選択
- [ ] Capabilities: 提供機能を定義

### Tool 実装時

- [ ] 入力バリデーション（MUST）
- [ ] アクセス制御（MUST）
- [ ] レート制限（MUST）
- [ ] 出力サニタイズ（MUST）
- [ ] タイムアウト設定（SHOULD）
- [ ] エラーハンドリング（isError: true）

### Resource 実装時

- [ ] URI バリデーション（MUST）
- [ ] アクセス制御（SHOULD）
- [ ] バイナリエンコーディング（MUST）
- [ ] MIME Type 設定

### セキュリティレビュー

- [ ] 機密情報の漏洩リスク
- [ ] 不正アクセスの防止
- [ ] DoS攻撃への耐性
- [ ] 監査ログの有効化

---

## 参考リンク

- [MCP Specification](https://modelcontextprotocol.io/specification/latest)
- [MCP SDKs](https://modelcontextprotocol.io/docs/sdk)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
- [Reference Server Implementations](https://github.com/modelcontextprotocol/servers)
