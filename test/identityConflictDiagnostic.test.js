import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSourceIdentity,
  evaluateIdentityGate,
  buildIdentityReport,
  buildIdentityCriticalContradictions,
} from '../src/features/indexing/validation/identityGate.js';
import { applyIdentityGateToCandidates } from '../src/pipeline/identityGateExtraction.js';
import { deriveNeedSetIdentityState, resolveExtractionGateOpen } from '../src/features/indexing/orchestration/shared/identityHelpers.js';

// ── Fixtures ────────────────────────────────────────────────

const IDENTITY_LOCK_VIPER_V3_PRO = {
  brand: 'Razer',
  model: 'Viper V3 Pro',
  variant: '',
  sku: '',
  mpn: '',
  gtin: '',
};

function makeSource(overrides = {}) {
  return {
    url: overrides.url || 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    finalUrl: overrides.finalUrl || overrides.url || 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    title: overrides.title || 'Razer Viper V3 Pro - Wireless Gaming Mouse',
    host: overrides.host || 'www.razer.com',
    rootDomain: overrides.rootDomain || 'razer.com',
    role: overrides.role || 'manufacturer',
    tier: overrides.tier ?? 1,
    approvedDomain: overrides.approvedDomain ?? true,
    discoveryOnly: overrides.discoveryOnly ?? false,
    helperSource: overrides.helperSource ?? false,
    connectionHint: overrides.connectionHint || '',
    identityCandidates: overrides.identityCandidates || {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
    identity: overrides.identity || null,
    anchorCheck: overrides.anchorCheck || { majorConflicts: [] },
    fieldCandidates: overrides.fieldCandidates || [
      { field: 'weight', value: '54g', confidence: 0.95 },
      { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
      { field: 'connection', value: 'Wireless', confidence: 0.98 },
      { field: 'lngth', value: '127.1', confidence: 0.90 },
      { field: 'width', value: '63.9', confidence: 0.90 },
      { field: 'height', value: '39.6', confidence: 0.90 },
    ],
    ...overrides,
  };
}

function makeViperV3Source(overrides = {}) {
  return makeSource({
    url: 'https://www.razer.com/gaming-mice/razer-viper-v3',
    title: 'Razer Viper V3 - Wired Gaming Mouse',
    identityCandidates: {
      brand: 'Razer',
      model: 'Viper V3',
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
    fieldCandidates: [
      { field: 'weight', value: '59g', confidence: 0.95 },
      { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
      { field: 'connection', value: 'Wired', confidence: 0.98 },
      { field: 'lngth', value: '126.7', confidence: 0.90 },
      { field: 'width', value: '63.5', confidence: 0.90 },
      { field: 'height', value: '38.6', confidence: 0.90 },
    ],
    ...overrides,
  });
}

function makeViperV3HyperSpeedSource(overrides = {}) {
  return makeSource({
    url: 'https://www.razer.com/gaming-mice/razer-viper-v3-hyperspeed',
    title: 'Razer Viper V3 HyperSpeed - Wireless Gaming Mouse',
    identityCandidates: {
      brand: 'Razer',
      model: 'Viper V3 HyperSpeed',
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
    fieldCandidates: [
      { field: 'weight', value: '82g', confidence: 0.95 },
      { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
      { field: 'connection', value: 'Wireless', confidence: 0.98 },
      { field: 'lngth', value: '127.0', confidence: 0.90 },
      { field: 'width', value: '63.7', confidence: 0.90 },
      { field: 'height', value: '39.4', confidence: 0.90 },
    ],
    ...overrides,
  });
}

function makeReviewerSource(overrides = {}) {
  return makeSource({
    url: overrides.url || 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
    title: overrides.title || 'Razer Viper V3 Pro Review - RTINGS.com',
    host: overrides.host || 'www.rtings.com',
    rootDomain: overrides.rootDomain || 'rtings.com',
    role: 'reviewer',
    tier: 2,
    identityCandidates: overrides.identityCandidates || {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
    ...overrides,
  });
}

function makeMultiProductListingSource(overrides = {}) {
  return makeSource({
    url: 'https://www.amazon.com/s?k=razer+gaming+mice',
    title: 'Amazon.com: razer gaming mice - Results',
    host: 'www.amazon.com',
    rootDomain: 'amazon.com',
    role: 'retailer',
    tier: 3,
    identityCandidates: overrides.identityCandidates || {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
    ...overrides,
  });
}

function evaluateAndAttachIdentity(source, identityLock) {
  const identity = evaluateSourceIdentity(source, identityLock, { identityGateBaseMatchThreshold: 0.7 });
  return { ...source, identity };
}

function buildSourceSet(sources, identityLock) {
  return sources.map((s) => evaluateAndAttachIdentity(s, identityLock));
}

test('IC-07: Height-only drift should NOT trigger conflict when length and width already agree', () => {
  const manufacturer = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'razer.com',
      role: 'manufacturer',
      tier: 1,
      fieldCandidates: [
        { field: 'lngth', value: '127.1', confidence: 0.98 },
        { field: 'width', value: '63.9', confidence: 0.98 },
        { field: 'height', value: '39.9', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const psaSource = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'psamethodcalculator.com',
      host: 'psamethodcalculator.com',
      url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro - Specs, Features, and Benchmarks',
      role: 'review',
      tier: 2,
      fieldCandidates: [
        { field: 'height', value: '55', confidence: 0.98 },
        { field: 'height', value: '39.9', confidence: 0.98 },
        { field: 'lngth', value: '127.1', confidence: 0.98 },
        { field: 'width', value: '63.9', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const tpuReview = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'techpowerup.com',
      role: 'review',
      tier: 1,
      url: 'https://www.techpowerup.com/review/razer-viper-v3-pro/',
      title: 'Razer Viper V3 Pro Review',
      host: 'www.techpowerup.com',
      fieldCandidates: [
        { field: 'height', value: '54', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const tpuSinglePage = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'techpowerup.com',
      role: 'review',
      tier: 1,
      url: 'https://www.techpowerup.com/review/razer-viper-v3-pro/single-page.html',
      title: 'Razer Viper V3 Pro Review - Single Page',
      host: 'www.techpowerup.com',
      fieldCandidates: [
        { field: 'height', value: '54', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const contradictions = buildIdentityCriticalContradictions([
    manufacturer,
    psaSource,
    tpuReview,
    tpuSinglePage,
  ]);
  const hasDimConflict = contradictions.some((c) => c.conflict === 'size_class_conflict');

  assert.equal(hasDimConflict, false,
    `Height-only drift (39.9 vs 54/55) should not trigger size_class_conflict when length/width agree â€” ` +
    `contradictions=${JSON.stringify(contradictions)}`);
});

// ── IC-02: Variant pages don't trigger conflict ─────────────

test('IC-02: Page mentioning "Viper V3" (without "Pro") must NOT pass identity match for "Viper V3 Pro"', () => {
  const viperV3Source = makeViperV3Source();
  const result = evaluateSourceIdentity(viperV3Source, IDENTITY_LOCK_VIPER_V3_PRO);

  // A page about "Viper V3" should NOT match identity for "Viper V3 Pro"
  // because "Pro" is a critical distinguishing token
  assert.equal(result.match, false,
    `"Viper V3" page should NOT match identity for "Viper V3 Pro" — got match=${result.match}, score=${result.score}, decision=${result.decision}`);
});

test('IC-02: Page mentioning "Viper V3 HyperSpeed" must NOT pass identity match for "Viper V3 Pro"', () => {
  const hyperSpeedSource = makeViperV3HyperSpeedSource();
  const result = evaluateSourceIdentity(hyperSpeedSource, IDENTITY_LOCK_VIPER_V3_PRO);

  assert.equal(result.match, false,
    `"Viper V3 HyperSpeed" page should NOT match identity for "Viper V3 Pro" — got match=${result.match}, score=${result.score}, decision=${result.decision}`);
});

test('IC-02: evaluateIdentityGate with Viper V3 variant page does not produce IDENTITY_CONFLICT', () => {
  const proSource = makeSource();
  const v3Source = makeViperV3Source({ tier: 2, role: 'reviewer', rootDomain: 'techreviews.com' });
  const reviewerSource = makeReviewerSource();

  const sourceResults = buildSourceSet(
    [proSource, v3Source, reviewerSource],
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const gate = evaluateIdentityGate(sourceResults);

  // Even with a Viper V3 page present, the gate should NOT conflict
  // because the Viper V3 page should be rejected/quarantined, not accepted
  assert.notEqual(gate.status, 'IDENTITY_CONFLICT',
    `Gate should not conflict when variant page is present but correctly rejected — got status=${gate.status}, contradictions=${JSON.stringify(gate.contradictions)}`);
});

// ── IC-03: Multi-product listing pages don't trigger conflict ─

test('IC-03: Amazon category page with multiple products does not introduce ambiguity', () => {
  const listingSource = makeMultiProductListingSource();
  const result = evaluateSourceIdentity(listingSource, IDENTITY_LOCK_VIPER_V3_PRO);

  // A search/listing page is not product-specific, so even with partial
  // model matches, it should not generate critical conflicts
  assert.equal(result.criticalConflicts.length, 0,
    `Multi-product listing page should not generate critical conflicts — got ${JSON.stringify(result.criticalConflicts)}`);
});

// ── IC-05: Fields promote after identity lock ────────────────

test('IC-05: Candidates from identity-matched source retain full confidence', () => {
  const source = makeSource();
  const identity = evaluateSourceIdentity(source, IDENTITY_LOCK_VIPER_V3_PRO, { identityGateBaseMatchThreshold: 0.7 });

  assert.equal(identity.match, true, 'Exact match source should pass identity');

  const candidates = [
    { field: 'weight', value: '54g', confidence: 0.95 },
    { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
  ];

  const gated = applyIdentityGateToCandidates(candidates, identity);
  assert.ok(gated.every((c) => c.identity_label === 'matched'), 'All candidates should be labeled matched');
  assert.ok(gated.every((c) => c.confidence >= 0.90), 'Candidates should retain high confidence');
});

// ── IC-06: Internal extraction preserved on conflict ─────────

test('IC-06: Even when identity conflicts, extracted data is preserved in candidates (capped, not deleted)', () => {
  const source = makeViperV3Source();
  const identity = evaluateSourceIdentity(source, IDENTITY_LOCK_VIPER_V3_PRO);

  const candidates = [
    { field: 'weight', value: '59g', confidence: 0.95 },
    { field: 'brand', value: 'Razer', confidence: 0.98 },
  ];

  const gated = applyIdentityGateToCandidates(candidates, identity);
  // Candidates should still exist with labels, confidence NOT capped
  assert.equal(gated.length, 2, 'Both candidates should be preserved');
  assert.ok(gated.every((c) => c.value !== undefined), 'Values should be preserved');
  assert.ok(gated.every((c) => c.identity_label !== undefined), 'Identity label should be present');
  assert.ok(gated.every((c) => c.confidence >= 0.95), 'Confidence should NOT be capped');
});

// ── IC-07: Identity confidence monotonic within a run ────────

test('IC-07: High-confidence identity should not drop below 0.90 from a single contradicting page', () => {
  // Simulate 3 good sources + 1 contradicting source
  const goodSources = [
    makeSource({ rootDomain: 'razer.com' }),
    makeReviewerSource({ rootDomain: 'rtings.com' }),
    makeReviewerSource({ url: 'https://techpowerup.com/review/razer-viper-v3-pro', rootDomain: 'techpowerup.com', host: 'techpowerup.com', title: 'Razer Viper V3 Pro Review' }),
  ];

  // First evaluate gate with only good sources
  const goodSourceResults = buildSourceSet(goodSources, IDENTITY_LOCK_VIPER_V3_PRO);
  const goodGate = evaluateIdentityGate(goodSourceResults);
  assert.ok(goodGate.certainty >= 0.90, `Good sources should give high certainty, got ${goodGate.certainty}`);

  // Now add a contradicting source
  const allSources = [
    ...goodSources,
    makeViperV3Source({ tier: 3, role: 'retailer', rootDomain: 'unknownshop.com' }),
  ];
  const allSourceResults = buildSourceSet(allSources, IDENTITY_LOCK_VIPER_V3_PRO);
  const allGate = evaluateIdentityGate(allSourceResults);

  // After fix: a single low-tier contradicting page should not drop
  // a well-established identity below 0.90
  assert.ok(allGate.certainty >= 0.90,
    `Single contradicting page should not drop certainty from ${goodGate.certainty} below 0.90 — got ${allGate.certainty}`);
  assert.equal(allGate.status, 'CONFIRMED',
    `Gate should remain CONFIRMED despite one contradicting low-tier source — got ${allGate.status}`);
});

// ── IC-08: Exact model match required ────────────────────────

test('IC-08: "Razer Viper V3 Pro" identity matches exact model', () => {
  const source = makeSource();
  const result = evaluateSourceIdentity(source, IDENTITY_LOCK_VIPER_V3_PRO, { identityGateBaseMatchThreshold: 0.7 });
  assert.equal(result.match, true, 'Exact model should match');
  assert.ok(result.score >= 0.70, `Exact model should have high score, got ${result.score}`);
});

test('IC-08: "Razer Viper V3" alone does NOT satisfy identity for "Viper V3 Pro"', () => {
  const source = makeViperV3Source();
  const result = evaluateSourceIdentity(source, IDENTITY_LOCK_VIPER_V3_PRO);

  // This is the critical test: partial model match should NOT pass
  assert.equal(result.match, false,
    `"Viper V3" should NOT match "Viper V3 Pro" — score=${result.score}, decision=${result.decision}`);
  assert.notEqual(result.decision, 'CONFIRMED',
    `"Viper V3" should not be CONFIRMED for "Viper V3 Pro" target — decision=${result.decision}`);
});

test('IC-08: "Razer Viper V3 Pro" in title/URL but "Viper V3" as extracted model still matches', () => {
  // Page has correct title/URL but extractor pulled short model name
  const source = makeSource({
    url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    title: 'Razer Viper V3 Pro - Wireless Gaming Mouse',
    identityCandidates: {
      brand: 'Razer',
      model: 'Viper V3', // extractor pulled short name
      variant: '',
      sku: '',
      mpn: '',
      gtin: '',
    },
  });

  const result = evaluateSourceIdentity(source, IDENTITY_LOCK_VIPER_V3_PRO, { identityGateBaseMatchThreshold: 0.7 });

  // Title and URL contain exact model, so should still match
  assert.equal(result.match, true,
    `Page with correct title/URL should match even if extractor pulled short model — score=${result.score}`);
});

// ── IC-09: Publisher blocker list specific ────────────────────

test('IC-09: When identity conflicts, blocker identifies which model strings conflicted', () => {
  const proSource = makeSource();
  const v3Source = makeViperV3Source({ tier: 2, role: 'reviewer', rootDomain: 'somereviewer.com' });
  const v3hsSource = makeViperV3HyperSpeedSource({ tier: 2, role: 'reviewer', rootDomain: 'otherreviewer.com' });

  const sourceResults = buildSourceSet(
    [proSource, v3Source, v3hsSource],
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const gate = evaluateIdentityGate(sourceResults);
  const report = buildIdentityReport({
    productId: 'mouse-razer-viper-v3-pro',
    runId: 'test-run',
    sourceResults,
    identityGate: gate,
  });

  // If there IS a conflict, the reason_codes should be specific
  if (gate.status === 'IDENTITY_CONFLICT') {
    assert.ok(gate.reasonCodes.length > 0,
      'Conflict should have specific reason codes');
    assert.ok(
      gate.contradictions.length > 0,
      'Conflict should list specific contradictions'
    );
    // Each contradiction should identify the source URL
    for (const c of gate.contradictions) {
      assert.ok(c.source, `Contradiction should identify source URL — got ${JSON.stringify(c)}`);
      assert.ok(c.conflict, `Contradiction should identify conflict type — got ${JSON.stringify(c)}`);
    }
  }

  // After fix: variant pages should be rejected, not conflict
  // So the gate should NOT be IDENTITY_CONFLICT
  assert.notEqual(gate.status, 'IDENTITY_CONFLICT',
    `Gate should not conflict when variant pages are correctly rejected — status=${gate.status}`);
});

// ── IC-05 (additional): Full pipeline identity → fields promoted ─

test('IC-09: Identity observability surfaces accepted contributors, rejected siblings, and first conflict trigger', () => {
  const proSource = makeSource();
  const noisyReviewer = makeReviewerSource({
    url: 'https://www.techpowerup.com/review/razer-viper-v3-pro',
    title: 'Razer Viper V3 Pro Review - TechPowerUp',
    host: 'www.techpowerup.com',
    rootDomain: 'techpowerup.com',
    fieldCandidates: [
      { field: 'weight', value: '54g', confidence: 0.95 },
      { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
      { field: 'connection', value: 'Wireless', confidence: 0.98 },
      { field: 'lngth', value: '160', confidence: 0.90 },
      { field: 'width', value: '63.9', confidence: 0.90 },
      { field: 'height', value: '39.9', confidence: 0.90 },
    ],
  });
  const siblingSource = makeViperV3HyperSpeedSource({
    tier: 2,
    role: 'reviewer',
    host: 'www.rtings.com',
    rootDomain: 'rtings.com',
    url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-hyperspeed',
    title: 'Razer Viper V3 HyperSpeed Review - RTINGS.com',
  });

  const sourceResults = buildSourceSet(
    [proSource, noisyReviewer, siblingSource],
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const gate = evaluateIdentityGate(sourceResults);
  const report = buildIdentityReport({
    productId: 'mouse-razer-viper-v3-pro',
    runId: 'test-run',
    sourceResults,
    identityGate: gate,
  });

  assert.equal(gate.status, 'IDENTITY_CONFLICT');
  assert.equal(gate.contradictions.some((row) => row.conflict === 'size_class_conflict'), true);
  assert.equal(
    gate.acceptedConflictContributors?.every((row) => row.contributingConflicts?.includes('size_class_conflict')),
    true,
    `accepted conflict contributors should identify size_class_conflict â€” got ${JSON.stringify(gate.acceptedConflictContributors)}`
  );
  assert.deepEqual(
    (gate.acceptedConflictContributors || []).map((row) => row.url).sort(),
    [proSource.url, noisyReviewer.url].sort(),
  );
  assert.equal(gate.rejectedSiblingSources?.length, 1);
  assert.equal(gate.rejectedSiblingSources?.[0]?.candidateModel, 'Viper V3 HyperSpeed');
  assert.equal(gate.firstConflictTrigger?.conflict, 'size_class_conflict');
  assert.deepEqual(
    (gate.firstConflictTrigger?.contributors || []).map((row) => row.url).sort(),
    [proSource.url, noisyReviewer.url].sort(),
  );

  assert.equal(report.contradiction_count, 1);
  assert.equal(report.contradictions?.[0]?.conflict, 'size_class_conflict');
  assert.equal(report.accepted_exact_match_sources?.length, 2);
  assert.equal(report.accepted_conflict_contributors?.length, 2);
  assert.equal(report.rejected_sibling_sources?.length, 1);
  assert.equal(report.rejected_sibling_sources?.[0]?.candidate_model, 'Viper V3 HyperSpeed');
  assert.equal(report.first_conflict_trigger?.conflict, 'size_class_conflict');
});

test('IC-05: evaluateIdentityGate with correct sources produces validated=true', () => {
  const proSource = makeSource();
  const reviewer1 = makeReviewerSource();
  const reviewer2 = makeReviewerSource({
    url: 'https://www.techpowerup.com/review/razer-viper-v3-pro',
    rootDomain: 'techpowerup.com',
    host: 'www.techpowerup.com',
    title: 'Razer Viper V3 Pro Review - TechPowerUp',
  });

  const sourceResults = buildSourceSet(
    [proSource, reviewer1, reviewer2],
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const gate = evaluateIdentityGate(sourceResults);
  assert.equal(gate.validated, true, `Gate should validate with manufacturer + 2 reviewers — status=${gate.status}`);
  assert.equal(gate.status, 'CONFIRMED');
  assert.ok(gate.certainty >= 0.95, `Certainty should be >= 0.95, got ${gate.certainty}`);
});

// ── IC-07 (additional): deriveNeedSetIdentityState ───────────

test('IC-07: deriveNeedSetIdentityState returns locked for validated gate with high confidence', () => {
  const state = deriveNeedSetIdentityState({
    identityGate: { validated: true, reasonCodes: [] },
    identityConfidence: 0.97,
    identityLockThreshold: 0.95,
  });
  assert.equal(state, 'locked');
});

test('IC-07: deriveNeedSetIdentityState returns conflict when reasonCodes contain conflict', () => {
  const state = deriveNeedSetIdentityState({
    identityGate: {
      validated: false,
      status: 'IDENTITY_CONFLICT',
      reasonCodes: ['identity_conflict'],
    },
    identityConfidence: 0.65,
  });
  assert.equal(state, 'conflict');
});

// ── IC-06 (additional): resolveExtractionGateOpen ────────────

test('IC-06: resolveExtractionGateOpen returns false on IDENTITY_CONFLICT', () => {
  const open = resolveExtractionGateOpen({
    identityLock: IDENTITY_LOCK_VIPER_V3_PRO,
    identityGate: {
      validated: false,
      status: 'IDENTITY_CONFLICT',
      reasonCodes: ['identity_conflict'],
    },
  });
  assert.equal(open, false, 'Extraction gate should be closed on identity conflict');
});

test('IC-06: resolveExtractionGateOpen returns true when validated', () => {
  const open = resolveExtractionGateOpen({
    identityLock: IDENTITY_LOCK_VIPER_V3_PRO,
    identityGate: { validated: true, reasonCodes: [] },
  });
  assert.equal(open, true, 'Extraction gate should be open when identity validated');
});

// ── IC-02 (cross-source): buildIdentityCriticalContradictions ─

test('IC-02: Cross-source contradictions from variant pages should not appear after fix', () => {
  const proSource = evaluateAndAttachIdentity(
    makeSource({ rootDomain: 'razer.com' }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const v3Source = evaluateAndAttachIdentity(
    makeViperV3Source({ rootDomain: 'somestore.com', tier: 2, role: 'retailer' }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  if (v3Source.identity.match) {
    const contradictions = buildIdentityCriticalContradictions([proSource, v3Source]);
    assert.fail(
      `Viper V3 source should NOT match identity for Viper V3 Pro — ` +
      `match=${v3Source.identity.match}, score=${v3Source.identity.score}, ` +
      `contradictions would be: ${JSON.stringify(contradictions)}`
    );
  } else {
    assert.equal(v3Source.identity.match, false);
  }
});

// ── IC-01/IC-04: Lab-only validation (the REAL blocker) ─────

function makeLabSource(domain, overrides = {}) {
  return makeSource({
    url: `https://www.${domain}/review/razer-viper-v3-pro`,
    title: `Razer Viper V3 Pro Review - ${domain}`,
    host: `www.${domain}`,
    rootDomain: domain,
    role: 'review',
    tier: 1, // lab = tier 1
    ...overrides,
  });
}

test('IC-01: Gate validates with 2+ lab-tier sources when no manufacturer page was fetched', () => {
  // Real-world scenario: razer.com product page not fetched.
  // 5 lab-tier sources from different domains all confirm identity.
  const sources = [
    makeLabSource('rtings.com'),
    makeLabSource('techpowerup.com'),
    makeLabSource('tomshardware.com'),
    makeLabSource('lttlabs.com'),
    makeReviewerSource({ rootDomain: 'pcgamer.com', host: 'www.pcgamer.com', url: 'https://www.pcgamer.com/razer-viper-v3-pro-review' }),
  ];

  const sourceResults = buildSourceSet(sources, IDENTITY_LOCK_VIPER_V3_PRO);
  const gate = evaluateIdentityGate(sourceResults);

  // After fix: 2+ lab-tier sources from different domains should substitute
  // for missing manufacturer, allowing validation
  assert.equal(gate.validated, true,
    `Gate should validate with 2+ lab-tier sources from different domains — ` +
    `status=${gate.status}, hasManufacturer=${gate.requirements.hasManufacturer}, ` +
    `certainty=${gate.certainty}, reasonCodes=${JSON.stringify(gate.reasonCodes)}`);
  assert.equal(gate.status, 'CONFIRMED');
});

test('IC-04: Gate validates early with lab sources even without manufacturer', () => {
  // Minimal: 2 lab sources + 1 additional credible source, no manufacturer
  const sources = [
    makeLabSource('rtings.com'),
    makeLabSource('techpowerup.com'),
    makeReviewerSource({ rootDomain: 'pcgamer.com', host: 'www.pcgamer.com' }),
  ];

  const sourceResults = buildSourceSet(sources, IDENTITY_LOCK_VIPER_V3_PRO);
  const gate = evaluateIdentityGate(sourceResults);

  assert.equal(gate.validated, true,
    `Gate should validate with 2 lab sources + 1 reviewer — status=${gate.status}, ` +
    `reasonCodes=${JSON.stringify(gate.reasonCodes)}`);
});

test('IC-04: Gate does NOT validate with only 1 lab source and no manufacturer', () => {
  // 1 lab source alone should NOT substitute for manufacturer
  const sources = [
    makeLabSource('rtings.com'),
    makeReviewerSource({ rootDomain: 'pcgamer.com', host: 'www.pcgamer.com' }),
  ];

  const sourceResults = buildSourceSet(sources, IDENTITY_LOCK_VIPER_V3_PRO);
  const gate = evaluateIdentityGate(sourceResults);

  // 1 lab source should NOT be enough on its own to substitute for manufacturer
  assert.equal(gate.validated, false,
    `Gate should NOT validate with only 1 lab source — status=${gate.status}`);
});

// ── IC-07 (dimension tolerance): Borderline dimension diffs ──

test('IC-07: Outlier dimension values from comparison tables should NOT trigger conflict', () => {
  // Real-world: accepted sources extract correct length ~127mm, but one source
  // also picks up 115mm from a comparison table for a DIFFERENT product.
  // The outlier should be filtered by median-based logic.
  const correctSource1 = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'razer.com',
      role: 'manufacturer',
      tier: 1,
      fieldCandidates: [
        { field: 'lngth', value: '127.1', confidence: 0.9 },
        { field: 'height', value: '39.9', confidence: 0.9 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const correctSource2 = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'techpowerup.com',
      role: 'review',
      tier: 1,
      url: 'https://www.techpowerup.com/review/razer-viper-v3-pro/3.html',
      title: 'Razer Viper V3 Pro Review - Dimensions',
      host: 'www.techpowerup.com',
      fieldCandidates: [
        { field: 'lngth', value: '127.1', confidence: 0.9 },
        { field: 'height', value: '39.9', confidence: 0.9 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const outlierSource = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'techpowerup.com',
      role: 'review',
      tier: 1,
      url: 'https://www.techpowerup.com/review/razer-viper-v3-pro/',
      title: 'Razer Viper V3 Pro Review',
      host: 'www.techpowerup.com',
      fieldCandidates: [
        // Comparison table value from DIFFERENT product
        { field: 'lngth', value: '115', confidence: 0.85 },
        { field: 'height', value: '90', confidence: 0.7 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const contradictions = buildIdentityCriticalContradictions([correctSource1, correctSource2, outlierSource]);
  const hasDimConflict = contradictions.some((c) => c.conflict === 'size_class_conflict');

  assert.equal(hasDimConflict, false,
    `Outlier values (115mm, 90mm) from comparison tables should NOT trigger conflict — ` +
    `contradictions=${JSON.stringify(contradictions)}`);
});

test('IC-07: Width difference of 3.8mm between sources should NOT trigger dimension conflict', () => {
  // Real-world: techpowerup comparison chart has 63.7mm, 59.9mm → delta 3.8mm
  // This is a borderline case from actual runs
  const source1 = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'techpowerup.com',
      role: 'review',
      tier: 1,
      fieldCandidates: [
        { field: 'width', value: '63.7', confidence: 0.9 },
        { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
        { field: 'connection', value: 'Wireless', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );
  const source2 = evaluateAndAttachIdentity(
    makeSource({
      rootDomain: 'rtings.com',
      role: 'review',
      tier: 1,
      url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'Razer Viper V3 Pro Review',
      host: 'www.rtings.com',
      fieldCandidates: [
        { field: 'width', value: '59.9', confidence: 0.9 },
        { field: 'sensor', value: 'Focus Pro 36K', confidence: 0.92 },
        { field: 'connection', value: 'Wireless', confidence: 0.98 },
      ],
    }),
    IDENTITY_LOCK_VIPER_V3_PRO
  );

  const contradictions = buildIdentityCriticalContradictions([source1, source2]);
  const hasDimConflict = contradictions.some((c) => c.conflict === 'size_class_conflict');

  assert.equal(hasDimConflict, false,
    `3.8mm width difference should NOT trigger size_class_conflict — ` +
    `contradictions=${JSON.stringify(contradictions)}`);
});
