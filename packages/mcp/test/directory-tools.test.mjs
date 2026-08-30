import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  companyDirectoryUrl,
  normalizeDomain,
  searchRegistry,
} from '../dist/api/client.js';
import { filterRegistry } from '../dist/tools/browse.js';

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
