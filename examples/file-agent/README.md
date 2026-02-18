# 🗂️ File Agent

An autonomous agent that organizes files by type using ZEN AI's full feature set.

## Features Demonstrated

- **Multi-milestone workflow** (scan → organize → manifest)
- **SkillDB** — Learns file organization patterns
- **FailureKnowledgeDB** — Remembers what went wrong
- **Context Reset** — Clean slate between milestones
- **Shell Tool** — `mv` commands for file organization (unsafe opt-in)

## Setup

```bash
# Create workspace with test files
mkdir -p workspace
echo "Hello" > workspace/readme.md
echo '{"key":"value"}' > workspace/data.json
echo "print('hello')" > workspace/script.py
cp /path/to/image.png workspace/photo.png

# Run
export OPENAI_API_KEY=your-key
npx tsx main.ts
```

## Expected Output

```
🧘 ZEN AI File Agent
   Goal: Organize all files in ./workspace into subdirectories by file type.

   Step 1: shell_exec(...) ✅
   Step 2: file_write(...) ✅

   ✅ Milestone "scan" reached!
   📦 Context Reset — fresh mind for next phase.

   Step 3: shell_exec(...) ✅
   ...

🧘 File Agent Complete.
```
