---
name: Homebrew Autonomous Ops
description: Autonomous system package management and maintenance using Homebrew's official MCP server (`brew mcp-server`).
---

# Homebrew Autonomous Ops

This skill enables the agent to autonomously manage system packages, dependencies, and environment tools on macOS using Homebrew. It leverages the built-in `brew mcp-server`.

## 1. MCP Server Configuration

Homebrew now includes a built-in MCP server.

**Prerequisites:**
- Homebrew installed on macOS.
- `brew` command must be in the system PATH. (Verify with `type brew`).

**MCP Configuration (`mcp.json`):**
```json
"homebrew": {
  "command": "brew",
  "args": [
    "mcp-server"
  ]
}
```

*Optionally enable specific tools:*
```json
"args": ["mcp-server", "--enabled-tools", "install,uninstall,update,info,search,cleanup"]
```

## 2. Maintenance Best Practices

To keep the development environment "Lightweight" and "Clean" (consistent with Global Rules):

### Cleanliness & Space Management
- **Regular Cleanup:** Run `brew cleanup` periodically to remove old versions of installed formulae and clear the cache.
- **Autoremove:** When uninstalling packages, check for unused dependencies (orphans) and remove them.

### Dependency Management
- **Audit:** Use `brew doctor` (via `run_command` if not exposed via MCP) to diagnose system issues.
- **Pinning:** If a specific version is required for a project (e.g., `node@18`), ensure it is linked correctly and not accidentally upgraded to `latest` if breaking changes are expected.

### Brewfile (Infrastructure as Code)
- Prefer using a `Brewfile` for project-specific dependencies.
- **Action:** If a `Brewfile` exists, the agent should prioritize `brew bundle` over manual `brew install` commands to ensure reproducibility.

## 3. Operational Capabilities (via MCP)

The agent uses the Homebrew MCP tools (exposed by `brew mcp-server`) to:

*   **Search:** `brew_search({ query: "..." })` - Find packages.
*   **Info:** `brew_info({ formula: "..." })` - Check installed version, dependencies, and caveats.
*   **Install:** `brew_install({ formula: "..." })` - Install new tools autonomously.
*   **Update:** `brew_update()` - Keep the package list current.
*   **Upgrade:** `brew_upgrade({ formula: "..." })` - Upgrade specific packages.

## 4. Safety Checks

- **Conflict Check:** Before installing, check if the package or a conflicting alternative is already installed.
- **Sudo Avoidance:** Homebrew is designed to run without `sudo`. Never attempt to force root privileges for standard brew operations.
