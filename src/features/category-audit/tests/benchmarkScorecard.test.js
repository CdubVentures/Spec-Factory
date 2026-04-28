import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadBenchmarkScorecard, extractFieldBenchmarkRows } from '../benchmarkScorecard.js';

async function makeTempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-scorecard-'));
}

const SAMPLE_SCORECARD = {
  category: 'mouse',
  generated_at: '2026-04-28T03:59:26.188Z',
  fields: [
    { field_key: 'switch', label: 'Switch', correct: 1, wrong: 1, missing: 0, scored: 2, accuracy: 50 },
  ],
  products: [
    {
      display_name: 'Brand A Model 1',
      identity_key: 'brand-a|model-1',
      cells: {
        switch: { status: 'correct', reason: 'normalized scalar match', benchmark: 'D2FC-F-7N(20M)', app: 'D2FC-F-7N(20M)', app_confidence: 95 },
      },
    },
    {
      display_name: 'Brand B Model 2',
      identity_key: 'brand-b|model-2',
      cells: {
        switch: { status: 'wrong', reason: 'normalized scalar mismatch', benchmark: 'Kailh GM 8.0', app: 'optical-switches-with-marketing-slug', app_confidence: 92 },
      },
    },
    {
      display_name: 'Brand C No Switch Cell',
      identity_key: 'brand-c|model-3',
      cells: { release_date: { status: 'correct' } },
    },
  ],
};

test('loadBenchmarkScorecard returns null when file is absent', async () => {
  const root = await makeTempRoot();
  const result = await loadBenchmarkScorecard({ outputRoot: root, category: 'mouse' });
  assert.equal(result, null);
});

test('loadBenchmarkScorecard returns parsed object when file exists', async () => {
  const root = await makeTempRoot();
  const filePath = path.join(root, 'mouse', 'key-finder-benchmark', 'scorecard.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(SAMPLE_SCORECARD), 'utf8');
  const result = await loadBenchmarkScorecard({ outputRoot: root, category: 'mouse' });
  assert.ok(result);
  assert.equal(result.category, 'mouse');
});

test('loadBenchmarkScorecard returns null on invalid JSON', async () => {
  const root = await makeTempRoot();
  const filePath = path.join(root, 'mouse', 'key-finder-benchmark', 'scorecard.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, 'not json', 'utf8');
  const result = await loadBenchmarkScorecard({ outputRoot: root, category: 'mouse' });
  assert.equal(result, null);
});

test('extractFieldBenchmarkRows returns null when scorecard is null', () => {
  assert.equal(extractFieldBenchmarkRows(null, 'switch'), null);
});

test('extractFieldBenchmarkRows returns null when no product has the field key', () => {
  const result = extractFieldBenchmarkRows(SAMPLE_SCORECARD, 'never_existed');
  assert.equal(result, null);
});

test('extractFieldBenchmarkRows returns rows sorted with wrong before correct', () => {
  const result = extractFieldBenchmarkRows(SAMPLE_SCORECARD, 'switch');
  assert.ok(result);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].status, 'wrong');
  assert.equal(result.rows[1].status, 'correct');
});

test('extractFieldBenchmarkRows preserves benchmark, app, confidence, and reason fields', () => {
  const result = extractFieldBenchmarkRows(SAMPLE_SCORECARD, 'switch');
  const wrongRow = result.rows.find((row) => row.status === 'wrong');
  assert.equal(wrongRow.benchmark, 'Kailh GM 8.0');
  assert.equal(wrongRow.app, 'optical-switches-with-marketing-slug');
  assert.equal(wrongRow.appConfidence, 92);
  assert.equal(wrongRow.reason, 'normalized scalar mismatch');
  assert.equal(wrongRow.productLabel, 'Brand B Model 2');
});

test('extractFieldBenchmarkRows attaches the matching field summary', () => {
  const result = extractFieldBenchmarkRows(SAMPLE_SCORECARD, 'switch');
  assert.ok(result.fieldSummary);
  assert.equal(result.fieldSummary.field_key, 'switch');
  assert.equal(result.fieldSummary.accuracy, 50);
});
