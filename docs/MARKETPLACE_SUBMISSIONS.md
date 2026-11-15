# Marketplace submissions

trustlists uses one product and two transports:

- Local stdio: `npx -y @trustlists/mcp`, 15 tools, including device-code login and local files.
- Hosted OAuth: `https://mcp.trustlists.org/mcp`, 13 tools. OAuth replaces login and logout. SOC 2 files are uploaded in trustlists instead of being read from disk.

The official MCP Registry entry is `io.github.trustlists/mcp`. Publishing there does not create a Cursor, Claude, ChatGPT, or Codex listing. Each directory has its own review.

## Shared public links

| Use | URL |
| --- | --- |
| Documentation | https://trustlists.org/mcp/ |
| Support | https://trustlists.org/mcp/#support |
| Support email | mcp-plugin@trustlists.org |
| Privacy | https://trustlists.org/privacy/ |
| Terms | https://trustlists.org/terms/ |
| Website | https://trustlists.org/ |
| Source | https://github.com/trustlists/trustlists-plugin |
| Light icon | https://mcp.trustlists.org/marketplace-icon.png |
| Dark icon | https://mcp.trustlists.org/marketplace-icon-dark.png |

Publisher name: trustlists. Do not submit a personal name.

## Listing copy

- Display name: `trustlists` (10 characters)
- Short description: `Find vendor trust centers` (25 characters)
- Category: Developer Tools
- Starter prompts:
  - Find the public trust center for Stripe.
  - Which frameworks does the stripe.com record list?
  - Map the dependencies in this package.json to trust centers.

Long description:

> trustlists helps security, procurement, and engineering teams find public vendor trust centers from ChatGPT or Codex. Search the directory, look up a domain, browse listed frameworks, and map dependency manifests to public trust-center records.
>
> Directory results are public metadata. They are not a certification, audit, or security rating. SOC 2 analysis uses a trustlists account and can spend Companion credits only after a cost preview is confirmed. Trust-center access requests are sent to a vendor portal only after confirmation, and only for supported SafeBase or Vanta listings.
>
> The hosted connection cannot read files on your computer. Paste manifest text for a dependency check, and upload SOC 2 PDFs in trustlists.

## OAuth

The hosted server requires a bearer token. Its protected-resource metadata points at the trustlists Supabase authorization server, which advertises authorization, token, and dynamic client registration endpoints. Scopes used for identity are `openid`, `email`, and `profile`.

Do not put a client secret in any package. Register each marketplace callback if the authorization server requires an allowlist:

| Client | Callback |
| --- | --- |
| Cursor | `https://www.cursor.com/agents/mcp/oauth/callback` |
| Cursor local | `http://localhost:8787/callback` |
| Claude | `https://claude.ai/api/mcp/auth_callback` |
| ChatGPT and Codex | The exact callback shown in the OpenAI connection panel. It is either `https://chatgpt.com/connector_platform_oauth_redirect` or `https://chatgpt.com/connector/oauth/{callback_id}`. |

## Tool annotations

Titles, hints, and the justification text below come from `packages/mcp/src/tool-metadata.ts`. A read-only tool is never marked destructive. Credit spending and vendor-portal submission are consequential.

| Tool | Title | Read-only | Destructive | Idempotent | Open world | Where |
| --- | --- | --- | --- | --- | --- | --- |
| `trustlists_search` | Search trust centers | yes | no | yes | yes | both |
| `trustlists_lookup` | Look up a vendor | yes | no | yes | yes | both |
| `trustlists_browse` | Browse the directory | yes | no | yes | yes | both |
| `trustlists_audit_dependencies` | Map dependency trust centers | yes | no | yes | yes | both |
| `trustlists_whoami` | Show signed-in account | yes | no | yes | no | both |
| `trustlists_soc2_status` | Check SOC 2 analysis | yes | no | yes | no | both |
| `trustlists_soc2_report` | Read a SOC 2 analysis | yes | no | yes | no | both |
| `trustlists_requester_profile` | Update requester profile | no | no | yes | no | both |
| `trustlists_access_request` | Request trust-center access | no | yes | no | yes | both |
| `trustlists_access_status` | Check access requests | yes | no | yes | no | both |
| `trustlists_access_continue` | Resume access request | no | yes | no | yes | both |
| `trustlists_access_request_batch` | Request access in a batch | no | yes | no | yes | both |
| `trustlists_soc2_upload` | Open SOC 2 upload | yes | no | yes | no | hosted |
| `trustlists_login` | Sign in | no | yes | no | no | local |
| `trustlists_logout` | Sign out | no | yes | yes | no | local |
| `trustlists_soc2_analyze` | Analyze a SOC 2 PDF | no | yes | no | no | local |

Justifications for review forms:

- Search, lookup, and browse only read the public directory. They do not certify a vendor.
- Dependency mapping reads names and returns public records. Local mode can read named manifests. Hosted mode accepts only text the caller supplies. Neither mode installs packages or scores security.
- Account reads (`whoami`, SOC 2 status and report, access status) stay inside the connected account.
- SOC 2 upload only returns a link. Confirmed local analysis spends credits. Confirmed access requests submit to a vendor portal and are hard to undo.
- Profile updates replace the connected account's form profile and can be set again. They do not contact a vendor.
- Login can replace the local session. Logout deletes it. Repeating logout does nothing more.

## Cursor

Submit the public repository at https://cursor.com/marketplace/publish.

The repo is a Cursor plugin:

- `.cursor-plugin/plugin.json`
- root `mcp.json` runs `npx -y @trustlists/mcp`
- logo: `assets/marketplace-icon.png`
- skills and rules are discovered from `skills/` and `rules/`

Cursor does not have privacy or support fields in its manifest. Use the shared links in the review form if it asks. No plugin variable secrets are required.

## Claude

Submit the hosted URL at https://claude.ai/directory/manage and choose MCP connector. A paid Claude plan is required. Local stdio is not a separate directory submission.

Have ready: the icon, documentation, privacy, support contact `mcp-plugin@trustlists.org`, one to five categories, and at least three working prompts from `docs/REVIEWER_TESTS.md`. Claude reads `title`, `readOnlyHint`, and `destructiveHint` from the live server.

## ChatGPT and Codex

Build the review ZIP with:

```bash
npm run build:openai-plugin
```

The source is `marketplaces/openai/`. The ZIP is `marketplaces/openai/dist/trustlists-openai-plugin.zip`. It contains one remote server, listing copy, icons, five positive tests, and three negative tests. It contains no client secret, reviewer password, or demo account.

Upload it at https://platform.openai.com/plugins. The auth block uses dynamic client registration and does not include a client ID. Before connecting the server:

1. Copy the challenge token from the OpenAI domain check.
2. Set `OPENAI_APPS_CHALLENGE` on the hosted Vercel project.
3. Redeploy and confirm `https://mcp.trustlists.org/.well-known/openai-apps-challenge` returns only that token as plain text.
4. Enter reviewer credentials in the dashboard form, never in the ZIP.

Add `review.demo_recording_url` to `marketplaces/openai/plugin.json` after the walkthrough is uploaded, then rebuild the ZIP. OpenAI requires that HTTPS URL before review. The script rejects a non-HTTPS value and does not invent one.

## Registry release

`server.json` publishes both the npm stdio package and the hosted remote. The publish workflow validates the OpenAI ZIP and `server.json` before npm publish. The registry job runs after npm has the same version. If registry validation races npm propagation, rerun the failed registry job after `npm view @trustlists/mcp version` shows the release.
