/**
 * Access-requestor tools: requester profile, single request, status,
 * continue, and a small batch (max 5).
 *
 * All of these need a stored Companion session (trustlists_login). Enqueue
 * is confirm-gated so an agent cannot fire requests without the user saying
 * so. The access worker claims one job per invocation, so the batch is
 * sequential on purpose.
 */

import { z } from 'zod';
import { companionFetch } from '../api/companion.js';
import {
  companyDirectorySlug,
  companyDirectoryUrl,
  lookupByDomain,
  normalizeDomain,
  searchVendors,
  type SearchResult,
} from '../api/client.js';

export const MAX_ACCESS_BATCH = 5;
export const MAX_ACCESS_STATUS = 50;
const AUTOMATED_PLATFORMS = new Set(['safebase', 'vanta']);

function normalizePlatform(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isAutomatedPlatform(value: unknown): boolean {
  return AUTOMATED_PLATFORMS.has(normalizePlatform(value));
}

function looksLikeDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return trimmed.includes('.') && !trimmed.includes('@');
}

function sameHostname(left: string, right: string): boolean {
  try {
    const a = new URL(left.startsWith('http') ? left : `https://${left}`);
    const b = new URL(right.startsWith('http') ? right : `https://${right}`);
    return a.hostname.replace(/^www\./i, '').toLowerCase()
      === b.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return false;
  }
}

export interface ResolvedVendor {
  name: string;
  domain: string;
  website: string;
  trustCenter: string;
  platform: string;
  slug: string;
  directoryUrl: string;
}

export type VendorResolveResult =
  | { status: 'resolved'; vendor: ResolvedVendor }
  | { status: 'not_found'; query: string; message: string }
  | { status: 'ambiguous'; query: string; matches: Array<{ name: string; domain: string | null; platform?: string }>; message: string };

function resolvedFromSearch(entry: SearchResult): ResolvedVendor | null {
  const domain = entry.domain || normalizeDomain(entry.website || '');
  const trustCenter = String(entry.trustCenter || '').trim();
  if (!domain || !trustCenter) return null;
  return {
    name: entry.name,
    domain,
    website: entry.website || `https://${domain}`,
    trustCenter,
    platform: String(entry.platform || ''),
    slug: companyDirectorySlug(entry.name),
    directoryUrl: entry.directoryUrl || '',
  };
}

export async function resolveVendor(query: string): Promise<VendorResolveResult> {
  const raw = String(query || '').trim();
  if (!raw) return { status: 'not_found', query: raw, message: 'Provide a vendor name or domain.' };

  if (looksLikeDomain(raw)) {
    const lookup = await lookupByDomain(raw);
    if (lookup.found && lookup.entry) {
      const domain = normalizeDomain(lookup.website || lookup.entry.website || raw);
      const trustCenter = String(lookup.trustCenter || lookup.entry.trustCenter || '').trim();
      if (domain && trustCenter) {
        return {
          status: 'resolved',
          vendor: {
            name: lookup.name || lookup.entry.name,
            domain,
            website: lookup.website || lookup.entry.website || `https://${domain}`,
            trustCenter,
            platform: String(lookup.entry.platform || ''),
            slug: companyDirectorySlug(lookup.name || lookup.entry.name),
            directoryUrl: companyDirectoryUrl(lookup.name || lookup.entry.name),
          },
        };
      }
    }
  }

  const results = await searchVendors(raw);
  const asDomain = normalizeDomain(raw);
  const exact = results.filter((entry) => (
    entry.name.toLowerCase() === raw.toLowerCase()
    || (asDomain && entry.domain === asDomain)
  ));
  const pick = exact.length === 1 ? exact[0] : (results.length === 1 ? results[0] : null);
  if (pick) {
    const vendor = resolvedFromSearch(pick);
    if (vendor) return { status: 'resolved', vendor };
  }
  if (results.length > 1) {
    return {
      status: 'ambiguous',
      query: raw,
      matches: results.slice(0, 5).map((entry) => ({
        name: entry.name,
        domain: entry.domain,
        platform: entry.platform,
      })),
      message: `Several directory matches for "${raw}". Pass a domain or a more specific name.`,
    };
  }
  return {
    status: 'not_found',
    query: raw,
    message: `No trustlists directory record for "${raw}". Access requests only work for listed SafeBase or Vanta trust centers.`,
  };
}

