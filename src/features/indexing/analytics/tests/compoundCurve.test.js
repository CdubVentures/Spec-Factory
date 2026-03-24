import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { computeCompoundCurve } from '../compoundCurve.js';

// ── helpers ─────────────────────────────────────────────────
async function withTempDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compound-curve-'));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function makeRun(id, counters = {}) {
  return {
    run_id: id,
    category: 'mouse',
    counters: {
      fields_filled: counters.fields_filled ?? 0,
      fields_total: counters.fields_total ?? 0,
      ...counters,
    },
  };
}

function queryLine(runId, query = 'test query') {
  return JSON.stringify({ query, run_id: runId, ts: new Date().toISOString() });
}

function urlLine(runId, url) {
  return JSON.stringify({ url, run_id: runId, host: 'example.com', ts: new Date().toISOString() });
}

async function writeNdjson(filePath, lines) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8');
}

// ── tests ───────────────────────────────────────────────────
test('compoundCurve — 0 runs → NOT_PROVEN, empty', async () => {
  await withTempDir(async (tmpDir) => {
    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [],
      queryIndexPath: path.join(tmpDir, 'query-index.ndjson'),
      urlIndexPath: path.join(tmpDir, 'url-index.ndjson'),
    });
    assert.equal(result.verdict, 'NOT_PROVEN');
    assert.deepEqual(result.runs, []);
  });
});

test('compoundCurve — 1 run → NOT_PROVEN', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');
    await writeNdjson(qPath, [queryLine('r1'), queryLine('r1')]);
    await writeNdjson(uPath, [urlLine('r1', 'https://a.com/1')]);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1', { fields_filled: 5, fields_total: 10 })],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.verdict, 'NOT_PROVEN');
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].url_reuse_pct, 0);
  });
});

test('compoundCurve — missing query-index → searches all 0', async () => {
  await withTempDir(async (tmpDir) => {
    const uPath = path.join(tmpDir, 'url-index.ndjson');
    await writeNdjson(uPath, [urlLine('r1', 'https://a.com/1')]);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2')],
      queryIndexPath: path.join(tmpDir, 'nonexistent.ndjson'),
      urlIndexPath: uPath,
    });
    assert.equal(result.runs[0].searches, 0);
    assert.equal(result.runs[1].searches, 0);
  });
});

test('compoundCurve — missing url-index → reuse all 0', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    await writeNdjson(qPath, [queryLine('r1'), queryLine('r2')]);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2')],
      queryIndexPath: qPath,
      urlIndexPath: path.join(tmpDir, 'nonexistent.ndjson'),
    });
    assert.equal(result.runs[0].url_reuse_pct, 0);
    assert.equal(result.runs[1].url_reuse_pct, 0);
  });
});

test('compoundCurve — declining searches ≥30% + increasing reuse → PROVEN', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    // r1: 10 searches, r2: 7 searches, r3: 5 searches → 50% reduction
    const qLines = [
      ...Array.from({ length: 10 }, () => queryLine('r1')),
      ...Array.from({ length: 7 }, () => queryLine('r2')),
      ...Array.from({ length: 5 }, () => queryLine('r3')),
    ];

    // URL reuse: r1 has urls A,B,C; r2 has A,B,D; r3 has A,B,D,E
    const uLines = [
      urlLine('r1', 'https://a.com/1'), urlLine('r1', 'https://b.com/1'), urlLine('r1', 'https://c.com/1'),
      urlLine('r2', 'https://a.com/1'), urlLine('r2', 'https://b.com/1'), urlLine('r2', 'https://d.com/1'),
      urlLine('r3', 'https://a.com/1'), urlLine('r3', 'https://b.com/1'), urlLine('r3', 'https://d.com/1'), urlLine('r3', 'https://e.com/1'),
    ];

    await writeNdjson(qPath, qLines);
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [
        makeRun('r1', { fields_filled: 3, fields_total: 10 }),
        makeRun('r2', { fields_filled: 5, fields_total: 10 }),
        makeRun('r3', { fields_filled: 7, fields_total: 10 }),
      ],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.verdict, 'PROVEN');
  });
});

test('compoundCurve — 10-29% reduction → PARTIAL', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    // r1: 10 searches, r2: 8 searches → 20% reduction (partial)
    const qLines = [
      ...Array.from({ length: 10 }, () => queryLine('r1')),
      ...Array.from({ length: 8 }, () => queryLine('r2')),
    ];
    // No URL reuse (all unique)
    const uLines = [
      urlLine('r1', 'https://a.com/1'),
      urlLine('r2', 'https://z.com/1'),
    ];

    await writeNdjson(qPath, qLines);
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.verdict, 'PARTIAL');
  });
});

