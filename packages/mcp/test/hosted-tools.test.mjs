import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { resetRegistryCacheForTests } from '../dist/api/client.js';
import { verifyAccessToken } from '../dist/api/companion.js';
import { registerHostedTools } from '../dist/register-public-tools.js';
import { HOSTED_TOOL_NAMES } from '../dist/version.js';

const APP_URL = 'http://companion.test';
const USER = { id: 'user-1', email: 'felix@trustlists.org', displayName: 'Felix' };

const REGISTRY = {
  data: [
    {
      name: 'Stripe',
      website: 'https://stripe.com',
      trustCenter: 'https://stripe.com/docs/security',
      platform: 'SafeBase',
      certifications: ['SOC 2'],
    },
  ],
  meta: { total: 1 },
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

let calls = [];
let originalFetch;
let handler = () => jsonResponse(404, {});
let authDir;
let previousEnv;

beforeEach(async () => {
  authDir = await mkdtemp(path.join(os.tmpdir(), 'trustlists-hosted-'));
  previousEnv = { file: process.env.TRUSTLISTS_AUTH_FILE, url: process.env.TRUSTLISTS_APP_URL };
  process.env.TRUSTLISTS_AUTH_FILE = path.join(authDir, 'auth.json');
  process.env.TRUSTLISTS_APP_URL = APP_URL;
  resetRegistryCacheForTests();
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const headers = init.headers || {};
    calls.push({ url: href, method: String(init.method || 'GET').toUpperCase(), auth: headers.Authorization });
    if (href.includes('trust-centers.json')) return jsonResponse(200, REGISTRY);
    return handler(href, init);
  };
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  handler = () => jsonResponse(404, {});
  if (previousEnv.file === undefined) delete process.env.TRUSTLISTS_AUTH_FILE;
  else process.env.TRUSTLISTS_AUTH_FILE = previousEnv.file;
  if (previousEnv.url === undefined) delete process.env.TRUSTLISTS_APP_URL;
  else process.env.TRUSTLISTS_APP_URL = previousEnv.url;
  await rm(authDir, { recursive: true, force: true });
});

function collectTools() {
  const tools = new Map();
  registerHostedTools({
    registerTool(name, config, cb) {
      tools.set(name, { config, cb });
    },
  });
  return tools;
}

const authInfo = { token: 'oauth-access-token', extra: { user: USER } };

async function authFileExists() {
  try {
    await stat(process.env.TRUSTLISTS_AUTH_FILE);
    return true;
  } catch {
    return false;
  }
}

test('hosted endpoint registers the signed-in tool set without stdio-only tools', () => {
  const tools = collectTools();
  assert.deepEqual([...tools.keys()].sort(), [...HOSTED_TOOL_NAMES].sort());
  for (const name of ['trustlists_login', 'trustlists_logout', 'trustlists_soc2_analyze']) {
    assert.equal(tools.has(name), false, `${name} should not be hosted`);
  }
  for (const [name, { config }] of tools) {
    assert.doesNotMatch(config.description, /trustlists_login/, `${name} description mentions trustlists_login`);
  }
});

test('account tools call the app with the request token and never touch the auth file', async () => {
  handler = (url) => {
    if (url.endsWith('/api/companion/me')) return jsonResponse(200, { user: USER, usage: { freeRemaining: 5 } });
    if (url.endsWith('/api/companion/requester-profile')) return jsonResponse(200, { complete: true, missing: [] });
    return jsonResponse(404, {});
  };
  const tools = collectTools();

  const result = await tools.get('trustlists_whoami').cb({}, { authInfo });
  const body = JSON.parse(result.content[0].text);

  assert.equal(body.signedIn, true);
  assert.equal(body.user.email, USER.email);
  const appCalls = calls.filter((c) => c.url.startsWith(APP_URL));
  assert.ok(appCalls.length > 0);
  assert.ok(appCalls.every((c) => c.auth === 'Bearer oauth-access-token'));
  assert.equal(await authFileExists(), false);
});

test('account tools refuse to run without a verified user', async () => {
  const tools = collectTools();
  const result = await tools.get('trustlists_access_status').cb({}, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Connect the trustlists app/);
  assert.equal(calls.length, 0);
});

test('a rejected token asks the user to reconnect instead of refreshing', async () => {
  handler = () => jsonResponse(401, { error: 'Unauthorized' });
  const tools = collectTools();

  const result = await tools.get('trustlists_soc2_status').cb({}, { authInfo });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /reconnect the trustlists app/i);
  assert.equal(calls.some((c) => c.url.includes('/auth/refresh')), false);
});

test('soc2 upload returns the app link', async () => {
  const tools = collectTools();
  const result = await tools.get('trustlists_soc2_upload').cb({}, { authInfo });
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.uploadUrl, `${APP_URL}/home?view=analyze`);
});

test('audit maps pasted manifests and never reads a path on the server', async () => {
  const tools = collectTools();

  const result = await tools.get('trustlists_audit_dependencies').cb({
    manifests: [{ fileName: 'package.json', content: JSON.stringify({ dependencies: { stripe: '^14.0.0' } }) }],
  }, {});
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.totalDependencies, 1);
  assert.equal(body.withTrustCenters, 1);
  assert.equal(body.results[0].vendor, 'Stripe');

  const refused = await tools.get('trustlists_audit_dependencies').cb({
    projectPath: '/etc',
    manifests: [{ fileName: 'package.json', content: '{}' }],
  }, {});
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /cannot read files/);
});

test('audit scans every supplied manifest, even with the same file name', async () => {
  const tools = collectTools();

  const result = await tools.get('trustlists_audit_dependencies').cb({
    manifests: [
      { fileName: 'frontend/package.json', content: JSON.stringify({ dependencies: { stripe: '^14.0.0' } }) },
      { fileName: 'backend/package.json', content: JSON.stringify({ dependencies: { 'left-pad': '^1.3.0' } }) },
    ],
  }, {});
  const body = JSON.parse(result.content[0].text);

  assert.deepEqual(body.scannedFiles, ['frontend/package.json', 'backend/package.json']);
  assert.equal(body.totalDependencies, 2);
  assert.deepEqual(body.results.map((r) => r.name).sort(), ['left-pad', 'stripe']);
});

test('verifyAccessToken resolves a user and treats 401 as signed out', async () => {
  handler = (url, init) => (
    init.headers.Authorization === 'Bearer good'
      ? jsonResponse(200, { user: USER })
      : jsonResponse(401, { error: 'Unauthorized' })
  );
  assert.deepEqual(await verifyAccessToken('good'), USER);
  assert.equal(await verifyAccessToken('bad'), null);
  assert.equal(await verifyAccessToken(''), null);
});