function unsupportedPlatformMessage(platform?: string): string {
  const label = platform ? ` (${platform})` : '';
  return `Automated access requests only work for verified SafeBase or Vanta trust centers${label}.`;
}

function profileIncompleteResult(body: Record<string, unknown>): AccessRequestToolResult {
  const missing = Array.isArray(body.missing)
    ? body.missing.filter((value): value is string => typeof value === 'string')
    : [];
  const error = typeof body.error === 'string' ? body.error : 'Requester profile is incomplete.';
  return {
    status: 'profile_incomplete',
    missing,
    message: error,
    nextStep: 'Call trustlists_requester_profile with the missing fields (and termsAccepted: true), then retry trustlists_access_request with confirm: true.',
  };
}

interface ReviewRow {
  id?: string;
  directory_slug?: string | null;
  vendor_domain?: string | null;
  vendor_name?: string | null;
  trust_center_url?: string | null;
  platform?: string | null;
  archived_at?: string | null;
}

function reviewMatches(review: ReviewRow, vendor: ResolvedVendor): boolean {
  const slug = String(review.directory_slug || '').toLowerCase();
  const domain = normalizeDomain(review.vendor_domain || '');
  const trustCenter = String(review.trust_center_url || '');
  return slug === vendor.slug
    || (!!vendor.domain && domain === vendor.domain)
    || (!!vendor.trustCenter && !!trustCenter && sameHostname(trustCenter, vendor.trustCenter));
}

async function listReviews(): Promise<{ reviews: ReviewRow[]; disabled: boolean }> {
  const res = await companionFetch<{ reviews?: ReviewRow[] }>('/api/companion/vendor-reviews', {
    allowStatuses: [404],
  });
  if (res.status === 404) return { reviews: [], disabled: true };
  return { reviews: Array.isArray(res.body.reviews) ? res.body.reviews : [], disabled: false };
}

async function loadReview(reviewId: string): Promise<ReviewRow | null> {
  const res = await companionFetch<{ review?: ReviewRow }>(
    `/api/companion/vendor-reviews/${encodeURIComponent(reviewId)}`,
    { allowStatuses: [404] },
  );
  if (res.status === 404 || !res.body.review) return null;
  return res.body.review;
}

async function ensureReview(vendor: ResolvedVendor): Promise<
  | { ok: true; review: ReviewRow; created: boolean }
  | { ok: false; status: AccessRequestToolResult['status']; message: string }
> {
  const listed = await listReviews();
  if (listed.disabled) {
    return {
      ok: false,
      status: 'unavailable',
      message: 'Vendor reviews are not enabled for this account.',
    };
  }
  const existing = listed.reviews.find((review) => !review.archived_at && reviewMatches(review, vendor));
  if (existing?.id) return { ok: true, review: existing, created: false };

  const created = await companionFetch<{ review?: ReviewRow }>(
    '/api/companion/vendor-reviews',
    {
      method: 'POST',
      body: {
        directorySlug: vendor.slug,
        vendorName: vendor.name,
        vendorDomain: vendor.website || vendor.domain,
        trustCenterUrl: vendor.trustCenter,
      },
      allowStatuses: [409, 404, 400],
    },
  );
  if (created.status === 404) {
    return { ok: false, status: 'unavailable', message: 'Vendor reviews are not enabled for this account.' };
  }
  if (created.status === 409) {
    const again = await listReviews();
    const found = again.reviews.find((review) => !review.archived_at && reviewMatches(review, vendor));
    if (found?.id) return { ok: true, review: found, created: false };
    return {
      ok: false,
      status: 'blocked',
      message: String(created.body.error || 'That trust center is already one of your vendors.'),
    };
  }
  if (created.status >= 400 || !created.body.review?.id) {
    return {
      ok: false,
      status: 'failed',
      message: String(created.body.error || 'Could not create a vendor review for this listing.'),
    };
  }
  return { ok: true, review: created.body.review, created: true };
}

