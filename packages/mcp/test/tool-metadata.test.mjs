import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allToolDefinitions } from '../dist/execute-tool.js';
import {
  TOOL_ANNOTATION_KEYS,
  getToolMetadata,
  listToolMetadata,
} from '../dist/tool-metadata.js';
import { HOSTED_TOOL_NAMES, STDIO_TOOL_NAMES } from '../dist/version.js';

test('local tool list keeps its contract and publishes explicit safety metadata', () => {
  assert.equal(allToolDefinitions.length, STDIO_TOOL_NAMES.length);
  assert.deepEqual(allToolDefinitions.map((tool) => tool.name), [...STDIO_TOOL_NAMES]);

  for (const tool of allToolDefinitions) {
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(typeof tool.title, 'string');
    assert.ok(tool.title.length > 0 && tool.title.length <= 64, tool.name);
    for (const key of TOOL_ANNOTATION_KEYS) {
      assert.equal(typeof tool.annotations[key], 'boolean', `${tool.name} ${key}`);
    }
    if (tool.annotations.readOnlyHint) {
      assert.equal(tool.annotations.destructiveHint, false, tool.name);
      assert.equal(tool.annotations.idempotentHint, true, tool.name);
    }
  }
});

test('credit spending and local credential changes are consequential', () => {
  const consequential = allToolDefinitions
    .filter((tool) => tool.annotations.destructiveHint)
    .map((tool) => tool.name)
    .sort();
  assert.deepEqual(consequential, [
    'trustlists_access_continue',
    'trustlists_access_request',
    'trustlists_access_request_batch',
    'trustlists_login',
    'trustlists_logout',
    'trustlists_soc2_analyze',
  ]);
  assert.equal(getToolMetadata('trustlists_soc2_analyze', 'stdio').annotations.readOnlyHint, false);
  assert.throws(() => getToolMetadata('trustlists_soc2_analyze', 'hosted'));
  assert.throws(() => getToolMetadata('trustlists_soc2_upload', 'stdio'));
});

test('metadata covers both published transports without changing the counts', () => {
  assert.equal(listToolMetadata('stdio').length, 15);
  assert.equal(listToolMetadata('hosted').length, 13);
  assert.deepEqual(
    listToolMetadata('hosted').map((tool) => tool.name).sort(),
    [...HOSTED_TOOL_NAMES].sort(),
  );
  for (const tool of listToolMetadata()) {
    assert.match(tool.justification, /\S/);
    assert.equal(tool.justification.includes('\u2014'), false);
  }
});
