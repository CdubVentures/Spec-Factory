// WHY: Golden-master characterization tests for SourcePlanner's public API.
// Locks current behavior before the sourcePlanner rewrite per CLAUDE.md characterization wall.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../src/planner/sourcePlanner.js';

// --- Factories ---

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

// ============================================================
// 1. enqueue() routes URLs to correct queues
// ============================================================

test('characterization: enqueue routes approved host to approved queue', () => {
  const planner = makePlanner();

  planner.enqueue('https://lab.com/review/product');
  const stats = planner.getStats();

  // lab.com is an approved host → should land in the non-manufacturer approved queue
  assert.equal(stats.non_manufacturer_queue_count, 1);
  assert.equal(stats.candidate_queue_count, 0);
});

test('characterization: enqueue routes unknown host to candidate queue', () => {
  const planner = makePlanner();

  planner.enqueue('https://unknown-site.com/product/123');
  const stats = planner.getStats();

  assert.equal(stats.candidate_queue_count, 1);
  assert.equal(stats.non_manufacturer_queue_count, 0);
});

test('characterization: enqueue routes manufacturer host to manufacturer queue', () => {
  const planner = makePlanner();

  planner.enqueue('https://manufacturer.com/product/x');
  const stats = planner.getStats();

  // manufacturer.com goes to manufacturer queue (via fallback routing since no triageMeta)
  assert.equal(stats.manufacturer_queue_count >= 1, true);
});

// ============================================================
// 2. seedCandidates() adds to candidate queue
// ============================================================

test('characterization: seedCandidates adds URLs to candidate queue', () => {
  const planner = makePlanner();

  planner.seedCandidates([
    'https://random-a.com/specs',
    'https://random-b.com/specs',
  ]);

  const stats = planner.getStats();
  assert.equal(stats.candidate_queue_count, 2);
});

test('characterization: seedCandidates does not add to approved queue', () => {
  const planner = makePlanner();

  planner.seedCandidates(['https://lab.com/review/thing']);

  const stats = planner.getStats();
  // seedCandidates forces candidate queue even for approved hosts
  assert.equal(stats.candidate_queue_count, 1);
  assert.equal(stats.non_manufacturer_queue_count, 0);
});

// ============================================================
// 3. seed() adds to priority queue with forceApproved
// ============================================================

test('characterization: seed adds URLs to priority queue', () => {
  const planner = makePlanner({
    job: makeJob({ seedUrls: [] }),
  });

  planner.seed(['https://example.com/product/x']);

  const stats = planner.getStats();
  assert.equal(stats.priority_queue_count >= 1, true);
});

test('characterization: seed marks URLs as approved (not candidate)', () => {
  const planner = makePlanner({
    job: makeJob({ seedUrls: [] }),
  });

  planner.seed(['https://example.com/product/x']);

  const item = planner.next();
  assert.equal(item.candidateSource, false);
  assert.equal(item.approvedDomain, true);
});

// ============================================================
// 4. next() dequeues in priority → manufacturer → approved → candidate order
// ============================================================

test('characterization: next dequeues priority → manufacturer → approved → candidate', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 5 }),
  });

  // Add one URL to each queue type
  planner.enqueue('https://unknown-site.com/candidate', 'discovery', { forceCandidate: true });
  planner.enqueue('https://lab.com/approved');
  planner.enqueue('https://manufacturer.com/product');
  planner.seed(['https://priority-seed.com/page']);

  const order = [];
  while (planner.hasNext()) {
    const item = planner.next();
    order.push(item.host);
  }

  // Priority seed first, then manufacturer, then approved (lab), then candidate
  const priorityIdx = order.indexOf('priority-seed.com');
  const mfgIdx = order.indexOf('manufacturer.com');
  const approvedIdx = order.indexOf('lab.com');
  const candidateIdx = order.indexOf('unknown-site.com');

  assert.ok(priorityIdx < mfgIdx, 'priority before manufacturer');
  assert.ok(mfgIdx < approvedIdx, 'manufacturer before approved');
  assert.ok(approvedIdx < candidateIdx, 'approved before candidate');
});

// ============================================================
// 5. blockHost() removes URLs from all queues
// ============================================================

test('characterization: blockHost removes URLs from all queues', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 10 }),
  });

  planner.enqueue('https://lab.com/page1');
  planner.enqueue('https://lab.com/page2');
  planner.enqueue('https://unknown.com/candidate', 'discovery', { forceCandidate: true });

  const statsBefore = planner.getStats();
  const labCountBefore = statsBefore.non_manufacturer_queue_count;
  assert.ok(labCountBefore >= 2, 'lab.com URLs should be queued');

  const removed = planner.blockHost('lab.com');
  assert.ok(removed >= 2, 'blockHost should remove queued lab.com URLs');

  const statsAfter = planner.getStats();
  assert.equal(statsAfter.non_manufacturer_queue_count, 0);
  assert.equal(statsAfter.blocked_host_count, 1);
  assert.ok(statsAfter.blocked_hosts.includes('lab.com'));

  // candidate queue untouched
  assert.equal(statsAfter.candidate_queue_count, 1);
});