function summarizeJob(job: Record<string, unknown>): AccessJobSummary {
  const status = String(job.status || 'unknown');
  const summary: AccessJobSummary = {
    jobId: String(job.id || ''),
    status,
    vendorName: job.vendor_name ? String(job.vendor_name) : null,
    vendorDomain: job.vendor_domain ? String(job.vendor_domain) : null,
    platform: job.platform ? String(job.platform) : null,
    reviewId: job.review_id ? String(job.review_id) : null,
    errorMessage: job.error_message ? String(job.error_message) : null,
    createdAt: job.created_at ? String(job.created_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
  if (status === 'needs_buyer') {
    summary.browserbase_session_url = job.browserbase_session_url
      ? String(job.browserbase_session_url)
      : null;
    summary.takeover_expires_at = job.takeover_expires_at
      ? String(job.takeover_expires_at)
      : null;
    summary.takeover_live = Boolean(job.takeover_live);
  }
  return summary;
}

async function enqueueJob(reviewId: string, input: { useCase?: string; sponsorEmail?: string }): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  return companionFetch('/api/companion/request-access', {
    method: 'POST',
    body: {
      reviewId,
      useCase: input.useCase || undefined,
      sponsorEmail: input.sponsorEmail || undefined,
      source: 'mcp',
    },
    allowStatuses: [409, 404, 400],
  });
}

function mapEnqueueResponse(
  res: { status: number; body: Record<string, unknown> },
  vendor?: ResolvedVendor,
): AccessRequestToolResult {
  if (res.status === 404) {
    return { status: 'unavailable', message: 'Vendor reviews are not enabled for this account.' };
  }
  if (res.status === 409 && res.body.code === 'requester_profile_incomplete') {
    return profileIncompleteResult(res.body);
  }
  if (res.status === 409) {
    const error = String(res.body.error || 'Request was blocked.');
    if (/verified automation platform/i.test(error)) {
      return {
        status: 'unsupported_platform',
        vendor,
        message: unsupportedPlatformMessage(vendor?.platform),
      };
    }
    if (/evidence inbox/i.test(error)) {
      return { status: 'inbox_unavailable', vendor, message: error };
    }
    return { status: 'blocked', vendor, message: error };
  }
  if (res.status >= 400 || !res.body.job) {
    return {
      status: 'failed',
      vendor,
      message: String(res.body.error || 'Could not queue the access request.'),
    };
  }
  const job = summarizeJob(res.body.job as Record<string, unknown>);
  const deduped = Boolean(res.body.deduped);
  return {
    status: deduped ? 'deduped' : 'queued',
    vendor,
    job,
    jobId: job.jobId,
    message: deduped
      ? String(res.body.message || 'A request for this vendor is already in progress.')
      : `Queued an access request for ${vendor?.name || job.vendorName || 'this vendor'}.`,
    nextStep: 'Poll trustlists_access_status with this jobId. If status is needs_buyer, open browserbase_session_url, then call trustlists_access_continue.',
  };
}

// ── requester profile ─────────────────────────────────────────────────────

export const requesterProfileInputSchema = z.object({
  fullName: z.string().min(1).optional()
    .describe('First and last name as it should appear on vendor forms.'),
  company: z.string().min(1).optional()
    .describe('Company name. Letters, numbers, and common punctuation only.'),
  role: z.string().min(1).optional()
    .describe('Job title, e.g. Security Analyst.'),
  phone: z.string().optional()
    .describe('Optional phone. Digits with an optional leading +.'),
  termsAccepted: z.boolean().optional()
    .describe('Permission to accept vendor terms on the user\'s behalf.'),
});

export type RequesterProfileInput = z.infer<typeof requesterProfileInputSchema>;

export interface RequesterProfileToolResult {
  complete: boolean;
  missing: string[];
  profile?: Record<string, unknown>;
  fields?: unknown;
  message: string;
  nextStep?: string;
}

export async function runRequesterProfile(input: RequesterProfileInput): Promise<RequesterProfileToolResult> {
  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.company !== undefined) patch.company = input.company;
  if (input.role !== undefined) patch.role = input.role;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.termsAccepted !== undefined) patch.termsAccepted = input.termsAccepted;

  const res = Object.keys(patch).length
    ? await companionFetch('/api/companion/requester-profile', { method: 'PATCH', body: patch })
    : await companionFetch('/api/companion/requester-profile');

  const missing = Array.isArray(res.body.missing)
    ? res.body.missing.filter((value): value is string => typeof value === 'string')
    : [];
  const complete = Boolean(res.body.complete) && missing.length === 0;
  return {
    complete,
    missing,
    profile: (res.body.profile as Record<string, unknown>) || undefined,
    fields: res.body.fields,
    message: complete
      ? 'Requester profile is complete. Access requests can be submitted.'
      : `Requester profile is incomplete. Still missing: ${missing.join(', ') || 'required fields'}.`,
    nextStep: complete
      ? undefined
      : 'Ask the user for the missing fields and call trustlists_requester_profile again with those values.',
  };
}

