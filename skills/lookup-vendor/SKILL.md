---
name: lookup-vendor
description: Look up a vendor's public trust center and listed frameworks using the trustlists directory of thousands of companies. Use when the user asks where to find a company's security documentation, whether its directory record lists SOC 2 / ISO / HIPAA information, or when reviewing a third-party service.
---

# Look up a vendor's trust center

This skill helps you find vendor-published security resources using the
trustlists directory. You have three relevant MCP tools:

- `trustlists_lookup` - exact domain match (fastest, most reliable)
- `trustlists_search` - name or partial-domain search
- `trustlists_browse` - filter by platform, listed framework, or CSA STAR level

## Workflow

### Step 1: Pick the right tool

- **User gave you a domain** (`stripe.com`, `https://datadog.com`) - use `trustlists_lookup`
- **User gave you a company name** (`Stripe`, `Datadog`) - use `trustlists_search` first; if there is an obvious match, follow up with `trustlists_lookup`
- **User asks for a group** ("SafeBase vendors", "CSA STAR Level 2") - use `trustlists_browse`
- **Ambiguous name** (for example, "Apple") - ask the user to disambiguate

### Step 2: Read the response

The tool returns structured JSON. Pay attention to:

- `found` (lookup) or `inDirectory` (search) - the vendor has a public directory record
- `certifications` - frameworks or compliance labels listed on that record
- `csaStarLevel` - if 1 or 2, the record links CSA STAR metadata
- `platform` - the detected trust-center platform
- `lastVerified` - when trustlists last checked the trust-center URL, not an audit date
- `directoryUrl` - the public trustlists source page

### Step 3: Format the response for the user

Structure your answer like this:

```
**[Vendor name]**

- Directory record: [directoryUrl]
- Vendor trust center: [trustCenter URL, only when available]
- Platform: [platform]
- Listed frameworks: [list, comma-separated]
- CSA STAR: [Level N / Not listed]
- Last verified: [date]
```

Then give a one-sentence factual interpretation. Examples:

- "Stripe's directory record lists PCI DSS and links its self-hosted trust center."
- "Datadog's record lists SOC 2 and ISO 27001; its trust center is hosted on SafeBase."
- "Acme Corp is not in the current public directory."

### Step 4: Suggest follow-ups when relevant

After answering, when it makes sense:

- If the user mentioned **healthcare or PHI**, say whether the record lists HIPAA information and tell them to confirm BAA availability and service scope
- If the user mentioned **payments or PCI**, identify the listed PCI label and note that scope must be verified
- If the user mentioned **EU privacy or GDPR**, describe it as a listed privacy signal, not a certification
- If the user is evaluating the vendor, suggest visiting the vendor's trust center to confirm current documents

## Important behaviors

- **Do not turn labels into proof.** Say "the directory record lists" or "the vendor's trust center publishes," not "trustlists certified" or "the vendor is compliant."
- **Do not call GDPR, CCPA, CPRA, HIPAA, or NIST certifications.**
- **Don't fabricate frameworks.** If the directory doesn't list one, say "not listed in the directory," never assume.
- **Always link the directory record.** Include `directoryUrl` for every matching record.
- **Only link a vendor trust center when provided.** Never invent a missing `trustCenter` URL.
- **Don't extrapolate `lastVerified` dates.** It's the date we last verified the trust center URL is reachable, not the date of the most recent SOC 2 audit.
- **Multiple matches?** Show the top 3 with their domains so the user can pick.

## Examples

User: "Look up Stripe's trust center"

You:
1. Call `trustlists_lookup({ domain: "stripe.com" })`
2. Format the response with the structure above
3. Mention they self-host (no third-party platform)

User: "Does Notion publish HIPAA information?"

You:
1. Call `trustlists_lookup({ domain: "notion.so" })`
2. Check whether "HIPAA" is listed
3. Say what the record lists and point to the vendor's trust center for BAA and scope confirmation

User: "Find a company called Vanta"

You:
1. Call `trustlists_search({ query: "Vanta" })`
2. Note: Vanta is itself a trust-center platform, so explain that distinction
3. Show their entry if in the registry
