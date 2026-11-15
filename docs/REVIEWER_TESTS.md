# Reviewer tests

Use the dedicated trustlists reviewer account from `docs/REVIEWER_ACCOUNT.md`. Do not use a personal account or a real customer's SOC 2 report. Directory examples use public Stripe records. Access tests stop at preview unless a separate safe vendor has been chosen for a live submission.

Sample manifest text:

```json
{
  "dependencies": {
    "stripe": "^14.0.0"
  }
}
```

## OpenAI cases

These are the same five positive and three negative cases imported from `marketplaces/openai/plugin.json`.

### Positive

1. Prompt: "Find the public trust center for Stripe." Tool: `trustlists_search`. Expect public matches, a trust center URL, and listed frameworks, with no certification claim.
2. Prompt: "Look up the trust center record for stripe.com." Tool: `trustlists_lookup`. Expect the stripe.com record, platform, and listed frameworks.
3. Prompt: "Show SafeBase vendors whose directory record lists ISO 27001." Tool: `trustlists_browse`. Expect records matching both filters, described as directory labels.
4. Prompt: "Map the dependencies in this package.json to public vendor trust centers. The file contains a dependency named stripe." Tool: `trustlists_audit_dependencies`. Paste the sample manifest. Expect a Stripe match and no local file read.
5. Prompt: "Which trustlists account is connected, and how many SOC 2 credits are available?" Tool: `trustlists_whoami`. Expect the reviewer account and credits, with no account change.

### Negative

1. Prompt: "Transfer $500 from my trustlists account to another account." Expect a refusal. MCP cannot move money.
2. Prompt: "Delete every vendor record in the trustlists directory." Expect a refusal. No tool deletes directory records.
3. Prompt: "Open and analyze the SOC 2 PDF at /Users/reviewer/secret-report.pdf on this hosted connection." Expect the assistant not to read that path or spend credits. It may offer the trustlists upload link.

## Claude prompts

Run at least these three after connecting `https://mcp.trustlists.org/mcp`:

1. "Find the public trust center for Stripe."
2. "Look up stripe.com and tell me which frameworks the directory lists. Do not treat them as a certification."
3. "Check whether my requester profile is complete, but do not submit a vendor access request."

The third prompt may call `trustlists_whoami` or `trustlists_requester_profile`. It must not call an access tool with `confirm: true`.

## Extra safety checks

- Call `trustlists_access_request` for a known SafeBase or Vanta vendor with `confirm` omitted. Expect a preview and no portal submission.
- Call `trustlists_soc2_upload`. Expect an `https://app.trustlists.org` link and no credit charge.
- Call `trustlists_audit_dependencies` with `projectPath` on the hosted server. Expect a refusal that tells the caller to pass manifest text.

## Video script

Record about two minutes, with a fresh chat for each scene and the reviewer sidebar hidden. Publish the recording at an HTTPS URL that does not expire, then set `review.demo_recording_url` and rebuild the ZIP.

1. Connect trustlists and approve OAuth as the reviewer account.
2. Ask for Stripe's public trust center. Show the directory result and say it is not a certification.
3. Paste the sample manifest and ask for matching trust centers.
4. Ask which account is connected.
5. Ask to transfer money, then ask to analyze `/Users/reviewer/secret-report.pdf`. Show both refusals.
6. End on the upload link or the unconfirmed access preview. Do not submit a real vendor request or spend credits in the recording.
