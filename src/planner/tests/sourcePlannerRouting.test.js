import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../sourcePlanner.js';

function makeCategoryConfig(overrides = {}) {
  return {
    sourceHosts: [
      { host: 'manufacturer.com', tierName: 'manufacturer' },
      { host: 'lab.com', tierName: 'lab' },
      { host: 'db-a.com', tierName: 'database' },
    ],
    denylist: [],
    ...overrides,
  };
}

function makeConfig(overrides = {}) {
  return {
    maxPagesPerDomain: 5,
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  return {
    seedUrls: [],
    preferredSources: {},
    identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
    productId: 'razer-viper-v3-pro',
    ...overrides,
  };
}

function makePlanner(configOverrides = {}, jobOverrides = {}, catOverrides = {}) {
  return new SourcePlanner(
    makeJob(jobOverrides),
    makeConfig(configOverrides),
    makeCategoryConfig(catOverrides),
  );
}

// --- Routing tests ---

test('seed URL routes to priorityQueue', () => {
  const planner = makePlanner();
  planner.enqueue('https://review.example/specs', 'seed', { forceApproved: true });
  const row = planner.priorityQueue.find((r) => r.url.includes('review.example'));
  assert.ok(row, 'seed should be in priorityQueue');
});

test('forceApproved routes to priorityQueue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://review.example/spec', 'discovery_approved', {
    forceApproved: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.priorityQueue.find((r) => r.url.includes('review.example')));
});

test('resume seed routes to priorityQueue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://lab.com/review/test', 'resume_pending_seed', {
    forceApproved: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.priorityQueue.find((r) => r.url.includes('lab.com/review')));
});

test('forceCandidate routes to candidateQueue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://unknown.example/specs', 'discovery', {
    forceCandidate: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.candidateQueue.find((r) => r.url.includes('unknown.example')));
});

test('manufacturer host routes to manufacturerQueue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://manufacturer.com/product/test', 'discovery_approved');
  assert.equal(ok, true);
  assert.ok(planner.manufacturerQueue.find((r) => r.url.includes('manufacturer.com/product/test')));
});

test('allowlisted host routes to general queue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://lab.com/review/test');
  assert.equal(ok, true);
  assert.ok(planner.queue.find((r) => r.url.includes('lab.com/review')));
});

test('discovery_approved routes to general queue for non-manufacturer host', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://new-site.com/specs', 'discovery_approved');
  assert.equal(ok, true);
  assert.ok(planner.queue.find((r) => r.url.includes('new-site.com')));
});

test('unknown host without forceApproved routes to candidateQueue', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://random.example/specs');
  assert.equal(ok, true);
  assert.ok(planner.candidateQueue.find((r) => r.url.includes('random.example')));
});

test('low_value_host is rejected', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://reddit.com/r/mousereview/viper', 'discovery');
  assert.equal(ok, false);
  assert.ok(planner.enqueueCounters.rejected.low_value_host > 0);
});

test('low_value_host bypass for seeds', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://reddit.com/r/mousereview/viper', 'seed', { forceApproved: true });
  assert.equal(ok, true);
  assert.ok(planner.priorityQueue.find((r) => r.url.includes('reddit.com')));
});

test('already_visited remains a flat reject', () => {
  // WHY: Use empty identityLock to prevent manufacturer deep seeds from polluting the queue.
  const planner = makePlanner({}, { identityLock: {} });
  planner.enqueue('https://lab.com/review/mouse', 'seed', { forceApproved: true });
  planner.next(); // Visit it — no manufacturer deep seeds to contend with
  const ok = planner.enqueue('https://lab.com/review/mouse', 'discovery_approved', {
    forceApproved: true,
  });
  assert.equal(ok, false, 'already visited should be rejected');
  assert.ok(planner.enqueueCounters.rejected.already_visited > 0);
});

test('URLs without triageMeta use fallback routing (backward compat)', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://lab.com/review/test', 'discovery_approved', {
    forceApproved: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.enqueueCounters.triage_missing > 0);
});

test('candidateQueue admission works', () => {
  const planner = makePlanner();
  const ok = planner.enqueue('https://unknown.example/specs', 'discovery', {
    forceCandidate: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.candidateQueue.find((r) => r.url.includes('unknown.example')));
});

// --- Enqueue metadata tests ---

test('enqueue row has enqueue metadata fields', () => {
  const planner = makePlanner();
  const meta = { triage_score: 50, approval_bucket: 'approved' };
  planner.enqueue('https://lab.com/review/meta-test', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  const row = [...planner.priorityQueue, ...planner.queue, ...planner.manufacturerQueue, ...planner.candidateQueue]
    .find((r) => r.url.includes('meta-test'));
  assert.ok(row, 'should find the row');
  assert.ok('enqueue_decision' in row);
  assert.ok('enqueue_reason_codes' in row);
  assert.ok('queue_selected' in row);
  assert.ok('host_yield_state' in row);
  assert.ok('triage_passthrough' in row);
  assert.equal(row.triage_passthrough, meta);
});

test('enqueueCounters includes additive counters', () => {
  const planner = makePlanner();
  const counters = planner.enqueueCounters;
  assert.ok('downgraded' in counters);
  assert.ok('evictions' in counters);
  assert.ok('duplicate_upgrades' in counters);
  assert.ok('locale_replacements' in counters);
  assert.ok('triage_routed' in counters);
  assert.ok('triage_missing' in counters);
  assert.ok('accepted' in counters);
  assert.ok('rejected' in counters);
  assert.ok('total_rejected' in counters);
});

// --- Domain cap tests ---

test('domain-cap rejects when per-domain limit is reached', () => {
  const planner = makePlanner({ maxPagesPerDomain: 1 }, { identityLock: {} });
  planner.enqueue('https://lab.com/page1', 'discovery_approved', { forceApproved: true });
  const ok = planner.enqueue('https://lab.com/page2', 'discovery_approved', { forceApproved: true });
  assert.equal(ok, false, 'second URL should be rejected by domain cap');
  assert.ok(planner.enqueueCounters.rejected.domain_cap > 0);
});

test('duplicate counts as already_queued', () => {
  const planner = makePlanner();
  planner.enqueue('https://lab.com/page', 'discovery_approved', { forceApproved: true });
  const ok = planner.enqueue('https://lab.com/page', 'discovery_approved', { forceApproved: true });
  assert.equal(ok, false);
  assert.ok(planner.enqueueCounters.rejected.already_queued > 0);
});