test('characterization: blockHost prevents future enqueues for that host', () => {
  const planner = makePlanner();

  planner.blockHost('lab.com');
  const accepted = planner.enqueue('https://lab.com/new-page');
  assert.equal(accepted, false);
});

// ============================================================
// 6. maxPagesPerDomain per-domain cap is enforced
// ============================================================

test('characterization: maxPagesPerDomain caps URLs per host in approved queue', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 2 }),
  });

  const r1 = planner.enqueue('https://lab.com/page/1');
  const r2 = planner.enqueue('https://lab.com/page/2');
  const r3 = planner.enqueue('https://lab.com/page/3');

  assert.equal(r1, true);
  assert.equal(r2, true);
  // Third URL should be rejected or evict — either way, total queued for lab.com stays at cap
  const stats = planner.getStats();
  assert.ok(stats.non_manufacturer_queue_count <= 2, 'domain cap should limit lab.com URLs');
});

test('characterization: maxPagesPerDomain caps candidate queue after visited count increments', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 2 }),
  });

  // WHY: candidateHostCounts are incremented on next(), not enqueue().
  // The candidate domain cap checks candidateHostCounts (visited) not queue length.
  // So we must dequeue items first to trigger the visited count, then the cap applies.
  planner.enqueue('https://random.com/page/1', 'discovery', { forceCandidate: true });
  planner.enqueue('https://random.com/page/2', 'discovery', { forceCandidate: true });

  // Dequeue both to increment candidateHostCounts for random.com
  planner.next();
  planner.next();

  // Now enqueue a third — should be rejected by candidate_domain_cap
  const accepted = planner.enqueue('https://random.com/page/3', 'discovery', { forceCandidate: true });
  assert.equal(accepted, false);

  const counters = planner.enqueueCounters;
  assert.equal(counters.rejected.candidate_domain_cap, 1);
});

// ============================================================
// 7. getStats() returns expected shape
// ============================================================

test('characterization: getStats returns correct shape with all expected keys', () => {
  const planner = makePlanner();

  const stats = planner.getStats();

  // Queue counts
  assert.equal(typeof stats.priority_queue_count, 'number');
  assert.equal(typeof stats.manufacturer_queue_count, 'number');
  assert.equal(typeof stats.non_manufacturer_queue_count, 'number');
  assert.equal(typeof stats.candidate_queue_count, 'number');

  // Visited counts
  assert.equal(typeof stats.manufacturer_visited_count, 'number');
  assert.equal(typeof stats.non_manufacturer_visited_count, 'number');
  assert.equal(typeof stats.candidate_visited_count, 'number');

  // Blocked hosts
  assert.equal(typeof stats.blocked_host_count, 'number');
  assert.ok(Array.isArray(stats.blocked_hosts));

  // Brand manufacturer hosts
  assert.ok(Array.isArray(stats.brand_manufacturer_hosts));

  // Max urls
  assert.equal(typeof stats.max_urls, 'number');
});

test('characterization: getStats reflects queue and visited counts accurately', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 10 }),
  });

  planner.enqueue('https://lab.com/page/1');
  planner.enqueue('https://unknown.com/page', 'discovery', { forceCandidate: true });

  const statsBefore = planner.getStats();
  assert.equal(statsBefore.non_manufacturer_queue_count, 1);
  assert.equal(statsBefore.candidate_queue_count, 1);
  assert.equal(statsBefore.non_manufacturer_visited_count, 0);

  // Dequeue the approved one
  planner.next();

  const statsAfter = planner.getStats();
  assert.equal(statsAfter.non_manufacturer_queue_count, 0);
  assert.equal(statsAfter.non_manufacturer_visited_count, 1);
  assert.equal(statsAfter.candidate_queue_count, 1);
});

// ============================================================
// 8. enqueueCounters returns expected shape
// ============================================================

