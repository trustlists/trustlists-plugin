---
name: request-trust-center-access
description: Request access to a vendor trust center through trustlists (SafeBase and Vanta listings). Use when the user wants documents from a vendor portal, to fill the requester profile, or to continue a live-browser handoff. Requires a signed-in trustlists MCP session.
---

# Request trust-center access

Use these tools after the user is signed in (`trustlists_login`):

- `trustlists_requester_profile` - get or patch the form identity
- `trustlists_access_request` - preview, then enqueue one vendor
- `trustlists_access_request_batch` - up to 5 vendors, one confirm
- `trustlists_access_status` - poll jobs; includes the live URL on `needs_buyer`
- `trustlists_access_continue` - after the user finishes in the live browser

Automation only works for **verified SafeBase or Vanta** directory listings.

## Workflow

### Step 1: Sign in and complete the profile

1. `trustlists_whoami` (follow the sign-in skill if signed out)
2. `trustlists_requester_profile` with no arguments
3. If `complete` is false, ask for the `missing` fields and save them:

```
trustlists_requester_profile({
  fullName: "Ada Lovelace",
  company: "Example Corp",
  role: "Security Analyst",
  termsAccepted: true
})
```

`termsAccepted: true` is required. It is permission to accept vendor terms on
the user's behalf. Do not set it unless the user agrees.

Email comes from the signed-in account and cannot be patched here.

### Step 2: Preview the request (do not submit yet)

```
trustlists_access_request({ vendor: "stripe.com" })
```

or a company name. The first call must **omit** `confirm`. Show the resolved
vendor, platform, and trust center. If the result is `unsupported_platform`,
stop and say only SafeBase and Vanta listings can be automated.

For several vendors (max 5):

```
trustlists_access_request_batch({ vendors: ["stripe.com", "datadog.com"] })
```

Do not silently send more than 5. Split larger lists and confirm each group.

### Step 3: Confirm, then enqueue

Only after the user says yes:

```
trustlists_access_request({ vendor: "stripe.com", confirm: true })
```

or the same batch with `confirm: true`. One confirm covers the whole batch.

If the result is `profile_incomplete`, fix the profile and retry. Do not keep
calling with `confirm: true`.

### Step 4: Poll and handle the live-browser handoff

```
trustlists_access_status({ jobIds: ["..."] })
```

- `queued` / `running`: wait about 30 seconds and poll again
- `needs_buyer`: tell the user to open `browserbase_session_url` before
  `takeover_expires_at`. When they are done, call
  `trustlists_access_continue({ jobId })`
- `waiting_on_vendor`: the form was submitted; the vendor still has to approve
- failed / blocked: show `errorMessage` and stop

Do not invent a parallel browser farm. The worker runs one job at a time.

## Important behaviors

- **Profile first.** A 409 on enqueue is fixable in chat with the profile tool.
- **Confirm before submit.** Never pass `confirm: true` on the first call.
- **Cap is 5.** No silent bulk beyond that.
- **SafeBase and Vanta only.** Other platforms need a manual visit to the
  vendor trust center.
- **Show the handoff link.** The user has to finish some portals themselves.
- **Do not claim documents arrived** until status says the vendor side is done
  and the user can see evidence in the app.

## Examples

User: "Request access to Notion's trust center"

You:

1. Sign in if needed
2. Check / complete `trustlists_requester_profile`
3. `trustlists_access_request({ vendor: "notion.so" })` and show the preview
4. After they confirm, the same call with `confirm: true`
5. Poll status; if `needs_buyer`, send them the live URL, then
   `trustlists_access_continue`