export const requesterProfileToolDefinition = {
  name: 'trustlists_requester_profile',
  description:
    'Get or update the requester profile used on vendor trust-center access forms (requires trustlists_login). Pass fullName, company, role, phone, and termsAccepted to save. Returns complete/missing so a blocked access request can be fixed in chat.',
  inputSchema: {
    type: 'object',
    properties: {
      fullName: { type: 'string', description: 'First and last name on vendor forms.' },
      company: { type: 'string', description: 'Company name.' },
      role: { type: 'string', description: 'Job title.' },
      phone: { type: 'string', description: 'Optional phone number.' },
      termsAccepted: { type: 'boolean', description: 'Permission to accept vendor terms on the user\'s behalf.' },
    },
  },
} as const;

// ── single request ────────────────────────────────────────────────────────

export const accessRequestInputSchema = z.object({
  vendor: z.string().min(1).optional()
    .describe('Vendor name or website domain from the trustlists directory.'),
  reviewId: z.string().min(1).optional()
    .describe('Existing vendor review id. Skips directory lookup when set.'),
  useCase: z.string().max(500).optional()
    .describe('Why access is needed. Shown on the vendor form when the portal asks.'),
  sponsorEmail: z.string().email().optional()
    .describe('Vendor-side contact email, if the user has one.'),
  confirm: z.boolean().optional()
    .describe('Must be true to actually enqueue the request. Omit to preview.'),
}).refine((value) => Boolean(value.vendor || value.reviewId), {
  message: 'Provide vendor or reviewId',
});

export type AccessRequestInput = z.infer<typeof accessRequestInputSchema>;

export interface AccessJobSummary {
  jobId: string;
  status: string;
  vendorName: string | null;
  vendorDomain: string | null;
  platform: string | null;
  reviewId: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
  browserbase_session_url?: string | null;
  takeover_expires_at?: string | null;
  takeover_live?: boolean;
}

export interface AccessRequestToolResult {
  status:
    | 'needs_confirmation'
    | 'queued'
    | 'deduped'
    | 'profile_incomplete'
    | 'unsupported_platform'
    | 'inbox_unavailable'
    | 'unavailable'
    | 'not_found'
    | 'ambiguous'
    | 'blocked'
    | 'failed';
  vendor?: ResolvedVendor;
  matches?: Array<{ name: string; domain: string | null; platform?: string }>;
  missing?: string[];
  job?: AccessJobSummary;
  jobId?: string;
  message: string;
  nextStep?: string;
}

async function previewOrResolve(input: AccessRequestInput): Promise<
  | { ok: true; vendor?: ResolvedVendor; review?: ReviewRow }
  | { ok: false; result: AccessRequestToolResult }