test('characterization: enqueueCounters has accepted, rejected, and meta counters', () => {
  const planner = makePlanner();

  const counters = planner.enqueueCounters;

  // accepted count
  assert.equal(typeof counters.accepted, 'number');

  // rejected object with known keys
  assert.equal(typeof counters.rejected, 'object');
  assert.equal(typeof counters.rejected.empty_url, 'number');
  assert.equal(typeof counters.rejected.invalid_url, 'number');
  assert.equal(typeof counters.rejected.bad_protocol, 'number');
  assert.equal(typeof counters.rejected.already_visited, 'number');
  assert.equal(typeof counters.rejected.already_queued, 'number');
  assert.equal(typeof counters.rejected.denied_host, 'number');
  assert.equal(typeof counters.rejected.blocked_host, 'number');
  assert.equal(typeof counters.rejected.low_value_host, 'number');
  assert.equal(typeof counters.rejected.domain_cap, 'number');
  assert.equal(typeof counters.rejected.candidate_domain_cap, 'number');

  // total_rejected
  assert.equal(typeof counters.total_rejected, 'number');

  // meta counters
  assert.equal(typeof counters.downgraded, 'number');
  assert.equal(typeof counters.evictions, 'number');
  assert.equal(typeof counters.duplicate_upgrades, 'number');
  assert.equal(typeof counters.locale_replacements, 'number');
  assert.equal(typeof counters.triage_routed, 'number');
  assert.equal(typeof counters.triage_missing, 'number');
});

test('characterization: enqueueCounters increments accepted for successful enqueues', () => {
  const planner = makePlanner();

  planner.enqueue('https://lab.com/page');
  planner.enqueue('https://unknown.com/page', 'discovery', { forceCandidate: true });

  const counters = planner.enqueueCounters;
  assert.equal(counters.accepted >= 2, true);
});

test('characterization: enqueueCounters increments rejected.already_queued for duplicates', () => {
  const planner = makePlanner();

  planner.enqueue('https://lab.com/page');
  planner.enqueue('https://lab.com/page');

  const counters = planner.enqueueCounters;
  assert.equal(counters.rejected.already_queued >= 1, true);
});

// ============================================================
// 9. updateBrandHints() populates manufacturer host set
// ============================================================

test('characterization: updateBrandHints populates brandHostHints and manufacturer set', () => {
  const planner = makePlanner({
    job: makeJob({
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100',
    }),
    categoryConfig: makeCategoryConfig({
      sourceHosts: [
        { host: 'acme.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
        { host: 'other-mfg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      ],
    }),
  });

  planner.updateBrandHints({
    officialDomain: 'acme.com',
    aliases: ['acme'],
    supportDomain: null,
  });

  // brandHostHints should be populated
  assert.ok(planner.brandHostHints.length > 0);
  assert.ok(planner.brandHostHints.includes('acme'));

  // manufacturer host set should include acme.com (matches brand hints)
  const stats = planner.getStats();
  assert.ok(stats.brand_manufacturer_hosts.length > 0);
  assert.ok(stats.brand_manufacturer_hosts.includes('acme.com'));
});

test('characterization: updateBrandHints with no brandResolution is a no-op', () => {
  const planner = makePlanner();
  const hintsBefore = [...planner.brandHostHints];

  planner.updateBrandHints(null);

  assert.deepStrictEqual(planner.brandHostHints, hintsBefore);
});

// ============================================================
// Hardcoded internal caps verification
// ============================================================

test('characterization: planner hardcodes maxUrls=50 (maxCandidateUrls removed)', () => {
  const planner = makePlanner();

  assert.equal(planner.maxUrls, 50);
});

test('characterization: maxPagesPerDomain reads from config via configInt', () => {
  const planner = makePlanner({
    config: makeConfig({ maxPagesPerDomain: 3 }),
  });

  assert.equal(planner.maxPagesPerDomain, 3);
});

// ============================================================
// next() returns null when empty
// ============================================================

test('characterization: next returns null when all queues are empty', () => {
  const planner = makePlanner({
    job: makeJob({ seedUrls: [] }),
  });

  // Drain any auto-seeded manufacturer deep URLs
  while (planner.hasNext()) {
    planner.next();
  }

  assert.equal(planner.next(), null);
  assert.equal(planner.hasNext(), false);
});

// ============================================================
// next() row shape verification
// ============================================================

test('characterization: next returns row with expected properties', () => {
  const planner = makePlanner();

  planner.enqueue('https://lab.com/product/123');
  const row = planner.next();

  assert.equal(typeof row.url, 'string');
  assert.equal(typeof row.host, 'string');
  assert.equal(typeof row.rootDomain, 'string');
  assert.equal(typeof row.tier, 'number');
  assert.equal(typeof row.tierName, 'string');
  assert.equal(typeof row.role, 'string');
  assert.equal(typeof row.priorityScore, 'number');
  assert.equal(typeof row.approvedDomain, 'boolean');
  assert.equal(typeof row.candidateSource, 'boolean');
  assert.equal(typeof row.discoveredFrom, 'string');
  assert.ok('enqueue_decision' in row);
  assert.ok('enqueue_reason_codes' in row);
  assert.ok('queue_selected' in row);
  assert.ok('host_yield_state' in row);
  assert.ok('triage_passthrough' in row);
});
