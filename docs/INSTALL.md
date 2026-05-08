# How to Install TrustLists

Look up vendor trust centers, audit your dependencies for security posture, and check compliance — all from your AI assistant.

**Takes ~2 minutes. No coding required.**

---

## Cursor

### Step 1: Open MCP settings

1. Open **Cursor**
2. Press **Cmd+Shift+P** (Mac) or **Ctrl+Shift+P** (Windows/Linux)
3. Type **"MCP"** and select **"Cursor Settings: Open MCP Settings"**
4. This opens your `mcp.json` file

### Step 2: Add TrustLists

Paste this into your `mcp.json`:

```json
{
  "mcpServers": {
    "trustlists": {
      "command": "npx",
      "args": ["-y", "@trustlists/mcp"]
    }
  }
}
```

> **Already have other MCP servers?** Just add the `"trustlists": {...}` block inside your existing `"mcpServers"` object. Don't replace the whole file.

### Step 3: Restart Cursor

Fully quit Cursor (**Cmd+Q** on Mac) and reopen it.

### Step 4: Verify it works

1. Go to **Settings → MCP** (or search "MCP" in settings)
2. You should see **trustlists** with a green dot and **"3 tools enabled"**

### Step 5: Try it

In any chat, ask:

> "Look up Stripe's trust center"

or

> "Audit my project dependencies for vendor security"

---

## Claude Desktop

### Step 1: Find your Claude config

Open the Claude Desktop config file:

- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

If the file doesn't exist, create it.

### Step 2: Add TrustLists

```json
{
  "mcpServers": {
    "trustlists": {
      "command": "npx",
      "args": ["-y", "@trustlists/mcp"]
    }
  }
}
```

### Step 3: Restart Claude Desktop

Fully quit and reopen Claude Desktop.

### Step 4: Verify

Look for the hammer/tools icon in the chat input area. Click it — you should see `trustlists_search`, `trustlists_lookup`, and `trustlists_audit_dependencies`.

---

## Claude Code (CLI)

### Option A: Global config

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "trustlists": {
      "command": "npx",
      "args": ["-y", "@trustlists/mcp"]
    }
  }
}
```

### Option B: Project config

Add to your project's `.claude/settings.json` (same format as above).

Then restart Claude Code or start a new session.

---

## Other MCP-compatible clients

Any client that supports the [Model Context Protocol](https://modelcontextprotocol.io/) can use TrustLists. The server command is always:

```bash
npx -y @trustlists/mcp
```

Configure your client to spawn this command and connect via stdio.

---

## What you get

| Tool | What it does |
|------|--------------|
| `trustlists_search` | Search 2,000+ trust centers by company name |
| `trustlists_lookup` | Look up a vendor by exact domain |
| `trustlists_audit_dependencies` | Scan your project's package.json, requirements.txt, go.mod, etc. |

All tools are **free** with no authentication required.

---

## Troubleshooting

### "trustlists" doesn't appear after restart

1. Make sure your JSON is valid (no trailing commas, proper quotes)
2. Check that `npx` is available: run `which npx` in Terminal — it should return a path
3. Try running manually: `npx -y @trustlists/mcp` — you should see `[trustlists-mcp] v0.1.0 running on stdio`

### Tools show but don't respond

The server fetches data from `trustlists.org` — check your internet connection.

### "command not found" errors

Your PATH may not include npm/node in the app context. Try using the full path:

```json
{
  "mcpServers": {
    "trustlists": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "@trustlists/mcp"]
    }
  }
}
```

Find your path with `which npx` in Terminal.

---

## Links

- **npm:** https://www.npmjs.com/package/@trustlists/mcp
- **GitHub:** https://github.com/trustlists/trustlists-plugin
- **TrustLists Directory:** https://trustlists.org

---

## Questions?

Open an issue: https://github.com/trustlists/trustlists-plugin/issues
