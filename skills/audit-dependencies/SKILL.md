---
name: audit-dependencies
description: Map a project's third-party dependencies to public vendor trust center records using the trustlists directory. Produces a documentation-visibility inventory without treating directory absence as security risk. Use when asked to audit dependencies, review the software supply chain, or inventory third-party services.
---

# Audit project dependencies

Use the `trustlists_audit_dependencies` MCP tool to scan dependency manifests
and map likely vendors to public trust center records.

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

- `totalDependencies`: count of unique deps found
- `withTrustCenters` - count mapped to trustlists records
- `withoutTrustCenters` - count without a directory match
- `unknownVendor` - count where the tool could not identify the likely vendor
- `byManager` - breakdown by package manager
- `results` - array of `{ name, vendor?, hasTrustCenter, trustCenter?, certifications, csaStarLevel?, matchType }`
- `scannedFiles` - which manifests were processed

### Step 4: Produce a documentation-visibility report

The tool returns heuristic mappings and public directory data. Follow this structure:

#### 1. Top-line summary

```
Audited [N] dependencies across [scanned files].
[X]/[N] map to public trust center records ([percent]% documentation coverage).
```

#### 2. Coverage assessment

Describe coverage without turning it into a security grade:

- **80%+** - Most likely service vendors map to public records
- **60-79%** - Useful coverage with several mappings to review
- **40-59%** - Partial coverage; prioritize high-impact services manually
- **<40%** - The package list is a poor proxy for vendor inventory, or many mappings are unknown

#### 3. Highlights

Pick out:

- **Documented vendors** - those with several listed frameworks or CSA STAR metadata
- **Compliance-relevant labels** - if the user works in healthcare, fintech, or government, identify relevant directory labels without declaring compliance
- **Platform concentration** - note repeated vendor or infrastructure mappings

#### 4. Unknowns to review

List the top 5-10 dependencies where `hasTrustCenter` is false. Group them:

- **Likely services to investigate** - data, analytics, communications, infrastructure, and hosted APIs
- **Probably local libraries** - packages with no vendor service or data transfer
- **Could not identify vendor** - `matchType: "unknown"`; verify manually

#### 5. Recommended next steps

End with 2-3 concrete actions, e.g.:
- "Run `lookup-vendor` for any specific package you're concerned about"
- "Visit [top vendor's] trust center to grab their SOC 2 report"
- "Confirm whether package X actually sends data to a hosted service before treating it as a vendor"

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
- **Do not confuse "no directory match" with "insecure."** Many packages are local libraries, and some vendors publish security material outside a trust center.
- **Do not make up risk scores.** Coverage measures directory matching, not vendor security.
- **Treat heuristic matches as candidates.** Confirm the package owner before relying on the linked vendor record.
- **Pure utility libraries are fine without trust centers.** `lodash` doesn't run on a backend you communicate with. Note this distinction for the user.
- **Mention `csaStarLevel: 2` entries when relevant.** Level 2 records involve independent third-party assessment. Treat the level as registry metadata, not a full-vendor security score, and verify its current scope at the source.

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
