---
name: Docker Autonomous Ops
description: Autonomous management of Docker containers with a focus on Database operations, using the `@modelcontextprotocol/server-docker` MCP server.
---

# Docker Autonomous Ops

This skill enables the agent to autonomously manage Docker containers, specifically designed for handling Database services (PostgreSQL, MySQL, Redis, etc.) and other containerized infrastructure.

## 1. MCP Server Configuration

To enable this skill, the `@modelcontextprotocol/server-docker` must be configured in the MCP settings.

**Prerequisites:**
- Docker Desktop (or Engine) running.
- `node` and `npm` installed.

**MCP Configuration (`mcp.json`):**
```json
"docker": {
  "command": "npx",
  "args": [
    "-y",
    "@0xshariq/docker-mcp-server"
  ]
}

> [!NOTE]
> This uses a community-maintained wrapper (`@0xshariq/docker-mcp-server`) as the official server is primarily distributed as source.
```

## 2. Best Practices for Autonomous Database Management

When managing databases via Docker, adhere to the following strict guidelines to ensure data safety and reliability.

### Persistence (CRITICAL)
- **Always** use named volumes or bind mounts for database data. **NEVER** store data inside the container layer strings.
- **Pattern:** ` -v <volume_name>:/var/lib/postgresql/data` (for Postgres) or `-v <volume_name>:/var/lib/mysql` (for MySQL).
- **Verification:** Before destroying a container, verify where its data is persisted.

### Networking
- Use a dedicated user-defined bridge network for application stacks (e.g., `app-network`).
- Avoid `host` networking unless strictly necessary for specific discovery protocols.
- Use Docker's internal DNS (container name) for service-to-service communication.

### Health Checks
- Always define a `HEALTHCHECK` in the `docker run` command or `Dockerfile`.
- Example (Postgres): `--health-cmd pg_isready -U postgres`

### Security
- **No Root:** Where possible, run containers as non-root users.
- **Secrets:** Pass sensitive data (passwords) via environment variables (`-e`) only during development/testing. For production-like local setups, prefer Docker Secrets or protected files if supported by the MCP tool.
- **Image Pinning:** Use specific tags (e.g., `postgres:16.1-alpine`) instead of `latest` to avoid unexpected upgrades.

## 3. Operational Capabilities (via MCP)

The agent uses the installed Docker MCP tools to perform these actions:

*   **List Containers:** `docker_list_containers({ all: true })` - Check status of services.
*   **Manage State:**
    *   `docker_start_container({ id: "..." })`
    *   `docker_stop_container({ id: "..." })`
*   **Inspect:** `docker_inspect_container({ id: "..." })` - Vital for debugging config/network issues.
*   **Logs:** `docker_logs({ id: "..." })` - Retrieve internal error logs from DBs.
*   **Create/Run:** `docker_create_container(...)` - Deploy new services dynamically.

## 4. Troubleshooting Strategy

1.  **Container Exits Immediately:** Check logs (`docker_logs`). Usually missing env var or volume permission issue.
2.  **Connection Refused:** Check `docker_inspect` for port mappings and network assignment. Ensure host port is not colliding.
3.  **Data Missing:** specific volume mount points. Verify host path exists.
