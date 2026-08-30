# @trustlists/mcp

> MCP server that gives AI assistants access to the public trustlists directory.

This npm package powers the [trustlists_ plugin](https://github.com/trustlists/trustlists-plugin)
for Cursor, Claude Code, and other Model Context Protocol clients.

## Installation

You don't install this package directly. It is spawned by your MCP-aware AI client.

### Cursor

The trustlists_ plugin handles installation. Or add it manually to
`~/.cursor/mcp.json`:

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
| `trustlists_search` | Search thousands of trust centers by name or domain |
| `trustlists_lookup` | Look up a single vendor by exact domain |
| `trustlists_browse` | Filter by platform, listed framework, or CSA STAR level |
| `trustlists_audit_dependencies` | Map project manifests to public vendor trust centers |

All tools are free. No authentication required.

Directory labels show what a public record lists. They do not independently
prove certification scope, validity, legal compliance, or security quality.

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

- [MCP overview and setup](https://trustlists.org/mcp/)
- [Plugin source](https://github.com/trustlists/trustlists-plugin)
- [trustlists directory](https://trustlists.org)
