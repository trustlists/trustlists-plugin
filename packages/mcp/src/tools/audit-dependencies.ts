/**
 * trustlists_audit_dependencies — scan a project's dependency manifests and
 * map each dependency to its vendor's trust center.
 *
 * Supports:
 *   - package.json (npm/yarn/pnpm)
 *   - requirements.txt, pyproject.toml, Pipfile (Python)
 *   - go.mod (Go)
 *   - Cargo.toml (Rust)
 *   - Gemfile (Ruby)
 *   - composer.json (PHP)
 *
 * Returns a structured audit so the host AI (Cursor/Claude) can produce a
 * risk report without us shipping our own scoring logic.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getRegistry, normalizeDomain, type RegistryEntry } from '../api/client.js';

export const auditInputSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  includeDevDependencies: z.boolean().optional().default(false),
});

export type AuditInput = z.infer<typeof auditInputSchema>;

interface DiscoveredDependency {
  name: string;
  manager: string;
  scope: 'runtime' | 'dev';
  rawSpec?: string;
}

interface AuditedDependency {
  name: string;
  manager: string;
  scope: 'runtime' | 'dev';
  vendor?: string;
  domain?: string;
  hasTrustCenter: boolean;
  trustCenter?: string;
  platform?: string;
  certifications: string[];
  csaStarLevel?: number;
  matchType: 'exact' | 'heuristic' | 'unknown';
}

export interface AuditToolResult {
  projectPath: string;
  scannedFiles: string[];
  totalDependencies: number;
  withTrustCenters: number;
  withoutTrustCenters: number;
  unknownVendor: number;
  byManager: Record<string, number>;
  results: AuditedDependency[];
  message: string;
}

export async function runAudit(input: AuditInput): Promise<AuditToolResult> {
  const projectRoot = path.resolve(input.projectPath);

  const scanners: Array<(root: string, includeDev: boolean) => Promise<{ file: string; deps: DiscoveredDependency[] } | null>> = [
    scanPackageJson,
    scanRequirementsTxt,
    scanPyprojectToml,
    scanPipfile,
    scanGoMod,
    scanCargoToml,
    scanGemfile,
    scanComposerJson,
  ];

  const scannedFiles: string[] = [];
  const allDeps: DiscoveredDependency[] = [];

  for (const scanner of scanners) {
    try {
      const result = await scanner(projectRoot, input.includeDevDependencies);
      if (result) {
        scannedFiles.push(result.file);
        allDeps.push(...result.deps);
      }
    } catch {
      // skip this scanner; partial scans are better than no scan
    }
  }

  if (scannedFiles.length === 0) {
    return {
      projectPath: projectRoot,
      scannedFiles: [],
      totalDependencies: 0,
      withTrustCenters: 0,
      withoutTrustCenters: 0,
      unknownVendor: 0,
      byManager: {},
      results: [],
      message: `No supported dependency manifests found in ${projectRoot}. Looked for package.json, requirements.txt, pyproject.toml, Pipfile, go.mod, Cargo.toml, Gemfile, composer.json.`,
    };
  }

  const dedupedDeps = dedupeDependencies(allDeps);
  const registry = await getRegistry().catch(() => [] as RegistryEntry[]);
  const audited = await Promise.all(dedupedDeps.map((dep) => auditDependency(dep, registry)));

  const withTrustCenters = audited.filter((a) => a.hasTrustCenter).length;
  const unknown = audited.filter((a) => a.matchType === 'unknown').length;
  const withoutTrustCenters = audited.length - withTrustCenters;

  const byManager: Record<string, number> = {};
  for (const dep of audited) {
    byManager[dep.manager] = (byManager[dep.manager] || 0) + 1;
  }

  return {
    projectPath: projectRoot,
    scannedFiles,
    totalDependencies: audited.length,
    withTrustCenters,
    withoutTrustCenters,
    unknownVendor: unknown,
    byManager,
    results: audited,
    message: `Scanned ${scannedFiles.length} manifest${scannedFiles.length === 1 ? '' : 's'}. ${withTrustCenters}/${audited.length} dependencies have trust centers in the TrustLists registry.`,
  };
}

function dedupeDependencies(deps: DiscoveredDependency[]): DiscoveredDependency[] {
  const seen = new Map<string, DiscoveredDependency>();
  for (const dep of deps) {
    const key = `${dep.manager}:${dep.name.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, dep);
  }
  return Array.from(seen.values());
}

async function auditDependency(dep: DiscoveredDependency, registry: RegistryEntry[]): Promise<AuditedDependency> {
  const candidates = guessVendorDomains(dep.name, dep.manager);

  for (const candidate of candidates) {
    const match = registry.find((entry) => normalizeDomain(entry.website) === candidate);
    if (match) {
      return {
        name: dep.name,
        manager: dep.manager,
        scope: dep.scope,
        vendor: match.name,
        domain: candidate,
        hasTrustCenter: true,
        trustCenter: match.trustCenter,
        platform: match.platform,
        certifications: match.certifications || [],
        csaStarLevel: match.csaStar?.level,
        matchType: candidate === candidates[0] ? 'exact' : 'heuristic',
      };
    }
  }

  return {
    name: dep.name,
    manager: dep.manager,
    scope: dep.scope,
    hasTrustCenter: false,
    certifications: [],
    matchType: 'unknown',
  };
}

/**
 * Map a package name to likely vendor domains. The first candidate is the
 * highest-confidence guess; subsequent ones are fallbacks.
 *
 * Examples:
 *   "@stripe/stripe-js"   → ["stripe.com"]                         (npm scope)
 *   "datadog-api-client"  → ["datadoghq.com", "datadog.com"]       (well-known overrides)
 *   "boto3"               → ["aws.amazon.com", "amazon.com"]       (known mapping)
 *   "lodash"              → []                                     (no obvious vendor)
 */
