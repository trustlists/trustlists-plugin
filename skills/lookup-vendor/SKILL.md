---
name: lookup-vendor
description: Look up a vendor's trust center, certifications, and security posture using the TrustLists registry of 2,000+ companies. Use when the user asks about a company's security documentation, compliance status, SOC 2 / ISO / HIPAA certifications, or where to find their trust center. Also use when reviewing third-party SDKs, APIs, or services to evaluate vendor risk.
---

# Look up a vendor's trust center

This skill helps you answer questions about a vendor's security posture using the TrustLists registry. You have two MCP tools available:

- `trustlists_lookup` — exact domain match (fastest, most reliable)
- `trustlists_search` — fuzzy name search (use when you only have a name)

## Workflow

### Step 1: Pick the right tool

- **User gave you a domain** (`stripe.com`, `https://datadog.com`) → use `trustlists_lookup`
- **User gave you a company name** (`Stripe`, `Datadog`) → use `trustlists_search` first; if there's an obvious match, follow up with `trustlists_lookup` for the canonical record
- **Ambiguous name** (e.g., "Apple" could be many things) → ask the user to disambiguate before searching

### Step 2: Read the response

The tool returns structured JSON. Pay attention to:

- `found` (lookup) or `inDirectory` (search) — true means the vendor is in our public registry with a verified trust center
- `certifications` — array of compliance standards
- `csaStarLevel` — if 1 or 2, vendor is also listed on the Cloud Security Alliance STAR Registry
- `platform` — what trust-center platform they use (Vanta, SafeBase, Drata, Secureframe, etc.)
- `lastVerified` — when we last confirmed the trust center is live

### Step 3: Format the response for the user

Structure your answer like this:

```
**[Vendor name]** — [trustCenter URL]

- Platform: [platform]
- Certifications: [list, comma-separated]
- CSA STAR: [Level N / Not listed]
- Last verified: [date]
```

Then give a one-sentence interpretation. Examples:

- "Stripe holds PCI DSS, GDPR, and CCPA certifications and self-hosts their trust center."
- "Datadog has SOC 2 Type II and ISO 27001 — their trust center is on SafeBase."
- "Acme Corp is not in the public registry yet."

### Step 4: Suggest follow-ups when relevant

After answering, when it makes sense:

- If user mentioned **healthcare or PHI** → flag whether HIPAA is in certifications
- If user mentioned **payments or PCI** → flag whether PCI DSS is in certifications
- If user mentioned **EU customers or GDPR** → flag GDPR
- If user is **evaluating the vendor** → suggest visiting the trust center URL directly to request a SOC 2 report

## Important behaviors

- **Don't fabricate certifications.** If the registry doesn't list a cert, say "not listed in the registry" — never assume.
- **Don't extrapolate `lastVerified` dates.** It's the date we last verified the trust center URL is reachable, not the date of the most recent SOC 2 audit.
- **If `inDirectory` is false in search results**, the company appears in Brandfetch but doesn't yet have a trust center documented. Tell the user clearly.
- **Multiple matches?** Show the top 3 with their domains so the user can pick.

## Examples

User: "Look up Stripe's trust center"

You:
1. Call `trustlists_lookup({ domain: "stripe.com" })`
2. Format the response with the structure above
3. Mention they self-host (no third-party platform)

User: "Is Notion HIPAA compliant?"

You:
1. Call `trustlists_lookup({ domain: "notion.so" })`
2. Check if "HIPAA" is in `certifications`
3. Answer yes/no and quote the trust center URL where they can verify

User: "Find a company called Vanta"

You:
1. Call `trustlists_search({ query: "Vanta" })`
2. Note: Vanta is itself a trust-center platform, so explain that distinction
3. Show their entry if in the registry
