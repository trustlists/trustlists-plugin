---
name: sign-in
description: Connect a trustlists account so SOC 2 analysis and trust-center access requests can run. Use when the user wants to analyze a SOC 2 PDF, request vendor access, check credits, or any account tool says it needs a connected account.
---

# Sign in to trustlists

Local stdio uses a device code and stores the session in
`~/.trustlists/auth.json`. Hosted clients use the client's OAuth connect flow
instead of `trustlists_login`. Use these tools when they are available:

- `trustlists_login` - start or finish the device-code flow
- `trustlists_whoami` - see the signed-in account, credits, and requester profile
- `trustlists_logout` - remove the stored session

Directory search, lookup, browse, and dependency audit never need this.

## Workflow

### Step 1: Check whether a session already exists

Call `trustlists_whoami`. If `signedIn` is true, tell the user who they are
and stop unless they asked to switch accounts. On local stdio, switch with
`trustlists_login` and `force: true`. On a hosted client, use the client's
account switcher. `trustlists_login` is not available there.

### Step 2: Start the device login

Skip this step on the hosted endpoint. Tell the user to connect trustlists
with the client's OAuth prompt, then call `trustlists_whoami` again.

On local stdio:

Call `trustlists_login` with no arguments (or `waitSeconds: 90`).

The first result is usually `pending`. Show the user:

1. The `verificationUriComplete` link (preferred) or `verificationUri`
2. The `userCode` so they can confirm it matches the page

Ask them to open the link in a browser where they are already signed in to
trustlists (or to sign in there first), then approve the code.

Do not invent a code. Do not open the URL yourself unless the user asks.

### Step 3: Resume if it is still pending

If the first call returns `pending`, call again with the returned `deviceCode`:

```
trustlists_login({ deviceCode: "<deviceCode from the pending result>" })
```

Keep the same `deviceCode`. Do not start a second grant unless the result is
`expired` or `denied`.

### Step 4: Confirm

On `signed_in` or `already_signed_in`, tell the user which email is connected.
Then continue with the original task (SOC 2 analyze or access request).

## Important behaviors

- **Show the URL and code.** The user has to approve in a browser. The MCP
  cannot complete login by itself.
- **Resume with `deviceCode`.** A new call without it starts a new grant and
  invalidates the code they were about to approve.
- **`force: true` only when switching accounts.** Otherwise leave the stored
  session alone.
- **If login is denied or expired,** start over with a fresh `trustlists_login`.
- **Free directory tools keep working while signed out.**

## Examples

User: "Analyze this SOC 2 PDF"

You:

1. Call `trustlists_whoami`
2. If signed out, call `trustlists_login` and show the link plus code
3. Resume with `deviceCode` until `signed_in`
4. Continue with the analyze skill