> {
  if (input.reviewId) {
    const review = await loadReview(input.reviewId);
    if (!review) {
      return { ok: false, result: { status: 'not_found', message: `Vendor review ${input.reviewId} was not found.` } };
    }
    const platform = normalizePlatform(review.platform);
    const vendor: ResolvedVendor = {
      name: String(review.vendor_name || review.vendor_domain || 'Vendor'),
      domain: normalizeDomain(review.vendor_domain || '') || String(review.vendor_domain || ''),
      website: String(review.vendor_domain || ''),
      trustCenter: String(review.trust_center_url || ''),
      platform: String(review.platform || ''),
      slug: String(review.directory_slug || ''),
      directoryUrl: review.directory_slug
        ? companyDirectoryUrl(review.vendor_name || review.directory_slug)
        : '',
    };
    if (!isAutomatedPlatform(platform)) {
      return {
        ok: false,
        result: {
          status: 'unsupported_platform',
          vendor,
          message: unsupportedPlatformMessage(vendor.platform),
        },
      };
    }
    return { ok: true, vendor, review };
  }

  const resolved = await resolveVendor(String(input.vendor || ''));
  if (resolved.status === 'not_found') {
    return { ok: false, result: { status: 'not_found', message: resolved.message } };
  }
  if (resolved.status === 'ambiguous') {
    return {
      ok: false,
      result: {
        status: 'ambiguous',
        matches: resolved.matches,
        message: resolved.message,
        nextStep: 'Call trustlists_access_request again with a specific domain.',
      },
    };
  }
  if (!isAutomatedPlatform(resolved.vendor.platform)) {
    return {
      ok: false,
      result: {
        status: 'unsupported_platform',
        vendor: resolved.vendor,
        message: unsupportedPlatformMessage(resolved.vendor.platform),
      },
    };
  }
  return { ok: true, vendor: resolved.vendor };
}

export async function runAccessRequest(input: AccessRequestInput): Promise<AccessRequestToolResult> {
  const preview = await previewOrResolve(input);
  if (!preview.ok) return preview.result;

  if (input.confirm !== true) {
    return {
      status: 'needs_confirmation',
      vendor: preview.vendor,
      message: `Ready to request access to ${preview.vendor?.name || 'this vendor'}. Nothing has been submitted yet.`,
      nextStep: 'Confirm with the user, then call trustlists_access_request again with the same vendor (or reviewId) and confirm: true.',
    };
  }

  let review = preview.review;
  if (!review && preview.vendor) {
    const ensured = await ensureReview(preview.vendor);
    if (!ensured.ok) {
      return { status: ensured.status, vendor: preview.vendor, message: ensured.message };
    }
    review = ensured.review;
  }
  if (!review?.id) {
    return { status: 'failed', vendor: preview.vendor, message: 'Could not resolve a vendor review to enqueue.' };
  }

  const enqueued = await enqueueJob(review.id, {
    useCase: input.useCase,
    sponsorEmail: input.sponsorEmail,
  });
  return mapEnqueueResponse(enqueued, preview.vendor);
}

export const accessRequestToolDefinition = {
  name: 'trustlists_access_request',
  description:
    'Request access to a vendor trust center (SafeBase or Vanta only; requires trustlists_login). Resolves the vendor in the public directory, creates a vendor review if needed, then queues the request. First call previews. Call again with confirm: true to submit. If the requester profile is incomplete, update it with trustlists_requester_profile first.',
  inputSchema: {
    type: 'object',
    properties: {
      vendor: { type: 'string', description: 'Vendor name or domain.' },
      reviewId: { type: 'string', description: 'Existing vendor review id.' },
      useCase: { type: 'string', description: 'Why access is needed (max 500).' },
      sponsorEmail: { type: 'string', description: 'Vendor-side contact email.' },
      confirm: { type: 'boolean', description: 'Must be true to enqueue. Omit to preview.' },
    },
  },
} as const;

// ── status ────────────────────────────────────────────────────────────────

