import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { sessionFromTokens, writeSession } from '../dist/auth/store.js';
import { resetRegistryCacheForTests } from '../dist/api/client.js';
import {
  resetSoc2UploadCacheForTests,
  runSoc2Analyze,
} from '../dist/tools/soc2.js';

const APP_URL = 'http://companion.test';
const MINIMAL_PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: () => null },
  };
}

function installFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const method = String(init.method || 'GET').toUpperCase();
    let parsed;
    if (typeof init.body === 'string') {
      try { parsed = JSON.parse(init.body); } catch { parsed = init.body; }
    }
    calls.push({ url: href, method, body: parsed });
    return handler({ url: href, method, body: parsed, init });
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

async function setupAuth() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trustlists-soc2-'));
  process.env.TRUSTLISTS_AUTH_FILE = path.join(dir, 'auth.json');
  process.env.TRUSTLISTS_APP_URL = APP_URL;
  await writeSession(sessionFromTokens({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
    user: { id: 'user-1', email: 'buyer@example.com', displayName: 'Buyer Example' },
  }));
  return dir;
}

let tempDir = '';

beforeEach(async () => {
  resetSoc2UploadCacheForTests();
  resetRegistryCacheForTests();
  tempDir = await setupAuth();
});

afterEach(async () => {
  resetSoc2UploadCacheForTests();
  delete process.env.TRUSTLISTS_AUTH_FILE;
  delete process.env.TRUSTLISTS_APP_URL;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
});

function creditsFor(fileName) {
  if (fileName.includes('large')) return 5;
  return 3;
}

function mockAnalyzer(handlerExtras) {
  return installFetch(({ url, method, body }) => {
    if (method === 'POST' && url.endsWith('/api/companion/soc2-upload-init')) {
      const fileName = String(body.fileName || 'report.pdf');
      return jsonResponse(200, {
        signedUrl: `${APP_URL}/upload/${encodeURIComponent(fileName)}`,
        storagePath: `soc2/${fileName}`,
      });
    }
    if (method === 'PUT' && url.includes('/upload/')) {
      return jsonResponse(200, {});
    }
    if (method === 'POST' && url.endsWith('/api/companion/soc2-check')) {
      const fileName = String(body.storagePath || '').split('/').pop();
      return jsonResponse(200, {
        pageCount: fileName.includes('large') ? 80 : 20,
        tier: 'standard',
        tierLabel: 'Standard',
        creditsRequired: creditsFor(fileName),
        canAfford: true,
      });
    }
    if (method === 'GET' && url.endsWith('/api/companion/me')) {
      return jsonResponse(200, { usage: { remaining: 40 }, user: { email: 'buyer@example.com' } });
    }
    if (handlerExtras) return handlerExtras({ url, method, body });
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

test('analyze without confirmCredits does not POST /soc2-jobs', async () => {
  const filePath = path.join(tempDir, 'report.pdf');
  await writeFile(filePath, MINIMAL_PDF);
  const fetchMock = mockAnalyzer();

  try {
    const result = await runSoc2Analyze({ filePath });
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.totalCreditsRequired, 3);
    assert.deepEqual(result.jobIds, []);
    assert.equal(
      fetchMock.calls.some((call) => call.method === 'POST' && call.url.endsWith('/api/companion/soc2-jobs')),
      false,
    );
  } finally {
    fetchMock.restore();
  }
});

test('batch analyze confirms the total, then enqueues each file', async () => {
  const small = path.join(tempDir, 'small.pdf');
  const large = path.join(tempDir, 'large.pdf');
  await writeFile(small, MINIMAL_PDF);
  await writeFile(large, MINIMAL_PDF);

  let jobSeq = 0;
  const fetchMock = mockAnalyzer(({ url, method, body }) => {
    if (method === 'POST' && url.endsWith('/api/companion/soc2-jobs')) {
      jobSeq += 1;
      return jsonResponse(200, {
        job: { id: `job-${jobSeq}`, status: 'queued' },
        confirmedCredits: body.confirmedCredits,
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });

  try {
    const preview = await runSoc2Analyze({ filePaths: [small, large] });
    assert.equal(preview.status, 'needs_confirmation');
    assert.equal(preview.totalCreditsRequired, 8);
    assert.equal(
      fetchMock.calls.filter((call) => call.url.endsWith('/api/companion/soc2-jobs')).length,
      0,
    );

    const queued = await runSoc2Analyze({
      filePaths: [small, large],
      confirmCredits: 8,
    });
    assert.equal(queued.status, 'queued');
    assert.deepEqual(queued.jobIds, ['job-1', 'job-2']);

    const jobPosts = fetchMock.calls.filter((call) => (
      call.method === 'POST' && call.url.endsWith('/api/companion/soc2-jobs')
    ));
    assert.equal(jobPosts.length, 2);
    assert.deepEqual(jobPosts.map((call) => call.body.fileName).sort(), ['large.pdf', 'small.pdf']);
    assert.deepEqual(
      jobPosts.map((call) => call.body.confirmedCredits).sort((a, b) => a - b),
      [3, 5],
    );
  } finally {
    fetchMock.restore();
  }
});
