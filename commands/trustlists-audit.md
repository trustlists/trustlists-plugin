---
description: Audit project dependencies for vendor security posture
---

Audit this project's dependencies for vendor security posture using the TrustLists registry.

Use the `trustlists_audit_dependencies` MCP tool with the workspace root path. Default to runtime dependencies only (`includeDevDependencies: false`) unless the user specifies otherwise.

Follow the `audit-dependencies` skill instructions for producing the structured risk report:

1. Top-line summary with coverage percentage
2. Coverage assessment (rubric: 80%+ excellent, 60-79% good, 40-59% moderate, <40% blind spots)
3. Highlights — strongest vendors, compliance-relevant entries
4. Top 5-10 unknowns to review, grouped by likely investigability
5. 2-3 concrete next steps

Use markdown tables if there are 5+ dependencies to show.
