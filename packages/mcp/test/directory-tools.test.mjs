import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  companyDirectoryUrl,
  getRegistrySnapshot,
  normalizeDomain,
  resetRegistryCacheForTests,
  searchRegistry,
} from '../dist/api/client.js';
import { browseInputSchema, filterRegistry } from '../dist/tools/browse.js';

const entries = [
  {
    name: 'Alpha Cloud',
    website: 'https://www.alpha.example/',
    trustCenter: 'https://trust.alpha.example/',
    platform: 'Vanta',
    certifications: ['SOC 2', 'ISO 27001'],
    csaStar: { level: 1 },
  },
  {
    name: 'Beta Payments',
    website: 'https://beta.example',
    trustCenter: 'https://security.beta.example',
    platform: 'SafeBase',
    certifications: ['PCI DSS'],
    csaStar: { level: 2 },
  },
  {
    name: 'Alpha Security',
    website: 'https://security-alpha.example',
    trustCenter: 'https://security-alpha.example/trust',
    platform: 'Self-hosted',
    certifications: [],
  },
];

test('normalizes domains from URLs and hostnames', () => {
  assert.equal(normalizeDomain('https://www.Alpha.Example/path'), 'alpha.example');
  assert.equal(normalizeDomain('www.beta.example'), 'beta.example');
});

test('searches names and domains with exact matches first', () => {
  const byName = searchRegistry(entries, 'Alpha');
  assert.deepEqual(byName.map((entry) => entry.name), ['Alpha Cloud', 'Alpha Security']);

  const byDomain = searchRegistry(entries, 'beta.example');
  assert.equal(byDomain.length, 1);
  assert.equal(byDomain[0].name, 'Beta Payments');
});

test('builds stable public company URLs', () => {
  assert.equal(
    companyDirectoryUrl('Acme, Inc.'),
    'https://trustlists.org/company/acme-inc/',
  );
});

test('browses by platform, framework, and CSA STAR level', () => {
  assert.deepEqual(
    filterRegistry(entries, { platform: 'safebase' }).map((entry) => entry.name),
    ['Beta Payments'],
  );
  assert.deepEqual(
    filterRegistry(entries, { framework: 'iso 27001' }).map((entry) => entry.name),
    ['Alpha Cloud'],
  );
  assert.deepEqual(
    filterRegistry(entries, { csaStarLevel: 1 }).map((entry) => entry.name),
    ['Alpha Cloud'],
  );
});

test('combines browse filters instead of treating them as alternatives', () => {
  assert.deepEqual(
    filterRegistry(entries, {
      platform: 'Vanta',
      framework: 'SOC 2',
      csaStarLevel: 1,
    }).map((entry) => entry.name),
    ['Alpha Cloud'],
  );
  assert.deepEqual(
    filterRegistry(entries, {
      platform: 'Vanta',
      framework: 'PCI DSS',
    }),
    [],
  );
});

test('trims browse filters and rejects whitespace-only values', () => {
  const parsed = browseInputSchema.parse({
    platform: ' Vanta ',
    framework: ' SOC 2 ',
  });

  assert.equal(parsed.platform, 'Vanta');
  assert.equal(parsed.framework, 'SOC 2');
  assert.throws(() => browseInputSchema.parse({ platform: ' ' }));
  assert.throws(() => browseInputSchema.parse({ framework: '\t' }));
});

test('coalesces concurrent registry refreshes', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let completeFetch;

  resetRegistryCacheForTests();
  globalThis.fetch = () => {
    fetchCalls += 1;
    return new Promise((resolve) => {
      completeFetch = () => resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          data: entries,
          meta: { total: entries.length },
        }),
      });
    });
  };

  try {
    const first = getRegistrySnapshot();
    const second = getRegistrySnapshot();

    assert.equal(fetchCalls, 1);
    completeFetch();

    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    assert.strictEqual(firstSnapshot, secondSnapshot);
    assert.equal(firstSnapshot.entries.length, entries.length);
  } finally {
    globalThis.fetch = originalFetch;
    resetRegistryCacheForTests();
  }
});
