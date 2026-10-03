/**
 * SOC 2 analyzer tools: trustlists_soc2_analyze, trustlists_soc2_status,
 * trustlists_soc2_report.
 *
 * Analyze is a two-step call on purpose. The first call uploads the PDF(s)
 * and returns a cost preview; nothing is charged. The caller must echo the
 * total back as `confirmCredits` to actually queue the analysis. Uploads are
 * remembered for a short while so the confirm call does not re-upload.
 *
 * Reads local files, so these tools ship only on the stdio server.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CompanionApiError, appUrl, companionFetch, putBytes } from '../api/companion.js';

const MAX_FILES_PER_CALL = 20;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const UPLOAD_CACHE_TTL_MS = 30 * 60 * 1000;

export const soc2AnalyzeInputSchema = z.object({
  filePath: z.string().min(1).optional().describe('Absolute or relative path to one SOC 2 report PDF.'),
  filePaths: z.array(z.string().min(1)).min(1).max(MAX_FILES_PER_CALL).optional()
    .describe(`Paths to several SOC 2 PDFs to analyze as a batch (max ${MAX_FILES_PER_CALL}).`),
  confirmCredits: z.number().int().min(0).optional()
    .describe('Echo the creditsRequired total from the preview to actually start the analysis.'),
}).refine((value) => Boolean(value.filePath || value.filePaths?.length), {
  message: 'Provide filePath or filePaths',
});

export type Soc2AnalyzeInput = z.infer<typeof soc2AnalyzeInputSchema>;

interface UploadPreview {
  storagePath: string;
  fileName: string;
  pageCount: number;
  tier: string;
  tierLabel: string;
  creditsRequired: number;
  canAfford: boolean;
}

interface UploadCacheEntry extends UploadPreview {
  key: string;
  cachedAt: number;
}

const uploadCache = new Map<string, UploadCacheEntry>();

export function resetSoc2UploadCacheForTests(): void {
  uploadCache.clear();
}

async function cacheKeyFor(absPath: string): Promise<{ key: string; size: number }> {
  const stat = await fs.stat(absPath);
  if (!stat.isFile()) throw new Error(`${absPath} is not a file`);
  return { key: `${absPath}:${stat.size}:${Math.floor(stat.mtimeMs)}`, size: stat.size };
}

function normalizePaths(input: Soc2AnalyzeInput): string[] {
  const list = [...(input.filePaths || []), ...(input.filePath ? [input.filePath] : [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const abs = path.resolve(raw);
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  if (out.length > MAX_FILES_PER_CALL) {
    throw new Error(`At most ${MAX_FILES_PER_CALL} files per call`);
  }
  return out;
}

async function uploadAndPreview(absPath: string): Promise<UploadPreview> {
  const { key, size } = await cacheKeyFor(absPath);
  const cached = uploadCache.get(key);
  if (cached && Date.now() - cached.cachedAt < UPLOAD_CACHE_TTL_MS) return cached;

  if (path.extname(absPath).toLowerCase() !== '.pdf') {
    throw new Error(`${path.basename(absPath)}: only PDF files are supported`);
  }
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    throw new Error(`${path.basename(absPath)}: file must be between 1 byte and 50 MB`);
  }

  const fileName = path.basename(absPath);
  const init = await companionFetch<{ signedUrl?: string; storagePath?: string }>('/api/companion/soc2-upload-init', {
    method: 'POST',
    body: { fileName, mimeType: 'application/pdf', fileSizeBytes: size },
  });
  if (!init.body.signedUrl || !init.body.storagePath) {
    throw new Error(`${fileName}: upload could not be started`);
  }

  const bytes = await fs.readFile(absPath);
  await putBytes(init.body.signedUrl, bytes, 'application/pdf');

  const check = await companionFetch<{
    pageCount?: number; tier?: string; tierLabel?: string; creditsRequired?: number; canAfford?: boolean;
  }>('/api/companion/soc2-check', {
    method: 'POST',
    body: { storagePath: init.body.storagePath },
  });

  const preview: UploadCacheEntry = {
    key,
    cachedAt: Date.now(),
    storagePath: init.body.storagePath,
    fileName,
    pageCount: Number(check.body.pageCount || 0),
    tier: String(check.body.tier || ''),
    tierLabel: String(check.body.tierLabel || check.body.tier || ''),
    creditsRequired: Number(check.body.creditsRequired || 0),
    canAfford: Boolean(check.body.canAfford),
  };
  uploadCache.set(key, preview);
  return preview;
}

export interface Soc2AnalyzeFileResult {
  filePath: string;
  fileName: string;
  pageCount?: number;
  tier?: string;
  creditsRequired?: number;
  jobId?: string;
  status?: string;
  error?: string;
}

export interface Soc2AnalyzeToolResult {
  status: 'needs_confirmation' | 'queued' | 'partial' | 'credits_mismatch' | 'insufficient_credits' | 'failed';
  files: Soc2AnalyzeFileResult[];
  totalCreditsRequired: number;
  usage?: unknown;
  jobIds: string[];
  message: string;
  nextStep?: string;
  buyCreditsUrl?: string;
}

async function currentUsage(): Promise<unknown> {
  try {
    const me = await companionFetch('/api/companion/me');
    return me.body.usage;
  } catch {
    return undefined;
  }
}

export async function runSoc2Analyze(input: Soc2AnalyzeInput): Promise<Soc2AnalyzeToolResult> {
  const paths = normalizePaths(input);

  const previews: Array<{ absPath: string; preview?: UploadPreview; error?: string }> = [];
  for (const absPath of paths) {
    try {
      previews.push({ absPath, preview: await uploadAndPreview(absPath) });
    } catch (error) {
      previews.push({ absPath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const ready = previews.filter((p) => p.preview) as Array<{ absPath: string; preview: UploadPreview }>;
  const total = ready.reduce((sum, p) => sum + p.preview.creditsRequired, 0);
  const files: Soc2AnalyzeFileResult[] = previews.map((p) => ({
    filePath: p.absPath,
    fileName: path.basename(p.absPath),
    ...(p.preview ? {
      pageCount: p.preview.pageCount,
      tier: p.preview.tier,
      creditsRequired: p.preview.creditsRequired,
    } : {}),
    ...(p.error ? { error: p.error } : {}),
  }));

  if (!ready.length) {
    return {
      status: 'failed',
      files,
      totalCreditsRequired: 0,
      jobIds: [],
      message: 'No files could be prepared for analysis.',
    };
  }

  const usage = await currentUsage();

  if (input.confirmCredits === undefined) {
    return {
      status: 'needs_confirmation',
      files,
      totalCreditsRequired: total,
      usage,
      jobIds: [],
      message: `${ready.length} file${ready.length === 1 ? '' : 's'} ready. Analysis will use ${total} credit${total === 1 ? '' : 's'}. Nothing has been charged yet.`,
      nextStep: `Confirm the cost with the user, then call trustlists_soc2_analyze again with the same paths and confirmCredits: ${total}.`,
    };
  }

  if (input.confirmCredits !== total) {
    return {
      status: 'credits_mismatch',
      files,
      totalCreditsRequired: total,
      usage,
      jobIds: [],
      message: `confirmCredits was ${input.confirmCredits} but the current cost is ${total}. Re-check with the user and call again with confirmCredits: ${total}.`,
    };
  }

  const cannotAfford = ready.some((p) => !p.preview.canAfford);
  if (cannotAfford && ready.length === 1) {
    return {
      status: 'insufficient_credits',
      files,
      totalCreditsRequired: total,
      usage,
      jobIds: [],
      buyCreditsUrl: appUrl('/home?view=credits'),
      message: `This analysis needs ${total} credits and the account cannot cover it.`,
    };
  }

  const jobIds: string[] = [];
  for (const entry of ready) {
    const file = files.find((f) => f.filePath === entry.absPath)!;
    try {
      const created = await companionFetch<{ job?: { id?: string; status?: string } }>('/api/companion/soc2-jobs', {
        method: 'POST',
        body: {
          storagePath: entry.preview.storagePath,
          fileName: entry.preview.fileName,
          confirmedCredits: entry.preview.creditsRequired,
        },
        allowStatuses: [402, 409],
      });
      if (created.status === 402) {
        file.error = 'Insufficient credits';
        continue;
      }
      if (created.status === 409) {
        // Upload already attached to a job (a retried confirm). Forget the
        // cached upload so the next call re-uploads cleanly.
        for (const [key, value] of uploadCache) {
          if (value.storagePath === entry.preview.storagePath) uploadCache.delete(key);
        }
        file.error = String(created.body.error || 'This upload was already analyzed');
        continue;
      }
      const jobId = String(created.body.job?.id || '');
      file.jobId = jobId;
      file.status = String(created.body.job?.status || 'queued');
      if (jobId) jobIds.push(jobId);
      for (const [key, value] of uploadCache) {
        if (value.storagePath === entry.preview.storagePath) uploadCache.delete(key);
      }
    } catch (error) {
      file.error = error instanceof CompanionApiError ? error.message : (error instanceof Error ? error.message : String(error));
    }
  }

  const failed = files.filter((f) => f.error).length;
  const status: Soc2AnalyzeToolResult['status'] = jobIds.length === 0
    ? 'failed'
    : failed ? 'partial' : 'queued';

  return {
    status,
    files,
    totalCreditsRequired: total,
    usage: await currentUsage(),
    jobIds,
    message: jobIds.length
      ? `Queued ${jobIds.length} analysis job${jobIds.length === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}. Analyses typically take a few minutes.`
      : 'No analysis jobs could be queued.',
    nextStep: jobIds.length
      ? `Poll trustlists_soc2_status({ jobIds: ${JSON.stringify(jobIds)} }) until each job is succeeded or failed, then call trustlists_soc2_report.`
      : undefined,
  };
}

export const soc2AnalyzeToolDefinition = {
  name: 'trustlists_soc2_analyze',
  description:
    'Analyze one or more local SOC 2 report PDFs with trustlists (requires trustlists_login). First call uploads the files and returns a credit cost preview without charging. Call again with confirmCredits set to the returned total to queue the analysis. Results also appear in the trustlists app.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to a SOC 2 report PDF.' },
      filePaths: { type: 'array', items: { type: 'string' }, description: `Paths to several PDFs (max ${MAX_FILES_PER_CALL}).` },
      confirmCredits: { type: 'number', description: 'Echo totalCreditsRequired from the preview to start the analysis.' },
    },
  },
} as const;

// ── status ────────────────────────────────────────────────────────────────

export const soc2StatusInputSchema = z.object({
  jobIds: z.array(z.string().min(1)).max(50).optional()
    .describe('Job ids to check. Omit to list recent analysis jobs.'),
});

export type Soc2StatusInput = z.infer<typeof soc2StatusInputSchema>;

export interface Soc2JobSummary {
  jobId: string;
  status: string;
  fileName: string | null;
  pageCount: number | null;
  tier: string | null;
  creditsRequired: number | null;
  reportId: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
  reportUrl?: string;
}

export interface Soc2StatusToolResult {
  jobs: Soc2JobSummary[];
  counts: Record<string, number>;
  allDone: boolean;
  message: string;
  nextStep?: string;
}

function summarizeJob(job: Record<string, unknown>): Soc2JobSummary {
  const reportId = job.report_id ? String(job.report_id) : null;
  return {
    jobId: String(job.id || ''),
    status: String(job.status || 'unknown'),
    fileName: job.file_name ? String(job.file_name) : null,
    pageCount: typeof job.page_count === 'number' ? job.page_count : null,
    tier: job.tier ? String(job.tier) : null,
    creditsRequired: typeof job.credits_required === 'number' ? job.credits_required : null,
    reportId,
    errorMessage: job.error_message ? String(job.error_message) : null,
    createdAt: job.created_at ? String(job.created_at) : null,
    completedAt: job.completed_at ? String(job.completed_at) : null,
    ...(reportId ? { reportUrl: appUrl('/home?view=reports') } : {}),
  };
}

export async function runSoc2Status(input: Soc2StatusInput): Promise<Soc2StatusToolResult> {
  let jobs: Soc2JobSummary[];
  if (input.jobIds?.length) {
    jobs = await Promise.all(input.jobIds.map(async (jobId) => {
      const res = await companionFetch<{ job?: Record<string, unknown> }>(
        `/api/companion/soc2-jobs/${encodeURIComponent(jobId)}`,
        { allowStatuses: [404] },
      );
      if (res.status === 404 || !res.body.job) {
        return { ...summarizeJob({ id: jobId }), status: 'not_found', errorMessage: 'Job not found' };
      }
      return summarizeJob(res.body.job);
    }));
  } else {
    const res = await companionFetch<{ jobs?: Record<string, unknown>[] }>('/api/companion/soc2-jobs');
    jobs = (res.body.jobs || []).slice(0, 50).map(summarizeJob);
  }

  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const succeeded = jobs.filter((job) => job.status === 'succeeded' && job.reportId);

  return {
    jobs,
    counts,
    allDone: pending.length === 0,
    message: pending.length
      ? `${pending.length} job${pending.length === 1 ? ' is' : 's are'} still processing.`
      : `All ${jobs.length} job${jobs.length === 1 ? '' : 's'} finished.`,
    nextStep: pending.length
      ? 'Wait about 30 seconds and call trustlists_soc2_status again with the same jobIds.'
      : succeeded.length
        ? `Call trustlists_soc2_report with reportId ${succeeded.map((j) => j.reportId).join(', ')} to read the findings.`
        : undefined,
  };
}

export const soc2StatusToolDefinition = {
  name: 'trustlists_soc2_status',
  description: 'Check SOC 2 analysis job progress. Pass one or more jobIds from trustlists_soc2_analyze, or omit to list recent jobs. Requires trustlists_login.',
  inputSchema: {
    type: 'object',
    properties: {
      jobIds: { type: 'array', items: { type: 'string' }, description: 'Job ids to check (max 50).' },
    },
  },
} as const;

// ── report ────────────────────────────────────────────────────────────────

export const soc2ReportInputSchema = z.object({
  reportId: z.string().min(1).optional().describe('Analysis id (report_id from a succeeded job).'),
  jobId: z.string().min(1).optional().describe('Alternatively, a job id; its report is looked up.'),
  format: z.enum(['summary', 'markdown', 'json']).optional().default('summary'),
}).refine((value) => Boolean(value.reportId || value.jobId), { message: 'Provide reportId or jobId' });

export type Soc2ReportInput = z.infer<typeof soc2ReportInputSchema>;

export interface Soc2ReportToolResult {
  reportId: string;
  format: 'summary' | 'markdown' | 'json';
  summary?: unknown;
  markdown?: string;
  report?: unknown;
  reportUrl: string;
  message: string;
}

export async function runSoc2Report(input: Soc2ReportInput): Promise<Soc2ReportToolResult> {
  let reportId = input.reportId || '';
  if (!reportId && input.jobId) {
    const res = await companionFetch<{ job?: Record<string, unknown> }>(
      `/api/companion/soc2-jobs/${encodeURIComponent(input.jobId)}`,
      { allowStatuses: [404] },
    );
    const job = res.body.job;
    if (res.status === 404 || !job) throw new Error(`Job ${input.jobId} was not found`);
    if (!job.report_id) {
      throw new Error(`Job ${input.jobId} is ${String(job.status)}${job.error_message ? `: ${String(job.error_message)}` : ''}. No report is available yet.`);
    }
    reportId = String(job.report_id);
  }

  const reportUrl = appUrl('/home?view=reports');
  const pathname = `/api/companion/reports/${encodeURIComponent(reportId)}`;

  if (input.format === 'json') {
    const res = await companionFetch<{ report?: unknown }>(pathname);
    return { reportId, format: 'json', report: res.body.report, reportUrl, message: 'Full analysis JSON.' };
  }

  const res = await companionFetch<{ summary?: unknown; markdown?: string }>(`${pathname}?format=${input.format}`);
  return {
    reportId,
    format: input.format,
    summary: res.body.summary,
    ...(input.format === 'markdown' ? { markdown: res.body.markdown } : {}),
    reportUrl,
    message: input.format === 'markdown'
      ? 'Markdown export of the analysis, identical to the app download.'
      : 'Analysis summary. Use format: "markdown" for the full report.',
  };
}

export const soc2ReportToolDefinition = {
  name: 'trustlists_soc2_report',
  description: 'Fetch a completed SOC 2 analysis as a short summary, the full markdown report, or raw JSON. Requires trustlists_login.',
  inputSchema: {
    type: 'object',
    properties: {
      reportId: { type: 'string', description: 'Analysis id from a succeeded job.' },
      jobId: { type: 'string', description: 'Job id; resolves to its report.' },
      format: { type: 'string', enum: ['summary', 'markdown', 'json'], description: 'Default summary.' },
    },
  },
} as const;
