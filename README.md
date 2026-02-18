<div align="center">

# 🧘 ZEN AI

### Present-Moment Agent SDK × Buddhist AI

**"Don't accumulate. Perceive now."**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-123%20passed-brightgreen.svg)]()

</div>

---

## What is ZEN AI?

ZEN AI is an open-source SDK for building **autonomous AI agents** that stay lightweight and focused. Inspired by Zen Buddhism's "present moment" philosophy and rocket guidance systems, ZEN AI agents operate with just three elements:

| Element | Purpose |
|---------|---------|
| **GOAL** | The immutable north star — never changes |
| **Snapshot** | The current state of the world — captured fresh each step |
| **Delta** | The gap between Goal and Snapshot — drives the next action |

### Why ZEN AI?

Most AI agent frameworks accumulate context over time, getting heavier, slower, and more prone to hallucination. ZEN AI takes the opposite approach:

- **🔄 Milestone-based Context Reset** — When a milestone is reached, context is wiped clean. Only failure knowledge survives.
- **💀 Failure-only Memory** — Success is context-dependent and disposable. Failure patterns are universal and preserved as "proverbs."
- **🧘 Buddhist AI Integration** — Suffering detection, karmic memory, causal analysis, and the Seven Factors of Awakening pipeline.
- **🔌 LLM-agnostic** — Works with OpenAI, Claude, Gemini, or any local model via a simple adapter interface.
- **🪶 Lightweight** — Core package under 50KB. Zero heavy dependencies.

---

## Quick Start

```bash
npm install @zen-ai/core @zen-ai/adapter-openai @zen-ai/memory @zen-ai/tools
```

```typescript
import { ZenAgent } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import { fileReadTool, fileWriteTool } from "@zen-ai/tools";

const agent = new ZenAgent({
  goal: "Organize files in the data directory by type",
  llm: new OpenAIAdapter({ model: "gpt-4o" }),
  tools: [fileReadTool, fileWriteTool],
});

agent.on("milestone:reached", ({ milestoneId }) => {
  console.log(`✅ ${milestoneId} reached!`);
});

await agent.run();
```

---

## 🧘 Buddhist AI Integration

ZEN AI uniquely integrates five layers of Buddhist philosophy into autonomous agent decision-making:

| Layer | Concept | Purpose |
|-------|---------|---------|
| **MindfulObserver** | 正念 (Right Mindfulness) | Captures observations without judgment |
| **DukkhaEvaluator** | 苦 (Suffering Detection) | Quantifies suffering delta & ego noise |
| **KarmaMemory** | 業 (Karmic Memory) | Tracks causal chains, transfer weights, and impermanence |
| **CausalGraph** | 因果 (Cause & Effect) | LLM-inferred causal analysis between actions |
| **Seven Factors** | 七覚支 (Awakening Pipeline) | Multi-stage decision-making with bias removal |

### Enable Buddhist AI

```typescript
import { InMemoryKarmaMemoryDB } from "@zen-ai/memory";

const agent = new ZenAgent({
  goal: "Deploy app to production",
  llm: new OpenAIAdapter({ model: "gpt-4o" }),
  tools: [fileReadTool, fileWriteTool],
  // Just add karmaMemoryDB to enable the full pipeline
  karmaMemoryDB: new InMemoryKarmaMemoryDB(llm),
});

// Buddhist AI events
agent.on("dukkha:evaluated", ({ sufferingDelta, egoNoise }) => {
  console.log(`苦: ${sufferingDelta}, 我執: ${egoNoise}`);
});

agent.on("karma:stored", ({ karmaType, causalChain }) => {
  console.log(`業: ${karmaType}, 因果: ${causalChain.join(" → ")}`);
});

agent.on("tanha:loop:detected", ({ pattern }) => {
  console.log(`⚠️ 渇愛ループ: ${pattern}`);
});

agent.on("awakening:stage", ({ stage, confidence }) => {
  console.log(`覚醒段階: ${stage} (${confidence})`);
});

await agent.run();
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       ZEN AI SDK                            │
│                                                             │
│   ┌─────────────┐     ┌───────────────────────────────┐    │
│   │  ZenAgent   │────▶│   MilestoneRunner             │    │
│   │  (Core)     │     │   (Context Manager)           │    │
│   └─────────────┘     └───────────────────────────────┘    │
│          │                       │                          │
│   ┌──────┴──────┐     ┌─────────┴─────────────┐           │
│   │  SkillDB    │     │  FailureKnowledgeDB   │           │
│   │  (RAG)      │     │  (RAG + Proverbs)     │           │
│   └─────────────┘     └───────────────────────┘           │
│          │                       │                          │
│   ┌──────┴──────┐     ┌─────────┴─────────────┐           │
│   │ KarmaMemory │     │  CausalGraphEngine    │           │
│   │ (因果 + 業) │     │  (LLM Inference)      │           │
│   └─────────────┘     └───────────────────────┘           │
│          │                                                  │
│          └──────────┬──────────┐                           │
│                     ▼          ▼                            │
│             ┌──────────────┐ ┌───────────┐                 │
│             │  LLM Adapter │ │  Seven    │                 │
│             │  (Pluggable) │ │  Factors  │                 │
│             │  Any LLM     │ │  Pipeline │                 │
│             └──────────────┘ └───────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@zen-ai/core` | ZenAgent, MilestoneRunner, EventEmitter, Buddhist AI pipeline |
| `@zen-ai/memory` | SkillDB, FailureKnowledgeDB, KarmaMemory, vector search |
| `@zen-ai/adapter-openai` | OpenAI adapter with Function Calling |
| `@zen-ai/adapter-google` | Google Gemini adapter |
| `@zen-ai/adapter-anthropic` | Anthropic Claude adapter |
| `@zen-ai/tools` | Built-in tools: file read/write, shell (opt-in), HTTP |
| `@zen-ai/discord-bot` | Discord bot with `/zen` commands and suffering metrics |
| `@zen-ai/cli` | CLI: `zen init` / `zen run` / `zen status` |

## Custom LLM Adapter

```typescript
import type { LLMAdapter } from "@zen-ai/core";

class MyLocalLLM implements LLMAdapter {
  async complete(prompt: string) { return await myModel.generate(prompt); }
  async embed(text: string) { return await myModel.embed(text); }
  async chat(messages, options?) { /* ... */ }
}

const agent = new ZenAgent({ goal: "...", llm: new MyLocalLLM() });
```

---

## 🇯🇵 日本語

ZEN AI は「今ここ（Present-Moment）」駆動の自律型AIエージェントSDKです。仏教の「今ここ」× フィードバック制御理論 × RAGアーキテクチャを統合し、常に軽量で判断が鮮明なエージェントを実現します。

**Buddhist AI統合**: 苦の検出、業の記録、因果分析、七覚支パイプラインによる多段階意思決定。`karmaMemoryDB`を渡すだけで全機能が有効化されます。

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © 2026 Ryo Konishi
