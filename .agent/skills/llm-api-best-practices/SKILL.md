---
name: LLM API Best Practices
description: LLM API統合のベストプラクティス（OpenAI, Anthropic, Gemini対応）
---

# LLM API Best Practices

## 概要

このスキルは、主要LLMプロバイダー（OpenAI, Anthropic, Gemini）のAPI利用における
ベストプラクティスを統合的に提供します。BYOK（Bring Your Own Key）環境での
安全で効率的なAPI利用をサポートします。

## 発動条件

- LLM APIを呼び出すコードを書く時
- プロンプトを設計する時
- API呼び出しのエラーを処理する時
- コスト最適化を検討する時

---

## 共通ベストプラクティス

### 1. APIキー管理

```typescript
// ✅ 環境変数から読み込む
const apiKey = process.env.OPENAI_API_KEY;

// ❌ ハードコーディング禁止
const apiKey = 'sk-XXX'; // 絶対にやらない

// ✅ キーのローテーション対応
function getApiKey(provider: string): string {
  const keys = process.env[`${provider.toUpperCase()}_API_KEYS`]?.split(',') || [];
  return keys[Math.floor(Math.random() * keys.length)];
}
```

### 2. リトライ戦略

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [429, 500, 502, 503, 504],
};

async function callWithRetry<T>(
  fn: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryable(error, config.retryableErrors)) {
        throw error;
      }
      
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
      );
      
      // Rate limit (429) の場合は Retry-After を尊重
      if (error.status === 429 && error.headers?.['retry-after']) {
        await sleep(parseInt(error.headers['retry-after']) * 1000);
      } else {
        await sleep(delay + Math.random() * 1000);
      }
    }
  }
  
  throw lastError!;
}
```

### 3. タイムアウト設定

```typescript
const TIMEOUT_CONFIG = {
  // モデルサイズに応じた設定
  'gpt-4': 60000,
  'gpt-3.5-turbo': 30000,
  'claude-3-opus': 120000,
  'claude-3-sonnet': 60000,
  'gemini-pro': 30000,
};

