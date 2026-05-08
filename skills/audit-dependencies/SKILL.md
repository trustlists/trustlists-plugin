---
name: audit-dependencies
description: Audit a project's third-party dependencies for vendor security posture using the TrustLists registry. Identifies which dependencies have trust centers, which lack security documentation, and produces a supply chain risk report. Use when the user asks to "audit dependencies", "review supply chain", "check vendor security", or before adding new third-party packages.
---

# Audit project dependencies

Use the `trustlists_audit_dependencies` MCP tool to scan a project's dependency manifests and map each dependency to its vendor's trust center.

Supported manifests: `package.json`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`.

## Workflow

### Step 1: Identify the project root

Use the workspace root or the directory containing the manifest the user is asking about. If unclear, ask.

### Step 2: Decide on dev dependencies

Default to runtime-only (`includeDevDependencies: false`). Ask the user only if:

- They explicitly mention dev tools, build tools, or testing libraries
- The project has unusually heavy dev deps (monorepo, complex CI)

Dev dependencies usually don't run in production, so their vendor security matters less.

### Step 3: Run the audit

```
trustlists_audit_dependencies({ projectPath: "/abs/path/to/project" })
```

You'll get back structured JSON with:

- `totalDependencies` — count of unique deps found
- `withTrustCenters` — count matched to TrustLists registry
- `withoutTrustCenters` — count of unknowns
- `unknownVendor` — count where we couldn't even identify the vendor
- `byManager` — breakdown by package manager
- `results` — array of `{ name, vendor?, hasTrustCenter, trustCenter?, certifications, csaStarLevel?, matchType }`
- `scannedFiles` — which manifests were processed

### Step 4: Produce a risk report

The tool returns raw data. **You** produce the analysis. Follow this structure:

#### 1. Top-line summary

```
Audited [N] dependencies across [scanned files].
[X]/[N] have verified trust centers ([percent]% coverage).
```

#### 2. Coverage assessment

Apply this rubric to interpret coverage percentage:

- **80%+** — Excellent supply chain visibility
- **60-79%** — Good, typical for SaaS apps
- **40-59%** — Moderate, manual review of unknowns recommended
- **<40%** — Significant blind spots; many vendors lack public security docs

#### 3. Highlights

Pick out:

- **Strongest vendors** — those with multiple top-tier certs (SOC 2 Type II + ISO 27001 + CSA STAR)
- **Compliance-relevant** — if the user works in healthcare, fintech, or government, highlight HIPAA, PCI DSS, FedRAMP entries
- **Platform diversity** — note if many deps go through a single provider (e.g., heavy AWS dependency)

#### 4. Unknowns to review

List the top 5-10 dependencies where `hasTrustCenter` is false. Group them:

- **Likely worth investigating** — non-obvious vendors (data, analytics, comms tools)
- **Probably benign** — pure utility libraries with no SaaS backend (`lodash`, `moment`, etc.)
- **Could not identify vendor** — `matchType: "unknown"`; user should verify manually

#### 5. Recommended next steps

End with 2-3 concrete actions, e.g.:
- "Run `lookup-vendor` for any specific package you're concerned about"
- "Visit [top vendor's] trust center to grab their SOC 2 report"
- "Consider replacing X with Y, which has stronger compliance posture"

## Formatting tips

Use markdown tables for the per-dependency breakdown when there are 5+ entries:

```
| Package | Vendor | Trust Center | Certifications |
|---------|--------|--------------|----------------|
| stripe  | Stripe | trust.stripe… | SOC 2 II, PCI DSS |
```

Group by `manager` if the project uses multiple package managers.

## Important behaviors

- **Don't lecture.** Most projects will have many unknowns; that's normal.
- **Don't confuse "no trust center in our registry" with "insecure."** Plenty of well-maintained packages are from vendors who simply haven't published one yet.
- **Don't make up risk scores.** The tool doesn't return one; if you provide an aggregate, base it transparently on the coverage percentage and certification quality.
- **Pure utility libraries are fine without trust centers.** `lodash` doesn't run on a backend you communicate with. Note this distinction for the user.
- **Highlight `csaStarLevel: 2` entries.** Level 2 means the vendor has independent third-party assessment — a strong signal.

## Examples

User: "Audit my package.json for vendor security."

You:
1. Determine the workspace root from context
2. Call `trustlists_audit_dependencies({ projectPath: workspaceRoot })`
3. Produce the structured report above
4. Suggest 2-3 follow-ups

User: "Check the supply chain risk for this Python project."

You:
1. Call `trustlists_audit_dependencies({ projectPath: workspaceRoot })`
2. The tool will pick up `requirements.txt` / `pyproject.toml` / `Pipfile` automatically
3. Report results, noting the Python ecosystem typically has lower trust center coverage than npm
