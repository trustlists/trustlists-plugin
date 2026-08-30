# Development Guide

How to develop, test, and ship the trustlists_ plugin.

## Repo layout

```
trustlists-plugin/
├── .cursor-plugin/plugin.json    # Cursor manifest
├── mcp.json                      # MCP server registration
├── skills/                       # Cross-platform (Cursor + Claude)
├── rules/                        # Cursor-specific persistent guidance
├── commands/                     # Cursor slash commands
├── packages/
│   └── mcp/                      # The MCP server (published as @trustlists/mcp)
│       ├── src/
│       │   ├── index.ts          # Server entry
│       │   ├── api/              # Public directory client
│       │   └── tools/            # Tool implementations
│       └── package.json
└── .github/workflows/            # CI + npm publish automation
```

## Local development

### First-time setup

```bash
git clone https://github.com/trustlists/trustlists-plugin.git
cd trustlists-plugin
npm install
npm run build
```

### Iterate on the MCP server

```bash
npm run dev   # tsc --watch in packages/mcp
```

### Smoke test the server manually

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | node packages/mcp/dist/index.js
```

You should get a JSON response listing all 4 tools.

### Test a tool against the live API

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"trustlists_lookup","arguments":{"domain":"stripe.com"}}}' \
  | node packages/mcp/dist/index.js
```

## Loading the plugin into Cursor

### Option A: Symlink (recommended for development)

```bash
ln -s "$(pwd)" ~/.cursor/plugins/local/trustlists
```

Then restart Cursor (`Cmd+Q` and relaunch, or run "Developer: Reload Window").

### Option B: Direct copy

Copy the entire repo to `~/.cursor/plugins/local/trustlists`.

### Verify it loaded

1. Open Cursor Settings (`Cmd+Shift+J`)
2. Navigate to **Features → Model Context Protocol**
3. You should see `trustlists` listed and toggleable
4. In a chat, ask: "Look up Stripe's trust center." Cursor should call `trustlists_lookup`.

## Loading into Claude Code

The skills are cross-compatible. Copy them:

```bash
cp -r skills/ ~/.claude/skills/
```

Then add the MCP server to your Claude config:

```bash
claude mcp add trustlists -- npx -y @trustlists/mcp
```

(Or wait for `@trustlists/mcp` to publish to npm and use that command directly.)

## Publishing a new version

The npm package publishes automatically when you create a GitHub Release.

### Cut a release

```bash
# Bump version
cd packages/mcp
npm version patch    # or minor/major
cd ../..

# Tag and push
git add packages/mcp/package.json
git commit -m "chore: bump @trustlists/mcp to vX.Y.Z"
git tag vX.Y.Z
git push --tags
git push
```

Then on GitHub, draft a Release pointing at the tag. The `publish.yml` workflow handles the rest.

### Manual publish (one-time, before automation)

```bash
cd packages/mcp
npm publish --access public
```

## Architecture decisions

### Why no auth in v0.2?

The four current tools read the public directory. They do not need a trustlists account.

Companion features such as SOC 2 analysis stay on app.trustlists.org. If those ever become MCP tools, they will need a signed-in Companion token. Do not add them to the free package until that auth path exists.

### Why a workspace?

So the npm package (`packages/mcp/`) can ship cleanly without dragging in skill/rule/command files that don't belong in npm. Cursor reads from the repo root; npm publishes from `packages/mcp/`.

### Why a `WELL_KNOWN_VENDOR_DOMAINS` map in the audit tool?

Some package names don't obviously map to a vendor domain (`boto3` → AWS, `dd-trace` → Datadog). We curate a small list for these cases. The list is intentionally tiny because most packages map cleanly via heuristics or scoped npm names.

## Troubleshooting

### "Cannot find module" errors after `npm install`

Make sure you're using Node 18+:

```bash
node --version
```

### Cursor doesn't see the plugin

- Verify the symlink: `ls -la ~/.cursor/plugins/local/trustlists`
- Reload Cursor (`Cmd+Shift+P` → "Developer: Reload Window")
- Check Cursor's developer console for errors

### MCP server crashes on startup

Run it manually and check stderr:

```bash
node packages/mcp/dist/index.js < /dev/null
```

The first stderr line should be: `[trustlists-mcp] v0.2.0 running on stdio`.
