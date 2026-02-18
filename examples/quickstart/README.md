# 🧘 Quickstart

The simplest ZEN AI agent — reads a file and writes a summary.

## Prerequisites

- Node.js >= 20
- OpenAI API key

## Run

```bash
export OPENAI_API_KEY=your-key-here
npx tsx main.ts
```

## What it does

1. Reads `sample.txt`
2. Uses GPT-4o to generate a summary
3. Writes the result to `summary.txt`

The agent uses two milestones to track progress:
- `read` — Ensures `sample.txt` is loaded
- `write` — Ensures `summary.txt` is created
