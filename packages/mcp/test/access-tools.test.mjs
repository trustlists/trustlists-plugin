import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { resetRegistryCacheForTests } from '../dist/api/client.js';
import { sessionFromTokens, writeSession } from '../dist/auth/store.js';
import {
  MAX_ACCESS_BATCH,
  accessRequestBatchInputSchema,
  runAccessRequest,
  runAccessRequestBatch,
} from '../dist/tools/access.js';

const APP_URL = 'http://companion.test';

const REGISTRY = {
  data: [
    {
      name: 'Stripe',
      website: 'https://stripe.com',
      trustCenter: 'https://stripe.com/docs/security',
      platform: 'SafeBase',
      certifications: ['SOC 2'],
    },
    {
      name: 'Datadog',
      website: 'https://www.datadoghq.com',
      trustCenter: 'https://trust.datadoghq.com',
      platform: 'Vanta',
      certifications: ['SOC 2'],
    },
    {
      name: 'Acme',
      website: 'https://acme.example',
      trustCenter: 'https://acme.example/trust',
      platform: 'Self-hosted',
      certifications: [],
    },
  ],
  meta: { total: 3 },
};

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
    if (href.includes('trust-centers.json')) return jsonResponse(200, REGISTRY);
    return handler({ url: href, method, body: parsed });
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

function companionPosts(calls, suffix) {
  return calls.filter((call) => call.method === 'POST' && call.url.endsWith(suffix));
}

async function setupAuth() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trustlists-access-'));
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
  resetRegistryCacheForTests();
  tempDir = await setupAuth();
});

afterEach(async () => {
  resetRegistryCacheForTests();
  delete process.env.TRUSTLISTS_AUTH_FILE;
  delete process.env.TRUSTLISTS_APP_URL;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
});

test('access request without confirm does not POST', async () => {
  const fetchMock = installFetch(({ url, method }) => {
    throw new Error(`unexpected companion fetch ${method} ${url}`);
  });

  try {
    const result = await runAccessRequest({ vendor: 'stripe.com' });
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.vendor?.name, 'Stripe');
    assert.equal(companionPosts(fetchMock.calls, '/api/companion/request-access').length, 0);
    assert.equal(companionPosts(fetchMock.calls, '/api/companion/vendor-reviews').length, 0);
  } finally {
    fetchMock.restore();
  }
});

test('profile incomplete returns 409 mapping', async () => {
  const fetchMock = installFetch(({ url, method }) => {
    if (method === 'GET' && url.endsWith('/api/companion/vendor-reviews')) {
      return jsonResponse(200, { success: true, reviews: [] });
    }
    if (method === 'POST' && url.endsWith('/api/companion/vendor-reviews')) {
      return jsonResponse(201, {
        success: true,
        review: {
          id: 'review-1',
          vendor_name: 'Stripe',
          vendor_domain: 'stripe.com',
          directory_slug: 'stripe',
          trust_center_url: 'https://stripe.com/docs/security',
          platform: 'SafeBase',
        },
      });
    }
    if (method === 'POST' && url.endsWith('/api/companion/request-access')) {
      return jsonResponse(409, {
        success: false,
        code: 'requester_profile_incomplete',
        error: 'Add your company and job title before requesting access.',
        missing: ['company', 'role'],
      });
    }
    throw new Error(`unexpected companion fetch ${method} ${url}`);
  });

  try {
    const result = await runAccessRequest({ vendor: 'stripe.com', confirm: true });
    assert.equal(result.status, 'profile_incomplete');
    assert.deepEqual(result.missing, ['company', 'role']);
    assert.match(result.nextStep || '', /trustlists_requester_profile/);
    assert.equal(companionPosts(fetchMock.calls, '/api/companion/request-access').length, 1);
  } finally {
    fetchMock.restore();
  }
});

test('batch access stops at 5 vendors', async () => {
  const vendors = ['one.com', 'two.com', 'three.com', 'four.com', 'five.com', 'six.com'];
  assert.throws(() => accessRequestBatchInputSchema.parse({ vendors }));

  const fetchMock = installFetch(({ url, method }) => {
    throw new Error(`unexpected companion fetch ${method} ${url}`);
  });

  try {
    const result = await runAccessRequestBatch({ vendors, confirm: true });
    assert.equal(result.status, 'blocked');
    assert.equal(result.results.length, 0);
    assert.match(result.message, new RegExp(String(MAX_ACCESS_BATCH)));
    assert.equal(companionPosts(fetchMock.calls, '/api/companion/request-access').length, 0);
    assert.equal(companionPosts(fetchMock.calls, '/api/companion/vendor-reviews').length, 0);
  } finally {
    fetchMock.restore();
  }
});
