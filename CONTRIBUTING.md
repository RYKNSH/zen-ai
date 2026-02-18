# Contributing to ZEN AI

Thank you for your interest in contributing! 🧘

## Development Setup

```bash
git clone https://github.com/your-org/zen-ai.git
cd zen-ai
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
packages/
├── core/           # ZenAgent, MilestoneRunner, EventEmitter, types
├── memory/         # SkillDB, FailureKnowledgeDB, vector search
├── adapter-openai/ # OpenAI LLM adapter
├── cli/            # zen init / zen run / zen status
tools/              # Built-in tools (file, shell, http)
examples/           # Working examples
```

## Making Changes

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Write tests** for any new functionality
4. **Ensure** all tests pass: `pnpm test`
5. **Ensure** type checking passes: `pnpm build`
6. **Submit** a Pull Request

## Code Style

- TypeScript strict mode
- ESM (`.js` extensions in imports)
- JSDoc comments on all public APIs
- No default exports — only named exports

## Adding a New LLM Adapter

1. Create `packages/adapter-{name}/`
2. Implement the `LLMAdapter` interface from `@zen-ai/core`
3. Include `complete()`, `embed()`, and `chat()` methods
4. Add tests with mocked API calls

## Adding a New Tool

1. Create `tools/src/{name}-tool.ts`
2. Implement the `Tool` interface from `@zen-ai/core`
3. Export from `tools/src/index.ts`
4. Add tests

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test packages/core/__tests__/zen-agent.test.ts
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring

## License

MIT — contributions are made under the same license.
