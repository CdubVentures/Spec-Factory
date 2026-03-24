import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  recordQueryResult,
  lookupQueryHistory,
  recordUrlVisit,
  lookupUrlHistory,
} from '../src/features/indexing/pipeline/shared/queryIndex.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queryindex-'));
});

describe('queryIndex — recordQueryResult', () => {
  it('1. appends to NDJSON', () => {
    const logPath = path.join(tmpDir, 'query_index.ndjson');
    recordQueryResult({
      query: 'razer viper v3 pro spec',
      provider: 'searxng',
      result_count: 10,
      field_yield: ['sensor', 'weight'],
      run_id: 'run-1',
      category: 'mouse',
      product_id: 'razer-viper-v3-pro',
    }, logPath);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.query, 'razer viper v3 pro spec');
    assert.equal(parsed.provider, 'searxng');
  });

  it('2. lookupQueryHistory returns correct aggregates', () => {
    const logPath = path.join(tmpDir, 'query_index.ndjson');
    recordQueryResult({ query: 'q1', provider: 'searxng', result_count: 10, run_id: 'r1', category: 'mouse', product_id: 'p1', field_yield: ['sensor'] }, logPath);
    recordQueryResult({ query: 'q1', provider: 'searxng', result_count: 20, run_id: 'r2', category: 'mouse', product_id: 'p2', field_yield: ['weight'] }, logPath);
    const history = lookupQueryHistory('q1', 'searxng', logPath);
    assert.equal(history.times_used, 2);
    assert.equal(history.avg_result_count, 15);
    assert.ok(history.fields_attributed.includes('sensor'));
    assert.ok(history.fields_attributed.includes('weight'));
  });
});

describe('queryIndex — recordUrlVisit', () => {
  it('3. appends to NDJSON', () => {
    const logPath = path.join(tmpDir, 'url_index.ndjson');
    recordUrlVisit({
      url: 'https://rtings.com/mouse/razer-viper',
      host: 'rtings.com',
      tier: 'tier2_lab',
      doc_kind: 'review',
      fields_filled: ['click_latency'],
      fetch_success: true,
      run_id: 'run-1',
    }, logPath);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
  });

  it('4. lookupUrlHistory returns correct aggregates', () => {
    const logPath = path.join(tmpDir, 'url_index.ndjson');
    recordUrlVisit({ url: 'https://a.com/page', host: 'a.com', tier: 'tier1', doc_kind: 'spec', fields_filled: ['sensor'], fetch_success: true, run_id: 'r1' }, logPath);
    recordUrlVisit({ url: 'https://a.com/page', host: 'a.com', tier: 'tier1', doc_kind: 'spec', fields_filled: ['weight'], fetch_success: false, run_id: 'r2' }, logPath);
    const history = lookupUrlHistory('https://a.com/page', logPath);
    assert.equal(history.times_visited, 2);
    assert.ok(history.fields_filled.includes('sensor'));
    assert.ok(history.fields_filled.includes('weight'));
    assert.equal(history.avg_fetch_success_rate, 0.5);
  });

  it('5. empty history returns zeroes', () => {
    const logPath = path.join(tmpDir, 'url_index.ndjson');
    const history = lookupUrlHistory('https://nope.com', logPath);
    assert.equal(history.times_visited, 0);
    assert.deepStrictEqual(history.fields_filled, []);
    assert.equal(history.avg_fetch_success_rate, 0);
  });

  it('6. deduplicates within same run_id', () => {
    const logPath = path.join(tmpDir, 'url_index.ndjson');
    recordUrlVisit({ url: 'https://a.com/page', host: 'a.com', tier: 'tier1', doc_kind: 'spec', fields_filled: ['sensor'], fetch_success: true, run_id: 'r1' }, logPath);
    recordUrlVisit({ url: 'https://a.com/page', host: 'a.com', tier: 'tier1', doc_kind: 'spec', fields_filled: ['sensor'], fetch_success: true, run_id: 'r1' }, logPath);
    const history = lookupUrlHistory('https://a.com/page', logPath);
    // Deduplication within same run_id — should count as 1 visit
    assert.equal(history.times_visited, 1);
  });

  it('7. field yield attribution propagated', () => {
    const logPath = path.join(tmpDir, 'query_index.ndjson');
    recordQueryResult({ query: 'q1', provider: 'p1', result_count: 5, run_id: 'r1', category: 'c1', product_id: 'p1', field_yield: ['sensor', 'dpi'] }, logPath);
    const history = lookupQueryHistory('q1', 'p1', logPath);
    assert.deepStrictEqual(history.fields_attributed.sort(), ['dpi', 'sensor']);
  });

  it('8. works with null/missing optional fields', () => {
    const logPath = path.join(tmpDir, 'query_index.ndjson');
    recordQueryResult({ query: 'q1', provider: 'p1', result_count: 0, run_id: 'r1', category: null, product_id: null, field_yield: null }, logPath);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.category, null);
  });
});
