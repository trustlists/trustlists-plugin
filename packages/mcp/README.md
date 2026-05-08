# @trustlists/mcp

> MCP server that gives AI assistants access to the TrustLists vendor security registry.

This is the npm-distributed MCP server that powers the [TrustLists plugin](https://github.com/trustlists/trustlists-plugin) for Cursor, Claude Code, and other Model Context Protocol clients.

## Installation

You don't install this package directly — it's spawned by your MCP-aware AI client.

### Cursor

The TrustLists plugin handles installation. Or add manually to `~/.cursor/mcp.json`:

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

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

## Tools

| Tool | Description |
|------|-------------|
| `trustlists_search` | Search 2,000+ trust centers by name or domain |
| `trustlists_lookup` | Look up a single vendor by exact domain |
| `trustlists_audit_dependencies` | Scan project manifests for vendor security posture |

All tools are free. No authentication required.

## Supported manifest formats (audit tool)

- `package.json` (npm/yarn/pnpm)
- `requirements.txt`, `pyproject.toml`, `Pipfile` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)
- `Gemfile` (Ruby)
- `composer.json` (PHP)

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Links

- [Plugin source](https://github.com/trustlists/trustlists-plugin)
- [TrustLists Directory](https://trustlists.org)
