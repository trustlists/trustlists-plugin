---
name: compliance-quick-check
description: Fast yes/no on a vendor's compliance posture using the TrustLists registry. Returns just the certifications, CSA STAR status, and BAA/HIPAA-readiness in a one-line answer. Use for snap lookups during code review or when adding dependencies, when the user asks "is X SOC 2 compliant" or "does Y have HIPAA". Free, no credits.
---

# Compliance quick-check

A focused skill for fast compliance answers. Use when the user wants a single-question answer like:

- "Is Stripe PCI DSS compliant?"
- "Does Datadog have SOC 2 Type II?"
- "Is Notion HIPAA ready?"
- "Does Auth0 hold ISO 27001?"

Use the `trustlists_lookup` MCP tool. If the user gave a name without a domain, fall back to `trustlists_search`.

## Workflow

1. Extract the vendor and the specific compliance standard from the question
2. Call `trustlists_lookup` (or `trustlists_search` first if you only have a name)
3. Check the `certifications` array for the standard
4. Answer in one or two sentences with a citation to the trust center URL

## Standard mapping

When parsing user questions, map common phrasings to the canonical certification names you'll see in the registry:

| User says | Look for in `certifications` |
|-----------|------------------------------|
| "SOC 2", "SOC 2 compliant" | `SOC 2 Type II` (preferred) or `SOC 2 Type I` |
| "ISO 27001" | `ISO 27001` |
| "HIPAA", "HIPAA compliant", "BAA" | `HIPAA` (BAA usually noted in trust center) |
| "GDPR", "GDPR compliant" | `GDPR` |
| "PCI", "PCI DSS" | `PCI DSS` |
| "FedRAMP" | `FedRAMP Moderate` or `FedRAMP High` |
| "CSA STAR", "STAR Registry" | check `csaStarLevel` field, not certifications |

## Response format

Keep it tight. Three formats based on the answer:

### Yes
```
✓ [Vendor] holds [cert]. View their trust center: [URL]
```

### No
```
✗ [Vendor] does not list [cert] in the TrustLists registry. They may have it but not publish it — check their trust center directly: [URL]
```

### Not in registry
```
[Vendor] is not in the TrustLists registry. Run lookup-vendor to do an AI-powered search.
```

## Important behaviors

- **Be specific about the source of truth.** Phrasing like "according to the TrustLists registry" or "per their trust center" is honest. Avoid claiming "they have" or "they don't have" as absolute facts.
- **HIPAA caveat:** A "HIPAA" certification doesn't exist in the formal sense — vendors self-attest and sign BAAs. Phrase as "HIPAA-ready" or "publishes HIPAA documentation" rather than "HIPAA certified".
- **PCI DSS scope matters but you don't need to dig into it for a quick check.** Just confirm presence/absence.
- **Always link to the trust center URL.** That's the source of truth for the user.

## Examples

User: "Is Stripe PCI DSS compliant?"

You:
1. `trustlists_lookup({ domain: "stripe.com" })`
2. Check certifications for "PCI DSS"
3. Answer: `✓ Stripe holds PCI DSS. View their trust center: https://stripe.com/privacy-center/legal`

User: "Does Slack have SOC 2?"

You:
1. `trustlists_lookup({ domain: "slack.com" })`
2. Look for "SOC 2 Type II" or "SOC 2 Type I"
3. Answer accordingly with the URL