async function callWithTimeout<T>(
  fn: () => Promise<T>,
  model: string
): Promise<T> {
  const timeout = TIMEOUT_CONFIG[model] || 30000;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    return await fn();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 4. エラーハンドリング

```typescript
interface LLMError {
  provider: string;
  type: 'rate_limit' | 'auth' | 'model' | 'context' | 'network' | 'unknown';
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

function classifyError(provider: string, error: any): LLMError {
  // Rate Limit
  if (error.status === 429) {
    return {
      provider,
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      retryable: true,
      retryAfterMs: parseInt(error.headers?.['retry-after'] || '60') * 1000,
    };
  }
  
  // 認証エラー
  if (error.status === 401 || error.status === 403) {
    return {
      provider,
      type: 'auth',
      message: 'Authentication failed. Check your API key.',
      retryable: false,
    };
  }
  
  // コンテキスト長超過
  if (error.message?.includes('context_length') || 
      error.message?.includes('token limit')) {
    return {
      provider,
      type: 'context',
      message: 'Context length exceeded. Reduce input size.',
      retryable: false,
    };
  }
  
  // モデルエラー
  if (error.status === 400) {
    return {
      provider,
      type: 'model',
      message: error.message || 'Invalid request',
      retryable: false,
    };
  }
  
  // サーバーエラー
  if (error.status >= 500) {
    return {
      provider,
      type: 'network',
      message: 'Server error',
      retryable: true,
    };
  }
  
  return {
    provider,
    type: 'unknown',
    message: error.message || 'Unknown error',
    retryable: false,
  };
}
```

---

## プロンプトエンジニアリング

### システムプロンプト設計

```markdown
## 構造化テンプレート

### 1. ロール定義
あなたは[専門分野]のエキスパートです。

### 2. コンテキスト
[タスクの背景情報]

### 3. タスク指示
以下のタスクを実行してください：
1. [ステップ1]
2. [ステップ2]

### 4. 出力形式
結果は以下の形式で出力してください：
```json
{
  "result": "...",
  "confidence": 0.0-1.0
}
```

### 5. 制約条件
- [制約1]
- [制約2]
```

### Few-Shot Learning

```typescript
const messages: Message[] = [
  { role: 'system', content: 'あなたはコードレビューのエキスパートです。' },
  
  // Few-shot例1
  { role: 'user', content: 'レビューしてください:\n```js\nvar x = 1\n```' },
  { role: 'assistant', content: '改善点:\n1. `var`を`const`に変更\n2. セミコロンを追加' },
  
  // Few-shot例2
  { role: 'user', content: 'レビューしてください:\n```js\nfunction f(a,b){return a+b}\n```' },
  { role: 'assistant', content: '改善点:\n1. 関数名を意味のある名前に\n2. スペースを追加' },
  
  // 実際のリクエスト
  { role: 'user', content: 'レビューしてください:\n```js\n[ユーザーのコード]\n```' },
];
```

---

## コスト最適化

### トークン推定

```typescript
// 概算: 1トークン ≈ 4文字（英語）, 1-2文字（日本語）
function estimateTokens(text: string): number {
  const englishChars = text.replace(/[^\x00-\x7F]/g, '').length;
  const jaChars = text.length - englishChars;
  return Math.ceil(englishChars / 4 + jaChars / 1.5);
}

// モデル別コスト計算
const COSTS_PER_1K_TOKENS = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'gemini-pro': { input: 0.0005, output: 0.0015 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = COSTS_PER_1K_TOKENS[model];
  if (!costs) return 0;
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}
```

### キャッシング

```typescript
import { createHash } from 'crypto';

const responseCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_TTL_MS = 3600000; // 1時間

function getCacheKey(messages: Message[], config: any): string {
  return createHash('sha256')
    .update(JSON.stringify({ messages, config }))
    .digest('hex');
}

async function callWithCache(
  messages: Message[],
  config: any,
  callFn: () => Promise<string>
): Promise<string> {
  const key = getCacheKey(messages, config);
  const cached = responseCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.response;
  }
  
  const response = await callFn();
  responseCache.set(key, { response, timestamp: Date.now() });
  return response;
}
```

---

## プロバイダー別の注意点

### OpenAI

```typescript
// Function Calling の使用
const tools = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: '指定された場所の天気を取得',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '都市名' },
      },
      required: ['location'],
    },
  },
}];

// レスポンスフォーマット指定
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  response_format: { type: 'json_object' }, // JSON出力を強制
});
```

### Anthropic (Claude)

```typescript
// 長いコンテキストの活用
// Claude 3 は 200K トークン対応
const response = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 4096,
  system: 'システムプロンプト',  // 別パラメータ
  messages: [
    { role: 'user', content: '...' },
  ],
});

// Artifact形式の活用
// Claude は構造化出力が得意
```

### Gemini

```typescript
// マルチモーダル対応
const result = await model.generateContent([
  { text: '画像について説明してください' },
  {
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64ImageData,
    },
  },
]);

// Safety Settings
const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];
```

---

## チェックリスト

### API呼び出し前

- [ ] APIキーが環境変数から読み込まれている
- [ ] リトライ戦略が実装されている
- [ ] タイムアウトが設定されている
- [ ] エラーハンドリングが実装されている

### プロンプト設計

- [ ] ロール/コンテキスト/タスク/出力形式が明確
- [ ] Few-shot例が必要な場合は含まれている
- [ ] 制約条件が明示されている

### コスト管理

- [ ] トークン使用量を追跡している
- [ ] 適切なモデルを選択している
- [ ] キャッシングを検討している

### セキュリティ

- [ ] APIキーがコードにハードコードされていない
- [ ] 機密情報がプロンプトに含まれていない
- [ ] レスポンスのサニタイズが行われている
