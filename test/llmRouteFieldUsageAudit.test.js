import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildLlmRouteFieldUsageAudit } from '../scripts/llmRouteFieldUsageAudit.js';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function summarizeResults(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      key: String(row?.key || ''),
      totalMatchesInRuntimeFiles: Number(row?.totalMatchesInRuntimeFiles || 0)
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

test('llm route field usage audit only permits derived effort_band as dormant', () => {
  const generated = buildLlmRouteFieldUsageAudit({ repoRoot: path.resolve('.') });
  assert.equal(generated.keysCount > 0, true, 'audit should include route matrix field keys');
  assert.deepEqual(
    generated.dormantKeys,
    ['effort_band'],
    'only the derived effort_band should be dormant in runtime consumers'
  );
});

test('llm route field usage artifact matches generated audit snapshot', () => {
  const generated = buildLlmRouteFieldUsageAudit({ repoRoot: path.resolve('.') });
  const persisted = readJson('implementation/gui-persistence/04-LLM-ROUTE-FIELD-USAGE-AUDIT.json');

  assert.equal(Number(persisted.keysCount || 0), generated.keysCount, 'persisted key count should match generator output');
  assert.deepEqual(
    Array.isArray(persisted.dormantKeys) ? persisted.dormantKeys : [],
    generated.dormantKeys,
    'persisted dormant keys should match generator output'
  );
  assert.deepEqual(
    summarizeResults(persisted.results),
    summarizeResults(generated.results),
    'persisted runtime usage counts should match generator output'
  );
});