function guessVendorDomains(packageName: string, manager: string): string[] {
  const lower = packageName.toLowerCase();

  // Well-known overrides that the heuristic alone can't catch.
  const overrides = WELL_KNOWN_VENDOR_DOMAINS[lower];
  if (overrides && overrides.length) return overrides;

  const candidates: string[] = [];

  // npm scoped packages: @stripe/foo → stripe.com
  if (manager === 'npm' && lower.startsWith('@')) {
    const scope = lower.slice(1).split('/')[0];
    if (scope) candidates.push(`${scope}.com`);
  }

  // Python: boto3 → amazonaws.com via override; otherwise no good guess.
  // Go: github.com/stripe/stripe-go → stripe.com
  if (manager === 'go' && lower.startsWith('github.com/')) {
    const owner = lower.split('/')[1];
    if (owner) {
      candidates.push(`${owner}.com`);
      candidates.push(`${owner}.io`);
    }
  }

  // Ruby gems: stripe → stripe.com
  if (manager === 'rubygems') {
    candidates.push(`${lower}.com`);
  }

  return [...new Set(candidates)];
}

/**
 * Curated mapping for well-known dependencies whose package name doesn't
 * obviously match the vendor domain. We keep this list small and only add
 * entries we can verify against the registry.
 */
const WELL_KNOWN_VENDOR_DOMAINS: Record<string, string[]> = {
  // AWS SDKs
  boto3: ['amazon.com'],
  botocore: ['amazon.com'],
  'aws-sdk': ['amazon.com'],
  'aws-sdk-js': ['amazon.com'],
  '@aws-sdk/client-s3': ['amazon.com'],
  // Datadog
  'datadog-api-client': ['datadoghq.com'],
  'dd-trace': ['datadoghq.com'],
  '@datadog/browser-rum': ['datadoghq.com'],
  // Sentry
  '@sentry/node': ['sentry.io'],
  '@sentry/browser': ['sentry.io'],
  'sentry-sdk': ['sentry.io'],
  // Stripe
  stripe: ['stripe.com'],
  '@stripe/stripe-js': ['stripe.com'],
  'stripe-go': ['stripe.com'],
  // Twilio
  twilio: ['twilio.com'],
  '@twilio/voice-sdk': ['twilio.com'],
  // SendGrid
  '@sendgrid/mail': ['sendgrid.com'],
  sendgrid: ['sendgrid.com'],
  // Auth0
  'auth0-js': ['auth0.com'],
  '@auth0/nextjs-auth0': ['auth0.com'],
  // Okta
  '@okta/okta-auth-js': ['okta.com'],
  // Supabase
  '@supabase/supabase-js': ['supabase.com'],
  // Cloudflare
  '@cloudflare/workers-types': ['cloudflare.com'],
  // GitHub
  '@octokit/rest': ['github.com'],
  octokit: ['github.com'],
  // Postmark
  postmark: ['postmarkapp.com'],
  // Mailchimp
  '@mailchimp/mailchimp_marketing': ['mailchimp.com'],
  // PagerDuty
  pagerduty: ['pagerduty.com'],
};

// ---------- Manifest scanners ----------

async function scanPackageJson(root: string, includeDev: boolean) {
  const file = path.join(root, 'package.json');
  const text = await fs.readFile(file, 'utf8');
  const json = JSON.parse(text);
  const deps: DiscoveredDependency[] = [];

  for (const [name, spec] of Object.entries(json.dependencies || {})) {
    deps.push({ name, manager: 'npm', scope: 'runtime', rawSpec: String(spec) });
  }
  if (includeDev) {
    for (const [name, spec] of Object.entries(json.devDependencies || {})) {
      deps.push({ name, manager: 'npm', scope: 'dev', rawSpec: String(spec) });
    }
  }
  for (const [name, spec] of Object.entries(json.peerDependencies || {})) {
    deps.push({ name, manager: 'npm', scope: 'runtime', rawSpec: String(spec) });
  }

  return { file: 'package.json', deps };
}

