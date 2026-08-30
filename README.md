<p align="center">
  <img src="assets/logo.svg" alt="trustlists_" width="96" height="96" />
</p>

<h1 align="center">trustlists_ Plugin</h1>

<p align="center">
  Public vendor trust center tools for Cursor and Claude Code.<br/>
  Find trust centers, browse listed frameworks, and map project dependencies without leaving your editor.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@trustlists/mcp"><img src="https://img.shields.io/npm/v/@trustlists/mcp.svg" alt="npm" /></a>
</p>

## What it does

The trustlists_ plugin gives your AI assistant access to thousands of public company
trust center records and tools for mapping project dependencies to vendor
security-documentation pages.

### Tools

| Tool | What it does | Cost |
|------|--------------|------|
| `trustlists_search` | Search thousands of trust centers by name or domain | Free |
| `trustlists_lookup` | Look up a single vendor by exact domain | Free |
| `trustlists_browse` | Filter by platform, listed framework, or CSA STAR level | Free |
| `trustlists_audit_dependencies` | Audit `package.json`, `requirements.txt`, `go.mod`, etc. | Free |

### Skills

The plugin ships with skills your AI assistant uses automatically:

- **lookup-vendor** - Find a vendor's trust center and listed frameworks
- **audit-dependencies** - Map project dependencies to public trust center records
- **compliance-quick-check** - Check whether a directory record lists a requested framework

## Example usage

In Cursor or Claude Code, just ask:

> "Look up Stripe's trust center"

> "Audit my package.json for vendor security"

> "Does Datadog's trust center list HIPAA information?"

The AI uses the plugin's tools to answer with current public trustlists data.
A directory record is a discovery aid, not an audit, certification, endorsement,
or security rating.

## Quick Install (Cursor, Claude Desktop, Claude Code)

Add this to your MCP config and restart:

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

| App | Config location |
|-----|-----------------|
| **Cursor** | Settings → MCP → Edit config (or `~/.cursor/mcp.json`) |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Code** | `~/.claude/settings.json` or `.claude/settings.json` in your project |

**[Full installation guide →](docs/INSTALL.md)** (includes troubleshooting)

## Pricing

The four directory tools are free and require no trustlists account. SOC 2
analysis and other account-based workflows live in trustlists Companion.

- **Free MCP tools** - Search, lookup, browse, and dependency mapping
- **Companion** - Account-based SOC 2 analysis, favorites, sharing, and vendor follow-up

Visit the [MCP overview](https://trustlists.org/mcp/) for setup and tool details,
or [trustlists.org](https://trustlists.org) for the full directory and Companion subscriptions.

## Development

```bash
# Install dependencies
npm install

# Build the MCP server
npm run build

# Test locally
npm run test:local
```

See [docs/development.md](docs/development.md) for the full development guide.

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Links

- [trustlists directory](https://trustlists.org)
- [trustlists Companion](https://app.trustlists.org)
- [Issues](https://github.com/trustlists/trustlists-plugin/issues)