export const accessStatusInputSchema = z.object({
  jobIds: z.array(z.string().min(1)).max(MAX_ACCESS_STATUS).optional()
    .describe('Job ids to check. Omit to list recent access requests.'),
});

export type AccessStatusInput = z.infer<typeof accessStatusInputSchema>;

export interface AccessStatusToolResult {
  jobs: AccessJobSummary[];
  counts: Record<string, number>;
  allDone: boolean;
  message: string;
  nextStep?: string;
}

export async function runAccessStatus(input: AccessStatusInput): Promise<AccessStatusToolResult> {
  let jobs: AccessJobSummary[];
  if (input.jobIds?.length) {
    jobs = await Promise.all(input.jobIds.map(async (jobId) => {
      const res = await companionFetch<{ job?: Record<string, unknown> }>(
        `/api/companion/request-access/${encodeURIComponent(jobId)}`,
        { allowStatuses: [404] },
      );
      if (res.status === 404 || !res.body.job) {
        return {
          jobId,
          status: 'not_found',
          vendorName: null,
          vendorDomain: null,
          platform: null,
          reviewId: null,
          errorMessage: 'Access request not found',
          createdAt: null,
          completedAt: null,
        };
      }
      return summarizeJob(res.body.job);
    }));
  } else {
    const res = await companionFetch<{ jobs?: Record<string, unknown>[] }>('/api/companion/request-access');
    jobs = (res.body.jobs || []).slice(0, MAX_ACCESS_STATUS).map(summarizeJob);
  }

  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const needsBuyer = jobs.filter((job) => job.status === 'needs_buyer');

  return {
    jobs,
    counts,
    allDone: pending.length === 0 && needsBuyer.length === 0,
    message: needsBuyer.length
      ? `${needsBuyer.length} request${needsBuyer.length === 1 ? '' : 's'} waiting on the buyer in a live browser.`
      : pending.length
        ? `${pending.length} request${pending.length === 1 ? ' is' : 's are'} still processing.`
        : `All ${jobs.length} request${jobs.length === 1 ? '' : 's'} finished or are waiting on the vendor.`,
    nextStep: needsBuyer.length
      ? 'Tell the user to open browserbase_session_url for each needs_buyer job, then call trustlists_access_continue with that jobId.'
      : pending.length
        ? 'Wait about 30 seconds and call trustlists_access_status again with the same jobIds.'
        : undefined,
  };
}

export const accessStatusToolDefinition = {
  name: 'trustlists_access_status',
  description:
    'Check trust-center access request progress. Pass jobIds from trustlists_access_request, or omit to list recent jobs. When a job is needs_buyer, the result includes the live browser URL and takeover_expires_at. Requires trustlists_login.',
  inputSchema: {
    type: 'object',
    properties: {
      jobIds: { type: 'array', items: { type: 'string' }, description: `Job ids to check (max ${MAX_ACCESS_STATUS}).` },
    },
  },
} as const;

// ── continue ──────────────────────────────────────────────────────────────

export const accessContinueInputSchema = z.object({
  jobId: z.string().min(1).describe('Access job that is waiting on the buyer.'),
});

export type AccessContinueInput = z.infer<typeof accessContinueInputSchema>;

export interface AccessContinueToolResult {
  status: 'resumed' | 'blocked' | 'not_found' | 'failed';
  job?: AccessJobSummary;
  message: string;
  nextStep?: string;
}

export async function runAccessContinue(input: AccessContinueInput): Promise<AccessContinueToolResult> {
  const res = await companionFetch<{ job?: Record<string, unknown> }>(
    `/api/companion/request-access/${encodeURIComponent(input.jobId)}/resume`,
    { method: 'POST', allowStatuses: [409, 404] },
  );
  if (res.status === 404) {
    return { status: 'not_found', message: 'Access request not found.' };
  }
  if (res.status === 409) {
    const job = res.body.job ? summarizeJob(res.body.job) : undefined;
    return {
      status: 'blocked',
      job,
      message: String(res.body.error || 'This access request is no longer waiting on you.'),
    };
  }
  if (!res.body.job) {
    return { status: 'failed', message: String(res.body.error || 'Could not resume the access request.') };
  }
  const job = summarizeJob(res.body.job);
  return {
    status: 'resumed',
    job,
    message: `Handed the ${job.vendorName || 'vendor'} request back to the runner.`,
    nextStep: `Poll trustlists_access_status({ jobIds: ["${job.jobId}"] }) until the job is waiting_on_vendor or failed.`,
  };
}