async function scanRequirementsTxt(root: string, _includeDev: boolean) {
  const file = path.join(root, 'requirements.txt');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = trimmed.split(/[<>=!~\s;]/)[0].toLowerCase();
    if (name) deps.push({ name, manager: 'pypi', scope: 'runtime' });
  }

  return { file: 'requirements.txt', deps };
}

async function scanPyprojectToml(root: string, includeDev: boolean) {
  const file = path.join(root, 'pyproject.toml');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  // Lightweight TOML parsing for [project.dependencies] and [tool.poetry.dependencies].
  const dependencyArray = matchTomlArray(text, /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  for (const entry of dependencyArray) {
    const name = entry.replace(/^['"]/, '').split(/[<>=!~\s;]/)[0].toLowerCase();
    if (name) deps.push({ name, manager: 'pypi', scope: 'runtime' });
  }

  const poetryRuntime = matchTomlSection(text, /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of poetryRuntime) {
    if (name === 'python') continue;
    deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'runtime' });
  }

  if (includeDev) {
    const poetryDev = matchTomlSection(text, /\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of poetryDev) {
      if (name === 'python') continue;
      deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'dev' });
    }
  }

  return { file: 'pyproject.toml', deps };
}

function matchTomlArray(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/,/)
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function matchTomlSection(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match || !match[1]) return [];
  const names: string[] = [];
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim().replace(/^['"]|['"]$/g, '');
    if (name) names.push(name);
  }
  return names;
}

async function scanPipfile(root: string, includeDev: boolean) {
  const file = path.join(root, 'Pipfile');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  const runtime = matchTomlSection(text, /\[packages\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of runtime) {
    deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'runtime' });
  }

  if (includeDev) {
    const dev = matchTomlSection(text, /\[dev-packages\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of dev) {
      deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'dev' });
    }
  }

  return { file: 'Pipfile', deps };
}

async function scanGoMod(root: string, _includeDev: boolean) {
  const file = path.join(root, 'go.mod');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  // require ( ... ) blocks and single-line require statements.
  const requireBlock = text.match(/require\s+\(([\s\S]*?)\)/);
  if (requireBlock && requireBlock[1]) {
    for (const line of requireBlock[1].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const name = trimmed.split(/\s+/)[0];
      if (name) deps.push({ name: name.toLowerCase(), manager: 'go', scope: 'runtime' });
    }
  }

  for (const m of text.matchAll(/^require\s+(\S+)\s+\S+/gm)) {
    if (m[1]) deps.push({ name: m[1].toLowerCase(), manager: 'go', scope: 'runtime' });
  }

  return { file: 'go.mod', deps };
}

async function scanCargoToml(root: string, includeDev: boolean) {
  const file = path.join(root, 'Cargo.toml');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  const runtime = matchTomlSection(text, /\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of runtime) {
    deps.push({ name: name.toLowerCase(), manager: 'cargo', scope: 'runtime' });
  }

  if (includeDev) {
    const dev = matchTomlSection(text, /\[dev-dependencies\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of dev) {
      deps.push({ name: name.toLowerCase(), manager: 'cargo', scope: 'dev' });
    }
  }

  return { file: 'Cargo.toml', deps };
}

async function scanGemfile(root: string, _includeDev: boolean) {
  const file = path.join(root, 'Gemfile');
  const text = await fs.readFile(file, 'utf8');
  const deps: DiscoveredDependency[] = [];

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
    if (match && match[1]) {
      deps.push({ name: match[1].toLowerCase(), manager: 'rubygems', scope: 'runtime' });
    }
  }

  return { file: 'Gemfile', deps };
}

async function scanComposerJson(root: string, includeDev: boolean) {
  const file = path.join(root, 'composer.json');
  const text = await fs.readFile(file, 'utf8');
  const json = JSON.parse(text);
  const deps: DiscoveredDependency[] = [];

  for (const name of Object.keys(json.require || {})) {
    if (name === 'php' || name.startsWith('ext-')) continue;
    deps.push({ name: name.toLowerCase(), manager: 'composer', scope: 'runtime' });
  }
  if (includeDev) {
    for (const name of Object.keys(json['require-dev'] || {})) {
      if (name === 'php' || name.startsWith('ext-')) continue;
      deps.push({ name: name.toLowerCase(), manager: 'composer', scope: 'dev' });
    }
  }

  return { file: 'composer.json', deps };
}

export const auditToolDefinition = {
  name: 'trustlists_audit_dependencies',
  description:
    "Scan a project's dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml, Gemfile, composer.json, pyproject.toml, Pipfile) and map each dependency to its vendor's trust center in the TrustLists registry. Returns structured data for the AI to produce a supply chain risk report. Use when reviewing third-party packages or doing a security audit.",
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the project root containing dependency manifests.',
      },
      includeDevDependencies: {
        type: 'boolean',
        description: 'If true, include devDependencies / dev-packages / dev-dependencies. Default false.',
        default: false,
      },
    },
    required: ['projectPath'],
  },
} as const;
