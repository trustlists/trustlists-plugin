import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'marketplaces/openai');
const zipPath = resolve(source, 'dist/trustlists-openai-plugin.zip');
const plugin = JSON.parse(readFileSync(resolve(source, 'plugin.json'), 'utf8'));
const mcp = JSON.parse(readFileSync(resolve(source, 'mcp.json'), 'utf8'));
const server = JSON.parse(readFileSync(resolve(root, 'server.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(resolve(root, 'packages/mcp/package.json'), 'utf8'));
const versionSource = readFileSync(resolve(root, 'packages/mcp/src/version.ts'), 'utf8');
const versionMatch = versionSource.match(/SERVER_VERSION = '([^']+)'/);

function fail(message) {
  throw new Error(message);
}

function limit(value, max, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    fail(`${label} must be 1-${max} characters`);
  }
  if (value.includes('\u2014')) fail(`${label} contains an em dash`);
}

function pngSize(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature) || bytes.length < 24) fail(`${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

const interfaceFields = plugin.extensions?.['com.openai']?.interface;
const review = plugin.extensions?.['com.openai']?.review;
const serverEntry = mcp.mcpServers?.trustlists;
const auth = serverEntry?.extensions?.['com.openai']?.auth;

limit(plugin.name, 64, 'plugin name');
limit(interfaceFields?.displayName, 30, 'displayName');
limit(interfaceFields?.shortDescription, 30, 'shortDescription');
limit(interfaceFields?.longDescription, 4000, 'longDescription');
limit(interfaceFields?.developerName, 80, 'developerName');
if (!/^#[0-9A-F]{6}$/.test(interfaceFields?.brandColor || '')) fail('brandColor must be #RRGGBB');
if (!/^#[0-9A-F]{6}$/.test(interfaceFields?.brandColorDark || '')) fail('brandColorDark must be #RRGGBB');
if (!Array.isArray(interfaceFields?.defaultPrompt) || interfaceFields.defaultPrompt.length !== 3) {
  fail('defaultPrompt must contain exactly 3 prompts');
}
for (const prompt of interfaceFields.defaultPrompt) limit(prompt, 128, 'starter prompt');
if (interfaceFields.defaultPrompt.some((prompt) => prompt.includes('@'))) fail('starter prompts cannot mention apps');

const positive = review?.test_cases?.positive || [];
const negative = review?.test_cases?.negative || [];
if (positive.length !== 5 || negative.length !== 3) fail('review needs exactly 5 positive and 3 negative cases');
for (const testCase of positive) {
  limit(testCase.description, 4000, 'positive description');
  limit(testCase.prompt, 4000, 'positive prompt');
  limit(testCase.tools_triggered, 500, 'tools_triggered');
  limit(testCase.expected_behavior, 4000, 'expected behavior');
}
for (const testCase of negative) {
  limit(testCase.description, 4000, 'negative description');
  limit(testCase.prompt, 4000, 'negative prompt');
}
if (review.commerce !== false) fail('commerce must be false');
if (review.demo_recording_url && !review.demo_recording_url.startsWith('https://')) {
  fail('demo recording URL must be HTTPS');
}

const servers = Object.keys(mcp.mcpServers || {});
if (servers.length !== 1 || servers[0] !== 'trustlists') fail('OpenAI package must contain one trustlists MCP server');
if (serverEntry.type !== 'streamable-http' || serverEntry.url !== 'https://mcp.trustlists.org/mcp') {
  fail('OpenAI MCP URL is incorrect');
}
if (auth?.type !== 'oauth' || auth.client?.mode !== 'dcr' || auth.client.clientId || auth.client.clientSecret) {
  fail('OpenAI auth must use DCR and must not contain client credentials');
}
if (JSON.stringify(mcp).match(/clientSecret|private_key|BEGIN |api[_-]?key|password/i)) {
  fail('OpenAI MCP config contains a secret-like value');
}

for (const relativePath of [
  interfaceFields.logo,
  interfaceFields.logoDark,
  interfaceFields.composerIcon,
  interfaceFields.composerIconDark,
]) {
  const path = resolve(source, relativePath.replace(/^\.\//, ''));
  const image = pngSize(path);
  if (image.width !== image.height || image.width < 48 || image.width > 4096) {
    fail(`${relativePath} must be a square PNG from 48 to 4096 pixels`);
  }
  if (image.bytes > 5 * 1024 * 1024) fail(`${relativePath} exceeds 5 MiB`);
}

if (!versionMatch) fail('Could not read SERVER_VERSION');
const version = versionMatch[1];
if (plugin.version !== version || packageJson.version !== version || server.version !== version) {
  fail(`Marketplace version ${version} does not match plugin, package, and server.json`);
}
if (server.packages?.[0]?.version !== version) fail('server.json package version is stale');
limit(server.description, 100, 'server.json description');
if (server.remotes?.[0]?.type !== 'streamable-http' || server.remotes[0].url !== 'https://mcp.trustlists.org/mcp') {
  fail('server.json remote endpoint is missing');
}
if (!server.repository?.id) fail('server.json repository id is missing');
for (const icon of server.icons || []) {
  if (!icon.src.startsWith('https://') || icon.src.length > 255 || icon.mimeType !== 'image/png') {
    fail('server.json icons must be HTTPS PNG URLs');
  }
}
if ((server.icons || []).length < 1) fail('server.json needs at least one icon');

mkdirSync(resolve(source, 'dist'), { recursive: true });
rmSync(zipPath, { force: true });
execFileSync('zip', ['-X', '-q', zipPath, 'plugin.json', 'mcp.json', 'assets/icon.png', 'assets/icon-dark.png'], {
  cwd: source,
});
const zip = statSync(zipPath);
if (zip.size <= 0 || zip.size > 100 * 1024 * 1024) fail('OpenAI ZIP has an invalid size');
console.log(`Validated marketplace manifests and wrote ${zipPath} (${zip.size} bytes)`);