test('compoundCurve — <10% reduction, no reuse → NOT_PROVEN', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    // r1: 10 searches, r2: 10 searches → 0% reduction
    const qLines = [
      ...Array.from({ length: 10 }, () => queryLine('r1')),
      ...Array.from({ length: 10 }, () => queryLine('r2')),
    ];
    const uLines = [
      urlLine('r1', 'https://a.com/1'),
      urlLine('r2', 'https://z.com/1'),
    ];

    await writeNdjson(qPath, qLines);
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.verdict, 'NOT_PROVEN');
  });
});

test('compoundCurve — URL reuse slope >1.0 → increasing', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    await writeNdjson(qPath, [queryLine('r1'), queryLine('r2'), queryLine('r3')]);

    // r1: {A,B} r2: {A,B,C} (reuse 66%) r3: {A,B,C,D} (reuse 75%)
    const uLines = [
      urlLine('r1', 'https://a.com/1'), urlLine('r1', 'https://b.com/1'),
      urlLine('r2', 'https://a.com/1'), urlLine('r2', 'https://b.com/1'), urlLine('r2', 'https://c.com/1'),
      urlLine('r3', 'https://a.com/1'), urlLine('r3', 'https://b.com/1'), urlLine('r3', 'https://c.com/1'), urlLine('r3', 'https://d.com/1'),
    ];
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.url_reuse_trend, 'increasing');
  });
});

test('compoundCurve — URL reuse slope <-1.0 → decreasing', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    await writeNdjson(qPath, [queryLine('r1'), queryLine('r2'), queryLine('r3'), queryLine('r4')]);

    // r1: {A,B} r2: {A,B,C} (reuse 66%) r3: {D,E,F} (reuse 0%) r4: {G,H} (reuse 0%)
    const uLines = [
      urlLine('r1', 'https://a.com/1'), urlLine('r1', 'https://b.com/1'),
      urlLine('r2', 'https://a.com/1'), urlLine('r2', 'https://b.com/1'), urlLine('r2', 'https://c.com/1'),
      urlLine('r3', 'https://d.com/1'), urlLine('r3', 'https://e.com/1'), urlLine('r3', 'https://f.com/1'),
      urlLine('r4', 'https://g.com/1'), urlLine('r4', 'https://h.com/1'),
    ];
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3'), makeRun('r4')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.url_reuse_trend, 'decreasing');
  });
});

test('compoundCurve — slope between -1.0 and 1.0 → flat', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    await writeNdjson(qPath, [queryLine('r1'), queryLine('r2'), queryLine('r3')]);

    // All unique URLs per run → zero reuse → flat slope (all 0)
    const uLines = [
      urlLine('r1', 'https://a.com/1'), urlLine('r1', 'https://b.com/1'),
      urlLine('r2', 'https://c.com/1'), urlLine('r2', 'https://d.com/1'),
      urlLine('r3', 'https://e.com/1'), urlLine('r3', 'https://f.com/1'),
    ];
    await writeNdjson(uPath, uLines);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.url_reuse_trend, 'flat');
  });
});

test('compoundCurve — first run search=0 → reduction=0', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    // No queries at all
    await writeNdjson(qPath, []);
    await writeNdjson(uPath, []);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1'), makeRun('r2')],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.search_reduction_pct, 0);
  });
});

test('compoundCurve — malformed NDJSON lines skipped', async () => {
  await withTempDir(async (tmpDir) => {
    const qPath = path.join(tmpDir, 'query-index.ndjson');
    const uPath = path.join(tmpDir, 'url-index.ndjson');

    await writeNdjson(qPath, [
      'not json {{{',
      queryLine('r1'),
      '}{broken',
      queryLine('r1'),
    ]);
    await writeNdjson(uPath, [
      'garbage',
      urlLine('r1', 'https://a.com/1'),
    ]);

    const result = computeCompoundCurve({
      category: 'mouse',
      runSummaries: [makeRun('r1', { fields_filled: 5, fields_total: 10 })],
      queryIndexPath: qPath,
      urlIndexPath: uPath,
    });
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].searches, 2);
    assert.equal(result.runs[0].new_urls, 1);
  });
});
