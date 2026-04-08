// ── Override Workflow Characterization Tests ──────────────────────────────────
//
// WHY: Lock down current behavior before Phase 4 flip (Overlap 0d).
// These capture the exact write/read patterns that will change:
// 1. finalizeOverrides writes per-product disk file with review_time_seconds, runtime_gate
// 2. setOverrideFromCandidate reads from SQL (readOverrideFile) before merge
// 3. Return shapes include override_path pointing to per-product file
//
// After Phase 4, JSON SSOT writes replace per-product files and SQL-based reads.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  setOverrideFromCandidate,
  setManualOverride,
  finalizeOverrides,
} from '../overrideWorkflow.js';
import {
  resolveConsolidatedOverridePath,
  readProductFromConsolidated,
} from '../../../../shared/consolidatedOverrides.js';

import {
  createReviewOverrideHarness,
  seedFieldRulesArtifacts,
  seedReviewCandidates,
  seedLatestArtifacts,
  readOverridePayload,
} from './helpers/reviewOverrideHarness.js';

// ── setOverrideFromCandidate characterization ─────────────────────────────────

describe('characterization: setOverrideFromCandidate', () => {
  test('returns override_path pointing to consolidated file', async (t) => {
    const h = await createReviewOverrideHarness(t);
    await seedReviewCandidates(h);

    const result = await setOverrideFromCandidate({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      field: 'weight',
      candidateId: 'cand_1',
      specDb: h.specDb,
    });

    const expectedPath = resolveConsolidatedOverridePath({
      config: h.config,
      category: h.category,
    });
    assert.equal(result.override_path, expectedPath);
    assert.equal(result.field, 'weight');
    assert.ok(result.value);
  });

  test('persists override to consolidated JSON SSOT', async (t) => {
    const h = await createReviewOverrideHarness(t);
    await seedReviewCandidates(h);

    await setOverrideFromCandidate({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      field: 'weight',
      candidateId: 'cand_1',
      specDb: h.specDb,
    });

    const payload = await readOverridePayload(h);
    assert.ok(payload.overrides.weight, 'JSON SSOT should have weight override');
    assert.equal(payload.overrides.weight.override_source, 'candidate_selection');
  });
});

// ── setManualOverride characterization ────────────────────────────────────────

describe('characterization: setManualOverride', () => {
  test('returns override_path pointing to consolidated file', async (t) => {
    const h = await createReviewOverrideHarness(t);

    const result = await setManualOverride({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      field: 'weight',
      value: '63g',
      evidence: {
        url: 'https://example.com/spec',
        quote: 'Weight: 63g',
      },
      specDb: h.specDb,
    });

    const expectedPath = resolveConsolidatedOverridePath({
      config: h.config,
      category: h.category,
    });
    assert.equal(result.override_path, expectedPath);
    assert.equal(result.field, 'weight');
    assert.equal(result.value, '63g');
  });
});

// ── finalizeOverrides characterization ────────────────────────────────────────

describe('characterization: finalizeOverrides', () => {
  test('writes consolidated JSON with finalize metadata', async (t) => {
    const h = await createReviewOverrideHarness(t);
    await seedFieldRulesArtifacts(h);
    await seedReviewCandidates(h);
    await seedLatestArtifacts(h);

    await setOverrideFromCandidate({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      field: 'weight',
      candidateId: 'cand_1',
      specDb: h.specDb,
    });

    const result = await finalizeOverrides({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      applyOverrides: true,
      specDb: h.specDb,
    });

    assert.equal(result.applied, true);
    assert.ok(result.override_count > 0);

    // WHY: Overlap 0d — verify consolidated file has finalize metadata
    const entry = await readProductFromConsolidated({
      config: h.config,
      category: h.category,
      productId: h.productId,
    });
    assert.ok(entry, 'consolidated file should have product entry');
    assert.ok(entry.review_status === 'approved' || entry.review_status === 'draft');
    assert.ok(entry.overrides);
    assert.ok(entry.overrides.weight, 'consolidated entry should include weight override');
    assert.ok(entry.review_time_seconds !== undefined, 'should include review_time_seconds');
    assert.ok(entry.runtime_gate, 'should include runtime_gate');
  });

  test('captures review_status in consolidated JSON after finalize', async (t) => {
    const h = await createReviewOverrideHarness(t);
    await seedFieldRulesArtifacts(h);
    await seedReviewCandidates(h);
    await seedLatestArtifacts(h);

    await setOverrideFromCandidate({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      field: 'weight',
      candidateId: 'cand_1',
      specDb: h.specDb,
    });

    await finalizeOverrides({
      storage: h.storage,
      config: h.config,
      category: h.category,
      productId: h.productId,
      applyOverrides: true,
      specDb: h.specDb,
    });

    const payload = await readOverridePayload(h);
    assert.ok(payload, 'consolidated JSON should have product entry');
    assert.ok(
      payload.review_status === 'approved' || payload.review_status === 'draft' || payload.review_status === 'in_progress',
      'review_status should be set in JSON SSOT'
    );
  });
});
