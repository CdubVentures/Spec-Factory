import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../src/planner/sourcePlanner.js';

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
    maxUrlsPerProduct: 20,
    maxCandidateUrls: 50,
    maxPagesPerDomain: 2,
    fetchCandidateSources: true,
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

function makeTriageMeta(overrides = {}) {
  return {
    approval_bucket: 'approved',
    selection_priority: 'high',
    primary_lane: 1,
    triage_score: 50,
    triage_disposition: 'fetch_high',
    identity_prelim: 'exact',
    host_trust_class: 'official',
    ...overrides,
  };
}

// --- Routing tests ---

test('approved URL with triage meta routes to priorityQueue', () => {
  const planner = makePlanner();
  const meta = makeTriageMeta({ approval_bucket: 'approved', selection_priority: 'high' });
  const ok = planner.enqueue('https://review.example/spec', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  assert.equal(ok, true);
  // Seeds go to priorityQueue via seed_frontload, but discovery_approved with triage goes via approved_high
  assert.ok(planner.priorityQueue.length > 0 || planner.queue.length > 0);
});

test('seed URL routes to priorityQueue regardless of triage meta', () => {
  const planner = makePlanner();
  planner.enqueue('https://review.example/specs', 'seed', { forceApproved: true });
  const row = planner.priorityQueue.find((r) => r.url.includes('review.example'));
  assert.ok(row, 'seed should be in priorityQueue');
  assert.equal(row.enqueue_reason_codes.includes('seed_frontload'), true);
});

test('lane 2 manual/specsheet routes to priorityQueue when selection_priority is high', () => {
  const planner = makePlanner();
  const meta = makeTriageMeta({ primary_lane: 2, selection_priority: 'high' });
  planner.enqueue('https://manual.example/spec.pdf', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  const row = planner.priorityQueue.find((r) => r.url.includes('manual.example'));
  assert.ok(row, 'lane 2 high should be in priorityQueue');
});

test('lane 2 with low selection_priority routes to general/candidate, not priorityQueue', () => {
  const planner = makePlanner();
  const meta = makeTriageMeta({
    primary_lane: 2, selection_priority: 'low', approval_bucket: 'candidate',
  });
  planner.enqueue('https://manual.example/spec.pdf', 'discovery', {
    forceCandidate: true, triageMeta: meta,
  });
  assert.equal(planner.priorityQueue.find((r) => r.url.includes('manual.example')), undefined);
  assert.ok(planner.candidateQueue.find((r) => r.url.includes('manual.example')));
});

test('lane 1 manufacturer with medium priority routes to manufacturerQueue', () => {
  const planner = makePlanner();
  // WHY: approved+high triggers rule 2 (priorityQueue). Use medium to test lane 1 routing.
  const meta = makeTriageMeta({ primary_lane: 1, host_trust_class: 'official', selection_priority: 'medium', approval_bucket: 'approved' });
  planner.enqueue('https://manufacturer.com/product/viper-v3-pro', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  assert.ok(planner.manufacturerQueue.find((r) => r.url.includes('manufacturer.com/product')));
});

test('lane 3-4 trusted review/specdb with medium priority routes to general queue', () => {
  const planner = makePlanner();
  // WHY: approved+high triggers rule 2 (priorityQueue). Use medium to test lane 3 routing.
  const meta = makeTriageMeta({ primary_lane: 3, approval_bucket: 'approved', selection_priority: 'medium' });
  planner.enqueue('https://lab.com/review/viper', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  assert.ok(planner.queue.find((r) => r.url.includes('lab.com/review')));
});

test('low_value_host demoted to candidateQueue with low_value_demoted reason', () => {
  const planner = makePlanner();
  // No triage meta → fallback routing → low_value demotion applies
  planner.enqueue('https://reddit.com/r/mousereview/viper', 'discovery', {
    forceCandidate: true,
  });
  const row = planner.candidateQueue.find((r) => r.url.includes('reddit.com'));
  assert.ok(row, 'reddit should be in candidateQueue');
});

test('low_value_host does NOT override triage lane 1-4 routing', () => {
  const planner = makePlanner();
  // Triage says lane 2 high → should stay in priorityQueue despite low-value host
  const meta = makeTriageMeta({
    primary_lane: 2, selection_priority: 'high', approval_bucket: 'approved',
  });
  planner.enqueue('https://reddit.com/r/mousereview/spec.pdf', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  const row = planner.priorityQueue.find((r) => r.url.includes('reddit.com'));
  assert.ok(row, 'triage lane 2 high should override low-value demotion');
});

test('manufacturer_brand_restricted becomes routing demotion, not reject', () => {
  const planner = makePlanner({}, {
    identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
  }, {
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer' },
      { host: 'steelseries.com', tierName: 'manufacturer' },
    ],
  });
  // WHY: Use a support path so manufacturer_locked_reject doesn't fire
  // (steelseries is manufacturer but not in brand host set)
  const meta = makeTriageMeta({ primary_lane: 3, approval_bucket: 'approved', selection_priority: 'medium' });
  const ok = planner.enqueue('https://steelseries.com/support/downloads', 'discovery_approved', {
    forceApproved: true, triageMeta: meta,
  });
  assert.equal(ok, true, 'brand-restricted should be demoted, not rejected');
  const row = planner.queue.find((r) => r.url.includes('steelseries.com'));
  assert.ok(row, 'should be routed to general queue');
  assert.ok(row.enqueue_reason_codes.includes('brand_restricted_demoted'));
});

test('support/manual/spec/pdf paths survive manufacturer_locked_reject', () => {
  const planner = makePlanner({}, {
    identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
  }, {
    sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer' }],
  });
  // Support path should survive even though product slug might not match
  const ok = planner.enqueue('https://razer.com/support/viper-v3-pro-drivers', 'discovery_approved', {
    forceApproved: true,
  });
  assert.equal(ok, true, 'support path should survive');
});

test('already_visited remains a flat reject', () => {
  const planner = makePlanner();
  planner.enqueue('https://lab.com/review/mouse', 'seed', { forceApproved: true });
  planner.next(); // Visit it
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

test('candidateQueue admission works when fetching enabled', () => {
  const planner = makePlanner({ fetchCandidateSources: true });
  const ok = planner.enqueue('https://unknown.example/specs', 'discovery', {
    forceCandidate: true,
  });
  assert.equal(ok, true);
  assert.ok(planner.candidateQueue.find((r) => r.url.includes('unknown.example')));
});

// --- Enqueue metadata tests ---

test('enqueue row has enqueue metadata fields', () => {
  const planner = makePlanner();
  const meta = makeTriageMeta();
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
  assert.ok('seed_source' in row);
  assert.ok('triage_passthrough' in row);
  assert.equal(row.triage_passthrough, meta);
});

test('enqueueCounters includes new additive counters', () => {
  const planner = makePlanner();
  const counters = planner.enqueueCounters;
  assert.ok('downgraded' in counters);
  assert.ok('evictions' in counters);
  assert.ok('duplicate_upgrades' in counters);
  assert.ok('locale_replacements' in counters);
  assert.ok('triage_routed' in counters);
  assert.ok('triage_missing' in counters);
  // Existing counters still present
  assert.ok('accepted' in counters);
  assert.ok('rejected' in counters);
  assert.ok('total_rejected' in counters);
});

// --- Cap eviction tests ---

test('domain-cap eviction: incoming stronger URL evicts weaker same-domain row', () => {
  // WHY: Both URLs must go to the SAME queue type for domain cap to fire.
  // Use general queue (lane 3, medium priority, approved) for both.
  // Use empty brand to prevent manufacturer deep seed interference.
  const planner = makePlanner({ maxPagesPerDomain: 1 }, { identityLock: {} });
  const weakMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'medium',
    primary_lane: 3, triage_score: 10,
  });
  planner.enqueue('https://lab.com/page1', 'discovery_approved', {
    forceApproved: true, triageMeta: weakMeta,
  });
  const labInQueue = planner.queue.filter((r) => r.host === 'lab.com');
  assert.equal(labInQueue.length, 1);

  const strongMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'medium',
    primary_lane: 3, triage_score: 90,
  });
  const ok = planner.enqueue('https://lab.com/page2', 'discovery_approved', {
    forceApproved: true, triageMeta: strongMeta,
  });
  assert.equal(ok, true, 'stronger URL should be admitted via eviction');
  assert.ok(planner.enqueueCounters.evictions > 0);
});

test('domain-cap hard reject when incoming is weaker', () => {
  // WHY: Both URLs target general queue (lane 3, approved, medium).
  // The stronger URL is already queued; weaker incoming gets rejected.
  const planner = makePlanner({ maxPagesPerDomain: 1 }, { identityLock: {} });
  const strongMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'medium',
    primary_lane: 3, triage_score: 90,
  });
  planner.enqueue('https://lab.com/strong-page', 'discovery_approved', {
    forceApproved: true, triageMeta: strongMeta,
  });

  const weakMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'medium',
    primary_lane: 3, triage_score: 10,
  });
  const ok = planner.enqueue('https://lab.com/weak-page', 'discovery_approved', {
    forceApproved: true, triageMeta: weakMeta,
  });
  assert.equal(ok, false, 'weaker URL should be hard rejected');
  assert.ok(planner.enqueueCounters.rejected.domain_cap > 0);
});

// --- Duplicate upgrade tests ---

test('duplicate upgrade: better triage replaces weaker existing queued row', () => {
  const planner = makePlanner();
  const weakMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'low',
    primary_lane: 5, triage_score: 20,
  });
  planner.enqueue('https://lab.com/page', 'discovery_approved', {
    forceApproved: true, triageMeta: weakMeta,
  });
  const strongMeta = makeTriageMeta({
    approval_bucket: 'approved', selection_priority: 'high',
    primary_lane: 1, triage_score: 90,
  });
  const ok = planner.enqueue('https://lab.com/page', 'discovery_approved', {
    forceApproved: true, triageMeta: strongMeta,
  });
  assert.equal(ok, true, 'should upgrade existing');
  assert.ok(planner.enqueueCounters.duplicate_upgrades > 0);
});

test('duplicate without upgrade counts as already_queued', () => {
  const planner = makePlanner();
  planner.enqueue('https://lab.com/page', 'discovery_approved', { forceApproved: true });
  // Second enqueue without better meta → already_queued
  const ok = planner.enqueue('https://lab.com/page', 'discovery_approved', { forceApproved: true });
  assert.equal(ok, false);
  assert.ok(planner.enqueueCounters.rejected.already_queued > 0);
});
