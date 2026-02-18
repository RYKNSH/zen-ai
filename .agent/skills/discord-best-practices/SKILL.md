---
name: discord-best-practices
description: Official best practices for developing Discord bots, covering Intents, Rate Limits, Interactions, and Sync logic.
---

# Discord Development Best Practices

This skill provides the official guidelines for building Discord bots, based on the [Discord Developer Documentation](https://discord.com/developers/docs/intro).

## 1. Gateway Intents & Reading Logic

Intents are bitwise values passed during the `Identify` phase to subscribe to specific events.

- **Standard Intents**: `GUILD_MESSAGES` (messages in servers), `DIRECT_MESSAGES` (DMs).
- **Privileged Intents**: Requires toggling in the Developer Portal.
    - **Message Content Intent (`MESSAGE_CONTENT`)**: **CRITICAL**. Without this, `content`, `embeds`, `attachments`, and `components` fields will be empty in Gateway events, *unless* the bot is mentioned or it's a DM.
    - **Server Members Intent**: Needed to list all members in a guild.
    - **Presence Intent**: Needed to see user status (online/offline).

**Best Practice**: Only enable the intents you strictly need to minimize bandwidth and processing power.

## 2. Rate Limits

Discord uses a bucket-based rate limiting system.

- **Global Rate Limit**: **50 requests per second** per bot token.
- **Gateway Rate Limit**: 120 events per 60 seconds.
- **Handling Strategy**:
    - **Dynamic Handling**: Do NOT hard-code wait times. Read `X-RateLimit-Remaining` and `X-RateLimit-Reset-After` headers.
    - **Respect 429s**: If you receive a 429, you **MUST** wait for the `Retry-After` duration. Failure to do so can lead to a temporary IP ban (Cloudflare) or account termination.
    - **Interaction Endpoints**: Slash command responses are NOT bound to the global HTTP limit.

## 3. Interactions vs. Text Commands

**Interactions** are the modern, preferred way to build bots.

| Feature | Interactions (Slash Commands) | Text Commands (`!ping`) |
| :--- | :--- | :--- |
| **Discovery** | Built-in UI (press `/`) | Hidden, requires manual help |
| **Parsing** | Structured Arguments | Manual String Parsing (Regex) |
| **Security** | No Message Content Intent needed | Requires Message Content Intent |
| **UX** | Clean, precise inputs | User prone to typos |

**Best Practice**: Use **Slash Commands (`/`)** for all primary functionality. Use **Message Context Menus** (Right-click message) for actions on existing messages (e.g., "Translate This").

## 4. Message Formatting

- **Text Limit**: 2,000 characters.
- **Embeds**:
    - Max **10 embeds** per message.
    - **Total Limit**: 6,000 characters (sum of all text fields).
    - **Field Limit**: 25 fields per embed.
    - **Field Values**: Max 1,024 characters.
- **Components**:
    - Use **Buttons** and **Select Menus** for choices instead of asking users to type numbers (e.g., "Type 1 for Yes").
    - Use **Modals** for multi-field text input.

## 5. Security & Hygiene

- **Token Safety**: NEVER commit your Token. Use `.env.local` locally and Secrets in production (Railway/Vercel).
- **Sanitization**: Creating messages with user input without sanitization can lead to @everyone pings or broken formatting. Always escape user input when echoing back.
- **State**: Cache static data like Roles or Channel IDs locally to avoid spamming `GET` requests.

## 6. Channel Synchronization Standard

When managing channels via a Schema-as-Code approach (e.g., `schema.json`), simple string matching is insufficient due to Discord's automatic name normalization (Slugification). This leads to "Zombie Channels" (duplicate channels that regenerate after deletion).

**MANDATORY: Robust Channel Sync Protocol**

Implement these three components in any `ChannelManager`:

**1. Semantic Normalization (`normalizeName`)**
- Discord forces text channels to be lowercase and dash-separated (snake-kebab-combo).
- Unicode characters are lowercased (but preserved).
- Spaces become dashes.
- *Best Practice*: Always normalize BOTH the schema name and the existing channel name before comparing.
```typescript
private normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
}
```

**2. Category & Child Cleanup (`cleanupCategories`)**
- Duplicate categories are common when renaming (e.g., "Events" -> "EVENTS").
- Standard logic typically syncs channels *inside* matched categories but ignores orphaned categories.
- *Requirement*: You MUST iterate through all guild categories and delete any that do not exist in the schema.
- **CRITICAL**: Delete children of the category *before* deleting the category itself to avoid orphaned channels floating in the root list.

**3. Claim-based Deduplication**
- Even with normalization, identical duplicates can exist (Discord allows multiple channels with same name).
- *Requirement*: Identify *all* channels that match a single schema definition.
- **Action**: "Claim" the oldest created instance (stable ID).
- **Cleanup**: Delete all *other* matching instances immediately.
- This ensures a strict 1-to-1 mapping between Schema and Server.
