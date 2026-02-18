<div align="center">

# 🧘 ZEN AI

### Present-Moment Agent SDK

**"Don't accumulate. Perceive now."**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

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

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ZEN AI SDK                        │
│                                                     │
│   ┌─────────────┐     ┌───────────────────────┐    │
│   │  ZenAgent   │────▶│   MilestoneRunner     │    │
│   │  (Core)     │     │   (Context Manager)   │    │
│   └─────────────┘     └───────────────────────┘    │
│          │                       │                  │
│          ▼                       ▼                  │
│   ┌─────────────┐     ┌───────────────────────┐    │
│   │  SkillDB    │     │  FailureKnowledgeDB   │    │
│   │  (RAG)      │     │  (RAG + Proverbs)     │    │
│   └─────────────┘     └───────────────────────┘    │
│          │                       │                  │
│          └──────────┬────────────┘                  │
│                     ▼                               │
│             ┌──────────────┐                        │
│             │  LLM Adapter │  ← Any LLM            │
│             │  (Pluggable) │    OpenAI / Claude     │
│             └──────────────┘    Gemini / Local      │
└─────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@zen-ai/core` | ZenAgent, MilestoneRunner, EventEmitter, type definitions |
| `@zen-ai/memory` | SkillDB, FailureKnowledgeDB, in-memory vector search |
| `@zen-ai/adapter-openai` | OpenAI adapter with Function Calling support |
| `@zen-ai/tools` | Built-in tools: file read/write, shell (opt-in), HTTP |
| `@zen-ai/cli` | CLI: `zen init` / `zen run` / `zen status` |

## CLI

```bash
# Initialize a new project
zen init my-agent

# Run the agent
zen run

# Check status
zen status
```

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

---

## License

MIT © 2026 Ryo Konishi
