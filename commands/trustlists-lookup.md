---
description: Look up a vendor's trust center and certifications
---

Look up the trust center and security posture for: $ARGUMENTS

Use the `trustlists_lookup` MCP tool first if the user provided a domain, or `trustlists_search` if they only provided a name.

Format the response as:

```
**[Vendor Name]** — [Trust Center URL]

- Platform: [platform or "Self-hosted"]
- Certifications: [comma-separated list]
- CSA STAR: [Level N or "Not listed"]
- Last verified: [date or "Unknown"]
```

Then add a one-sentence interpretation tailored to what the user is likely doing (evaluating the vendor, doing vendor review, etc.).

If the vendor isn't in the registry, say so clearly and suggest visiting their website's `/security` or `/trust` path to check manually.
