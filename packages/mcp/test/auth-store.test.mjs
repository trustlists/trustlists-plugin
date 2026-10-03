import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  clearSession,
  readSession,
  sessionFromTokens,
  writeSession,
} from '../dist/auth/store.js';
import { executeTool } from '../dist/execute-tool.js';
import { runLogin, setLoginSleepForTests } from '../dist/tools/auth.js';

const APP_URL = 'http://companion.test';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: () => null },
  };
}

async function withAuthDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trustlists-auth-'));
  const previousFile = process.env.TRUSTLISTS_AUTH_FILE;
  const previousUrl = process.env.TRUSTLISTS_APP_URL;
  process.env.TRUSTLISTS_AUTH_FILE = path.join(dir, 'auth.json');
  process.env.TRUSTLISTS_APP_URL = APP_URL;
  try {
    await fn(path.join(dir, 'auth.json'));
  } finally {
    if (previousFile === undefined) delete process.env.TRUSTLISTS_AUTH_FILE;
    else process.env.TRUSTLISTS_AUTH_FILE = previousFile;
    if (previousUrl === undefined) delete process.env.TRUSTLISTS_APP_URL;
    else process.env.TRUSTLISTS_APP_URL = previousUrl;
    await rm(dir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  setLoginSleepForTests(async () => undefined);
});

afterEach(() => {
  setLoginSleepForTests(null);
});

test('writeSession stores the session at mode 0600 and readSession returns it', async () => {
  await withAuthDir(async (file) => {
    const session = sessionFromTokens({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      user: { id: 'user-1', email: 'buyer@example.com', displayName: 'Buyer Example' },
    });
    await writeSession(session);

    const mode = (await stat(file)).mode & 0o777;
    assert.equal(mode, 0o600);

    const loaded = await readSession();
    assert.equal(loaded?.user.email, 'buyer@example.com');
    assert.equal(loaded?.accessToken, 'access-token');
    assert.equal(loaded?.baseUrl, APP_URL);

    assert.equal(await clearSession(), true);
    assert.equal(await readSession(), null);
  });
});

test('device login pending then approved writes auth.json mode 0600', async () => {
  await withAuthDir(async (file) => {
    const originalFetch = globalThis.fetch;
    let polls = 0;
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      const method = String(init.method || 'GET').toUpperCase();
      if (method === 'POST' && href.endsWith('/api/companion/auth/device/start')) {
        return jsonResponse(200, {
          deviceCode: 'device-code-abc123',
          userCode: 'ABCD-EFGH',
          verificationUri: `${APP_URL}/device`,
          verificationUriComplete: `${APP_URL}/device?code=ABCD-EFGH`,
          expiresIn: 600,
          interval: 1,
        });
      }
      if (method === 'POST' && href.endsWith('/api/companion/auth/device/poll')) {
        polls += 1;
        if (polls === 1) return jsonResponse(200, { error: 'authorization_pending' });
        return jsonResponse(200, {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 900,
          user: { id: 'user-1', email: 'buyer@example.com', displayName: 'Buyer Example' },
        });
      }
      throw new Error(`unexpected fetch ${method} ${href}`);
    };

    try {
      const pending = await runLogin({ waitSeconds: 0, force: false });
      assert.equal(pending.status, 'pending');
      assert.equal(pending.deviceCode, 'device-code-abc123');
      assert.equal(pending.userCode, 'ABCD-EFGH');
      assert.equal(await readSession(), null);

      const approved = await runLogin({
        deviceCode: 'device-code-abc123',
        waitSeconds: 30,
        force: false,
      });
      assert.equal(approved.status, 'signed_in');
      assert.equal(approved.user?.email, 'buyer@example.com');

      const mode = (await stat(file)).mode & 0o777;
      assert.equal(mode, 0o600);
      const loaded = await readSession();
      assert.equal(loaded?.refreshToken, 'refresh-token');
      assert.ok(polls >= 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('account tools map NotSignedInError to a login hint', async () => {
  await withAuthDir(async () => {
    const result = await executeTool('trustlists_soc2_status', {}, { allowAccount: true });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /trustlists_login/);
  });
});