export const accessContinueToolDefinition = {
  name: 'trustlists_access_continue',
  description:
    'After the user finishes in the live browser (needs_buyer), hand the access request back to the runner. Requires trustlists_login.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: 'Job id that is in needs_buyer.' },
    },
    required: ['jobId'],
  },
} as const;

// ── batch ─────────────────────────────────────────────────────────────────

export const accessRequestBatchInputSchema = z.object({
  vendors: z.array(z.string().min(1)).min(1).max(MAX_ACCESS_BATCH)
    .describe(`Vendor names or domains (max ${MAX_ACCESS_BATCH}).`),
  useCase: z.string().max(500).optional()
    .describe('Shared reason applied to every request in the batch.'),
  confirm: z.boolean().optional()
    .describe('Must be true to enqueue. One confirmation covers the whole batch.'),
});

export type AccessRequestBatchInput = z.infer<typeof accessRequestBatchInputSchema>;

export interface AccessBatchItem {
  vendor: string;
  status: 'preview' | 'queued' | 'deduped' | 'blocked';
  reason?: 'profile' | 'platform' | 'inbox' | 'not_found' | 'ambiguous' | 'unavailable' | 'error';
  name?: string;
  domain?: string;
  jobId?: string;
  message: string;
}

export interface AccessRequestBatchToolResult {
  status: 'needs_confirmation' | 'queued' | 'partial' | 'blocked';
  results: AccessBatchItem[];
  counts: { queued: number; deduped: number; blocked: number; preview: number };
  missing?: string[];
  message: string;
  nextStep?: string;
}

function emptyCounts(): AccessRequestBatchToolResult['counts'] {
  return { queued: 0, deduped: 0, blocked: 0, preview: 0 };
}

function tally(results: AccessBatchItem[]): AccessRequestBatchToolResult['counts'] {
  const counts = emptyCounts();
  for (const item of results) counts[item.status] += 1;
  return counts;
}

function reasonFromRequest(result: AccessRequestToolResult): AccessBatchItem['reason'] {
  if (result.status === 'profile_incomplete') return 'profile';
  if (result.status === 'unsupported_platform') return 'platform';
  if (result.status === 'inbox_unavailable') return 'inbox';
  if (result.status === 'not_found') return 'not_found';
  if (result.status === 'ambiguous') return 'ambiguous';
  if (result.status === 'unavailable') return 'unavailable';
  return 'error';
}

