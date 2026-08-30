---
description: Quick yes/no compliance check for a vendor
---

Check the public trustlists record for: $ARGUMENTS

Use the `compliance-quick-check` skill instructions. Parse the question to identify:

1. The vendor (domain or name)
2. The compliance standard being asked about (SOC 2, ISO 27001, HIPAA, GDPR, PCI DSS, FedRAMP, CSA STAR)

Call `trustlists_lookup` (or `trustlists_search` if only a name was given), check the relevant fields, and answer in 1-2 sentences with a link to the trust center.

Be honest about the source of truth. Say "the trustlists record lists" or "the
vendor's trust center publishes," not that trustlists certified the vendor or
made a definitive legal or compliance determination.
