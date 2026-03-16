import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVerdicts,
  aggregateSectionResult,
  computeSingleVerdict,
  VERDICT_STATUS
} from '../src/features/indexing/validation/live-crawl/verdicts.js';

// ── aggregateSectionResult ──────────────────────────────────

test('aggregateSectionResult returns GREEN when all checks pass', () => {
  const checks = [
    { id: 'DA-01', status: 'pass' },
    { id: 'DA-02', status: 'pass' },
    { id: 'DA-03', status: 'pass' }
  ];
  const result = aggregateSectionResult(checks);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.pass_count, 3);
  assert.equal(result.fail_count, 0);
  assert.equal(result.skip_count, 0);
});

test('aggregateSectionResult returns RED when any check fails', () => {
  const checks = [
    { id: 'DA-01', status: 'pass' },
    { id: 'DA-02', status: 'fail' },
    { id: 'DA-03', status: 'pass' }
  ];
  const result = aggregateSectionResult(checks);
  assert.equal(result.status, 'RED');
  assert.equal(result.fail_count, 1);
});

test('aggregateSectionResult returns PARTIAL when some are skipped but none fail', () => {
  const checks = [
    { id: 'DA-01', status: 'pass' },
    { id: 'DA-02', status: 'skip' },
    { id: 'DA-03', status: 'pass' }
  ];
  const result = aggregateSectionResult(checks);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.skip_count, 1);
});

test('aggregateSectionResult RED takes precedence over PARTIAL', () => {
  const checks = [
    { id: 'DA-01', status: 'pass' },
    { id: 'DA-02', status: 'skip' },
    { id: 'DA-03', status: 'fail' }
  ];
  const result = aggregateSectionResult(checks);
  assert.equal(result.status, 'RED');
});

// ── computeSingleVerdict ────────────────────────────────────

test('computeSingleVerdict GREEN when all mapped sections GREEN', () => {
  const sectionResults = {
    'RB-0': { status: 'GREEN' },
    'RB-1': { status: 'GREEN' },
    'S1': { status: 'GREEN' }
  };
  assert.equal(computeSingleVerdict('defaults_aligned', sectionResults), 'GREEN');
});

test('computeSingleVerdict RED when any mapped section RED', () => {
  const sectionResults = {
    'S1': { status: 'RED' }
  };
  assert.equal(computeSingleVerdict('defaults_aligned', sectionResults), 'RED');
});

test('computeSingleVerdict PARTIAL when any mapped section PARTIAL and none RED', () => {
  const sectionResults = {
    'S1': { status: 'PARTIAL' }
  };
  assert.equal(computeSingleVerdict('defaults_aligned', sectionResults), 'PARTIAL');
});

// ── computeVerdicts ─────────────────────────────────────────

test('computeVerdicts returns all 5 verdicts', () => {
  const sectionResults = {};
  // All sections as GREEN
  for (const s of ['RB-0', 'RB-1', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']) {
    sectionResults[s] = { status: 'GREEN' };
  }
  const verdicts = computeVerdicts(sectionResults);
  assert.equal(Object.keys(verdicts).length, 5);
  assert.equal(verdicts.defaults_aligned, 'GREEN');
  assert.equal(verdicts.crawl_alive, 'GREEN');
  assert.equal(verdicts.parser_alive, 'GREEN');
  assert.equal(verdicts.extraction_alive, 'GREEN');
  assert.equal(verdicts.publishable_alive, 'GREEN');
});

test('computeVerdicts propagates blocker RED to all verdicts', () => {
  const sectionResults = {};
  for (const s of ['RB-0', 'RB-1', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']) {
    sectionResults[s] = { status: 'GREEN' };
  }
  sectionResults['RB-0'] = { status: 'RED' };
  const verdicts = computeVerdicts(sectionResults);
  // Per doc: blocker RED -> all downstream non-representative
  for (const v of Object.values(verdicts)) {
    assert.equal(v, 'RED');
  }
});

test('computeVerdicts mixed section results produce correct verdicts', () => {
  const sectionResults = {};
  for (const s of ['RB-0', 'RB-1', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']) {
    sectionResults[s] = { status: 'GREEN' };
  }
  sectionResults['S5'] = { status: 'PARTIAL' }; // Parser section
  const verdicts = computeVerdicts(sectionResults);
  assert.equal(verdicts.parser_alive, 'PARTIAL');
  assert.equal(verdicts.defaults_aligned, 'GREEN');
});

// ── VERDICT_STATUS ──────────────────────────────────────────

test('VERDICT_STATUS contains the 3 allowed statuses', () => {
  assert.deepEqual(VERDICT_STATUS, ['GREEN', 'PARTIAL', 'RED']);
});
