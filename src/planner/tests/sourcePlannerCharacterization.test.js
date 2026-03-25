import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../sourcePlanner.js';

function makeCategoryConfig(overrides = {}) {
  return {
    sourceHosts: [
      { host: 'manufacturer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'lab.com', tierName: 'lab', role: 'lab', tier: 2 },
      { host: 'db-a.com', tierName: 'database', role: 'database', tier: 2 },
      { host: 'db-b.com', tierName: 'database', role: 'database', tier: 2 },
    ],
    denylist: [],
    ...overrides,
  };
}

function makeConfig(overrides = {}) {
  return {
    maxPagesPerDomain: 2,
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  return {
    seedUrls: [],
    preferredSources: {},
    ...overrides,
  };
}

function makePlanner(opts = {}) {
  const {
    job = makeJob(),
    config = makeConfig(),
    categoryConfig = makeCategoryConfig(),
    options = {},
  } = opts;
  return new SourcePlanner(job, config, categoryConfig, options);
}

test('source planner routes seedCandidates through the candidate path even for approved hosts', () => {
  const planner = makePlanner();

  planner.seedCandidates(['https://lab.com/review/thing']);

  const row = planner.next();
  assert.ok(row, 'seedCandidates should enqueue a row');
  assert.equal(row.host, 'lab.com');
  assert.equal(row.candidateSource, true);
  assert.equal(row.approvedDomain, false);
});

test('source planner seeds explicit URLs as approved priority work', () => {
  const planner = makePlanner({
    job: makeJob({ seedUrls: [] }),
  });

  planner.seed(['https://example.com/product/x']);

  const row = planner.next();
  assert.ok(row, 'seed should enqueue a row');
  assert.equal(row.url, 'https://example.com/product/x');
  assert.equal(row.candidateSource, false);
  assert.equal(row.approvedDomain, true);
});

test('source planner dequeues priority before manufacturer before approved before candidate', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 5 }),
  });

  planner.enqueue('https://unknown-site.com/candidate', 'discovery', { forceCandidate: true });
  planner.enqueue('https://lab.com/approved');
  planner.enqueue('https://manufacturer.com/product');
  planner.seed(['https://priority-seed.com/page']);

  const seenHosts = [];
  while (planner.hasNext()) {
    const row = planner.next();
    seenHosts.push(row.host);
  }

  assert.ok(seenHosts.indexOf('priority-seed.com') < seenHosts.indexOf('manufacturer.com'));
  assert.ok(seenHosts.indexOf('manufacturer.com') < seenHosts.indexOf('lab.com'));
  assert.ok(seenHosts.indexOf('lab.com') < seenHosts.indexOf('unknown-site.com'));
});

test('source planner blockHost removes queued rows and rejects future enqueues for that host', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 10 }),
  });

  planner.enqueue('https://lab.com/page1');
  planner.enqueue('https://lab.com/page2');
  planner.enqueue('https://unknown.com/candidate', 'discovery', { forceCandidate: true });

  const removed = planner.blockHost('lab.com');
  assert.ok(removed >= 2, 'blockHost should remove queued lab.com URLs');

  const next = planner.next();
  assert.ok(next, 'non-blocked rows should remain');
  assert.equal(next.host, 'unknown.com');
  assert.equal(planner.enqueue('https://lab.com/new-page'), false);
});

test('source planner enforces the candidate host cap after visited candidate rows accumulate', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 2 }),
  });

  planner.enqueue('https://random.com/page/1', 'discovery', { forceCandidate: true });
  planner.enqueue('https://random.com/page/2', 'discovery', { forceCandidate: true });

  assert.equal(planner.next()?.host, 'random.com');
  assert.equal(planner.next()?.host, 'random.com');
  assert.equal(
    planner.enqueue('https://random.com/page/3', 'discovery', { forceCandidate: true }),
    false,
  );
});

test('source planner next returns null after all queues are drained', () => {
  const planner = makePlanner({
    job: makeJob({ seedUrls: [] }),
  });

  while (planner.hasNext()) {
    planner.next();
  }

  assert.equal(planner.next(), null);
  assert.equal(planner.hasNext(), false);
});
