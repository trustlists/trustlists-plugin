---
description: Map project dependencies to public vendor trust center records
---

Map this project's dependencies to public vendor trust center records using the
trustlists directory.

Use the `trustlists_audit_dependencies` MCP tool with the workspace root path. Default to runtime dependencies only (`includeDevDependencies: false`) unless the user specifies otherwise.

Follow the `audit-dependencies` skill instructions for producing the structured
documentation-visibility report:

1. Top-line summary with coverage percentage
2. Coverage assessment without treating directory presence as a security grade
3. Highlights: documented vendors and compliance-relevant labels
4. Top 5-10 unknowns to review, grouped by likely investigability
5. 2-3 concrete next steps

Use markdown tables if there are 5+ dependencies to show.
