---
name: compliance-quick-check
description: Quickly check whether a vendor's public trustlists record lists a requested framework or CSA STAR level. Use during vendor review or code review when someone asks about SOC 2, ISO 27001, HIPAA documentation, PCI DSS, or CSA STAR. Free, no credits.
---

# Compliance quick-check

A focused skill for fast directory checks. Use when the user wants an answer like:

- "Does Stripe's trust center list PCI DSS?"
- "Does Datadog publish SOC 2 information?"
- "Does Notion publish HIPAA information?"
- "Does Auth0 list ISO 27001?"

Use the `trustlists_lookup` MCP tool. If the user gave a name without a domain, fall back to `trustlists_search`.

## Workflow

1. Extract the vendor and the specific compliance standard from the question
2. Call `trustlists_lookup` (or `trustlists_search` first if you only have a name)
3. Check the `certifications` array for the requested label
4. Answer what the record lists in one or two sentences, always link `directoryUrl`, and include `trustCenter` only when provided

## Standard mapping

When parsing user questions, map common phrasings to the listed framework labels in the registry:

| User says | Look for in `certifications` |
|-----------|------------------------------|
| "SOC 2", "SOC 2 compliant" | `SOC 2`, `SOC 2 Type II`, or `SOC 2 Type I` |
| "ISO 27001" | `ISO 27001` |
| "HIPAA", "HIPAA compliant", "BAA" | `HIPAA` (BAA usually noted in trust center) |
| "GDPR", "GDPR compliant" | `GDPR` |
| "PCI", "PCI DSS" | `PCI DSS` |
| "FedRAMP" | `FedRAMP Moderate` or `FedRAMP High` |
| "CSA STAR", "STAR Registry" | check `csaStarLevel` field, not certifications |

## Response format

Keep it tight. Three formats based on the answer:

### Listed
```text
The trustlists record for [Vendor] lists [framework]: [directoryUrl]
```

### Not listed
```text
[Framework] is not listed on [Vendor]'s current trustlists record: [directoryUrl]
That does not prove absence.
```

For either response, append the following line only when `result.trustCenter` is
non-empty. Otherwise omit the entire line:

```text
Vendor trust center: [trustCenter URL]
```

### Not in registry
```text
[Vendor] is not in the current trustlists directory. Search by company name or check the vendor's website directly.
```

## Important behaviors

- **Be specific about the source of truth.** Say "the trustlists record lists" or "the vendor's trust center publishes." Do not make an independent compliance determination.
- **Do not call GDPR, CCPA, CPRA, HIPAA, or NIST certifications.**
- **HIPAA caveat:** A "HIPAA certification" does not exist in the formal sense. Say the vendor publishes HIPAA information and tell the user to confirm BAA availability and applicable services.
- **SOC 2 caveat:** A directory label does not establish the report type, period, scope, opinion, or current validity.
- **ISO and PCI caveat:** Confirm certificate or attestation scope and expiration with the vendor.
- **PCI DSS scope matters but you don't need to dig into it for a quick check.** Just confirm presence/absence.
- **Always link `directoryUrl`.** Include the vendor's `trustCenter` URL only when the tool provides one, and never invent a missing URL.

## Examples

User: "Does Stripe list PCI DSS?"

You:
1. `trustlists_lookup({ domain: "stripe.com" })`
2. Check certifications for "PCI DSS"
3. Answer that Stripe's record lists PCI DSS, link its `directoryUrl`, and link `trustCenter` for scope confirmation only when provided

User: "Does Slack have SOC 2?"

You:
1. `trustlists_lookup({ domain: "slack.com" })`
2. Look for "SOC 2 Type II" or "SOC 2 Type I"
3. Answer accordingly, link its `directoryUrl`, and include `trustCenter` only when provided
