---
name: workspace-config-audit
description: Automatically audit workspace configuration files (tsconfig.json, package.json) for common errors like broken inheritance paths, invalid JSON, and incorrect dependency protocols.
---

# Workspace Config Audit

## Purpose
Monorepo環境（TurboRepo/PNPM）における設定ファイルの不整合を自動検出し、ビルドエラーを未然に防ぐ。
特に **内部パッケージへの依存関係における `workspace:*` プロトコルの使用を強制** し、`npm/pnpm` の解決エラーを防ぐ。

## Usage
Run the audit script from the workspace root:

```bash
node .agent/scripts/audit_workspace_config.js
```

## Checks Performed
1.  **JSON Syntax Validity**:
    -   All `tsconfig.json` and `package.json` files must be valid JSON.
2.  **TSConfig Inheritance**:
    -   Verify `extends` paths in `tsconfig.json` actually exist.
3.  **Strict Workspace Protocol**:
    -   **CRITICAL**: Dependencies pointing to other packages within the monorepo MUST use `"workspace:*"` versioning.
    -   Example: `"@discord-buddy/types": "workspace:*"` (✅) vs `"@discord-buddy/types": "*"` (❌).
    -   This prevents `pnpm` from attempting to fetch private packages from the public registry.

## Scripts

### `.agent/scripts/audit_workspace_config.js`

(Create this script if it doesn't exist)

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ... (Implementation details for auditing)
// Scan all package.json files
// Check 'dependencies' and 'devDependencies'
// If key starts with '@discord-buddy/' or '@attender/', value MUST be 'workspace:*'
```

## When to Use
-   After creating a new package.
-   **Before `pnpm install`** if you encounter 404 errors for private packages.
-   When `turbo run build` fails with obscure errors.
-   Before `/checkin` to ensure a clean state.
