---
name: analyze-soc2
description: Analyze local SOC 2 report PDFs with trustlists Companion. Use when the user wants findings from a SOC 2 Type I or Type II PDF, a credit cost preview, or to poll an analysis job. Requires a signed-in trustlists MCP session.
---

# Analyze a SOC 2 report

Use these tools after the user is signed in (`trustlists_login`):

- `trustlists_soc2_analyze` - upload and preview cost, then queue with `confirmCredits`
- `trustlists_soc2_status` - poll job ids
- `trustlists_soc2_report` - read a finished analysis (`summary`, `markdown`, or `json`)

These tools read local PDFs, so they only exist on the stdio server
(`npx -y @trustlists/mcp`), not on the hosted HTTP endpoint.

## Workflow

### Step 1: Sign in

Call `trustlists_whoami`. If `signedIn` is false, follow the sign-in skill
before analyzing. Never claim you can analyze while signed out.

### Step 2: Preview the cost (do not charge yet)

Call `trustlists_soc2_analyze` with the PDF path or paths. Omit
`confirmCredits`.

```
trustlists_soc2_analyze({ filePath: "/abs/path/to/report.pdf" })
```

or

```
trustlists_soc2_analyze({ filePaths: ["/a.pdf", "/b.pdf"] })
```

The first call uploads the files and returns `needs_confirmation` with
`totalCreditsRequired`. Nothing is charged.

Tell the user the page count, tier, and credit total. Ask them to confirm
before you spend credits.

### Step 3: Confirm and queue

Only after the user agrees, call again with the **same paths** and

```
confirmCredits: <totalCreditsRequired from the preview>
```

Do not invent a number. If the tool returns `credits_mismatch`, show the new
total and ask again. If it returns `insufficient_credits`, send them to
`buyCreditsUrl`.

Never loop `trustlists_soc2_analyze` without `confirmCredits` hoping it will
start on its own. Never pass `confirmCredits` on the first call.

### Step 4: Poll, then read the report

Use the returned `jobIds`:

```
trustlists_soc2_status({ jobIds: ["..."] })
```

Wait about 30 seconds between polls. When `allDone` is true and a job has a
`reportId`, call

```
trustlists_soc2_report({ reportId: "...", format: "summary" })
```

Use `markdown` when the user wants the full write-up. Results also appear in
the trustlists app.

## Important behaviors

- **Preview, then confirm.** The confirm gate is how credits are spent.
- **Max 20 files per call.** Split larger sets.
- **PDFs only,** 1 byte to 50 MB each.
- **Do not re-upload to "try again"** if the preview is still valid. Repeat
  the same paths plus `confirmCredits`.
- **Do not treat the analysis as a certification.** It is a reading of the
  report the user supplied.

## Examples

User: "What's in ./acme-soc2.pdf?"

You:

1. `trustlists_whoami` (sign in if needed)
2. `trustlists_soc2_analyze({ filePath: "<resolved path>" })`
3. Tell them it will use N credits and wait for a yes
4. Same call with `confirmCredits: N`
5. Poll `trustlists_soc2_status`, then `trustlists_soc2_report`
