import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createQueryIndex } from '../queryIndex.js';

function createQueryResult(overrides = {}) {
  return {
    query: 'razer viper v3 pro spec',
    provider: 'searxng',
    result_count: 10,
    field_yield: ['sensor', 'weight'],
    run_id: 'run-1',
    category: 'mouse',
    product_id: 'razer-viper-v3-pro',
    ...overrides,
  };
}

function createUrlVisit(overrides = {}) {
  return {
    url: 'https://rtings.com/mouse/razer-viper',
    host: 'rtings.com',
    tier: 'tier2_lab',
    doc_kind: 'review',
    fields_filled: ['click_latency'],
    fetch_success: true,
    run_id: 'run-1',
    ...overrides,
  };
}

function createQueryIndexHarness() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queryindex-'));
  const queryIndex = createQueryIndex();

  return {
    ...queryIndex,
    queryLogPath: path.join(rootDir, 'query_index.ndjson'),
    urlLogPath: path.join(rootDir, 'url_index.ndjson'),
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

describe('queryIndex query history contract', () => {
  it('appends query results as NDJSON records', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    harness.recordQueryResult(createQueryResult(), harness.queryLogPath);

    const lines = fs.readFileSync(harness.queryLogPath, 'utf8').trim().split('\n');
    const [record] = lines.map((line) => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(record.query, 'razer viper v3 pro spec');
    assert.equal(record.provider, 'searxng');
  });

  it('aggregates query history by query and provider', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    harness.recordQueryResult(createQueryResult({
      query: 'q1',
      result_count: 10,
      run_id: 'r1',
      product_id: 'p1',
      field_yield: ['sensor'],
    }), harness.queryLogPath);
    harness.recordQueryResult(createQueryResult({
      query: 'q1',
      result_count: 20,
      run_id: 'r2',
      product_id: 'p2',
      field_yield: ['weight'],
    }), harness.queryLogPath);

    const history = harness.lookupQueryHistory('q1', 'searxng', harness.queryLogPath);
    assert.equal(history.times_used, 2);
    assert.equal(history.avg_result_count, 15);
    assert.deepEqual([...history.fields_attributed].sort(), ['sensor', 'weight']);
  });

  it('preserves nullable optional fields in stored query records', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    harness.recordQueryResult(createQueryResult({
      query: 'q1',
      provider: 'p1',
      result_count: 0,
      category: null,
      product_id: null,
      field_yield: null,
    }), harness.queryLogPath);

    const [record] = fs
      .readFileSync(harness.queryLogPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.equal(record.category, null);
    assert.equal(record.product_id, null);
    assert.equal(record.field_yield, null);
  });
});

describe('queryIndex URL history contract', () => {
  it('appends URL visits as NDJSON records', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    harness.recordUrlVisit(createUrlVisit(), harness.urlLogPath);

    const lines = fs.readFileSync(harness.urlLogPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
  });

  it('aggregates URL history across runs', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    harness.recordUrlVisit(createUrlVisit({
      url: 'https://a.com/page',
      host: 'a.com',
      tier: 'tier1',
      doc_kind: 'spec',
      fields_filled: ['sensor'],
      run_id: 'r1',
    }), harness.urlLogPath);
    harness.recordUrlVisit(createUrlVisit({
      url: 'https://a.com/page',
      host: 'a.com',
      tier: 'tier1',
      doc_kind: 'spec',
      fields_filled: ['weight'],
      fetch_success: false,
      run_id: 'r2',
    }), harness.urlLogPath);

    const history = harness.lookupUrlHistory('https://a.com/page', harness.urlLogPath);
    assert.equal(history.times_visited, 2);
    assert.deepEqual([...history.fields_filled].sort(), ['sensor', 'weight']);
    assert.equal(history.avg_fetch_success_rate, 0.5);
  });

  it('returns zeroed history when a URL has not been seen', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    const history = harness.lookupUrlHistory('https://nope.com', harness.urlLogPath);
    assert.equal(history.times_visited, 0);
    assert.deepEqual(history.fields_filled, []);
    assert.equal(history.avg_fetch_success_rate, 0);
  });

  it('deduplicates repeated visits from the same run', (t) => {
    const harness = createQueryIndexHarness();
    t.after(() => harness.cleanup());

    const visit = createUrlVisit({
      url: 'https://a.com/page',
      host: 'a.com',
      tier: 'tier1',
      doc_kind: 'spec',
      fields_filled: ['sensor'],
      run_id: 'r1',
    });
    harness.recordUrlVisit(visit, harness.urlLogPath);
    harness.recordUrlVisit(visit, harness.urlLogPath);

    const history = harness.lookupUrlHistory('https://a.com/page', harness.urlLogPath);
    assert.equal(history.times_visited, 1);
  });
});
