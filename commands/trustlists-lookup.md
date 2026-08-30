---
description: Look up a vendor's trust center and listed frameworks
---

Look up the public trust center record for: $ARGUMENTS

Use the `trustlists_lookup` MCP tool first if the user provided a domain, or `trustlists_search` if they only provided a name.

Format the response as:

```
**[Vendor Name]**

- Directory record: [directoryUrl]
- Vendor trust center: [Trust Center URL, only when available]
- Platform: [platform or "Self-hosted"]
- Listed frameworks: [comma-separated list]
- CSA STAR: [Level N or "Not listed"]
- Last verified: [date or "Unknown"]
```

Then add a one-sentence factual summary tailored to the user's review. Describe
frameworks as labels on the directory record, not proof of compliance.

If the vendor isn't in the registry, say so clearly and suggest visiting their website's `/security` or `/trust` path to check manually.