export async function runAccessRequestBatch(input: AccessRequestBatchInput): Promise<AccessRequestBatchToolResult> {
  if (input.vendors.length > MAX_ACCESS_BATCH) {
    return {
      status: 'blocked',
      results: [],
      counts: emptyCounts(),
      message: `At most ${MAX_ACCESS_BATCH} vendors per batch. Split the list and confirm each group.`,
    };
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.vendors) {
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(raw.trim());
  }

  const previews: Array<{ vendor: string; result: AccessRequestToolResult }> = [];
  for (const vendor of unique) {
    previews.push({
      vendor,
      result: await runAccessRequest({ vendor, useCase: input.useCase, confirm: false }),
    });
  }

  if (input.confirm !== true) {
    const results: AccessBatchItem[] = previews.map(({ vendor, result }) => {
      if (result.status === 'needs_confirmation') {
        return {
          vendor,
          status: 'preview',
          name: result.vendor?.name,
          domain: result.vendor?.domain,
          message: result.message,
        };
      }
      return {
        vendor,
        status: 'blocked',
        reason: reasonFromRequest(result),
        name: result.vendor?.name,
        domain: result.vendor?.domain,
        message: result.message,
      };
    });
    const counts = tally(results);
    return {
      status: 'needs_confirmation',
      results,
      counts,
      message: `${counts.preview} vendor${counts.preview === 1 ? '' : 's'} ready, ${counts.blocked} blocked. Nothing has been submitted yet.`,
      nextStep: `Confirm with the user, then call trustlists_access_request_batch with the same vendors and confirm: true. Do not send more than ${MAX_ACCESS_BATCH} vendors in one call.`,
    };
  }

  const results: AccessBatchItem[] = [];
  let profileMissing: string[] | undefined;
  for (const { vendor, result: preview } of previews) {
    if (preview.status !== 'needs_confirmation') {
      results.push({
        vendor,
        status: 'blocked',
        reason: reasonFromRequest(preview),
        name: preview.vendor?.name,
        domain: preview.vendor?.domain,
        message: preview.message,
      });
      continue;
    }
    if (profileMissing) {
      results.push({
        vendor,
        status: 'blocked',
        reason: 'profile',
        name: preview.vendor?.name,
        domain: preview.vendor?.domain,
        message: 'Requester profile is incomplete.',
      });
      continue;
    }

    const enqueued = await runAccessRequest({
      vendor,
      useCase: input.useCase,
      confirm: true,
    });
    if (enqueued.status === 'profile_incomplete') {
      profileMissing = enqueued.missing;
      results.push({
        vendor,
        status: 'blocked',
        reason: 'profile',
        name: enqueued.vendor?.name,
        domain: enqueued.vendor?.domain,
        message: enqueued.message,
      });
      continue;
    }
    if (enqueued.status === 'queued' || enqueued.status === 'deduped') {
      results.push({
        vendor,
        status: enqueued.status,
        name: enqueued.vendor?.name,
        domain: enqueued.vendor?.domain,
        jobId: enqueued.jobId,
        message: enqueued.message,
      });
      continue;
    }
    results.push({
      vendor,
      status: 'blocked',
      reason: reasonFromRequest(enqueued),
      name: enqueued.vendor?.name,
      domain: enqueued.vendor?.domain,
      message: enqueued.message,
    });
  }

  const counts = tally(results);
  const submitted = counts.queued + counts.deduped;
  const status: AccessRequestBatchToolResult['status'] = submitted === 0
    ? 'blocked'
    : counts.blocked
      ? 'partial'
      : 'queued';
  const jobIds = results.map((item) => item.jobId).filter((id): id is string => Boolean(id));

  return {
    status,
    results,
    counts,
    ...(profileMissing ? { missing: profileMissing } : {}),
    message: submitted
      ? `Queued ${counts.queued}, reused ${counts.deduped} already in progress, blocked ${counts.blocked}.`
      : 'No access requests could be queued.',
    nextStep: jobIds.length
      ? `Poll trustlists_access_status({ jobIds: ${JSON.stringify(jobIds)} }). If a job is needs_buyer, open the live URL, then trustlists_access_continue.`
      : profileMissing
        ? 'Call trustlists_requester_profile with the missing fields, then retry the batch with confirm: true.'
        : undefined,
  };
}

export const accessRequestBatchToolDefinition = {
  name: 'trustlists_access_request_batch',
  description:
    `Request access to up to ${MAX_ACCESS_BATCH} vendor trust centers in one confirmed batch (requires trustlists_login). One confirm covers the list. Requests are enqueued one at a time. Do not invent a larger parallel farm. First call previews; call again with confirm: true to submit.`,
  inputSchema: {
    type: 'object',
    properties: {
      vendors: {
        type: 'array',
        items: { type: 'string' },
        description: `Vendor names or domains (max ${MAX_ACCESS_BATCH}).`,
      },
      useCase: { type: 'string', description: 'Shared reason for every request in the batch.' },
      confirm: { type: 'boolean', description: 'Must be true to enqueue the batch.' },
    },
    required: ['vendors'],
  },
} as const;
