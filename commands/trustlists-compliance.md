---
description: Quick yes/no compliance check for a vendor
---

Quick compliance check for: $ARGUMENTS

Use the `compliance-quick-check` skill instructions. Parse the question to identify:

1. The vendor (domain or name)
2. The compliance standard being asked about (SOC 2, ISO 27001, HIPAA, GDPR, PCI DSS, FedRAMP, CSA STAR)

Call `trustlists_lookup` (or `trustlists_search` if only a name was given), check the relevant fields, and answer in 1-2 sentences with a link to the trust center.

Be honest about the source of truth — the answer is "according to the TrustLists registry," not a definitive legal claim.
