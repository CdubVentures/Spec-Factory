import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  makeIdentityLocked,
  makeIdentityUnlocked,
  makeBaseInput,
} from './helpers/needSetHarness.js';

// --- Test groups ---

describe('Phase 01 â€” Output Shape Verification (post-legacy-removal)', () => {
  it('no legacy fields present on output', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.needs, undefined, 'needs[] must not exist');
    assert.equal(result.needset_size, undefined, 'needset_size must not exist');
    assert.equal(result.reason_counts, undefined, 'reason_counts must not exist');
    assert.equal(result.required_level_counts, undefined, 'required_level_counts must not exist');
    assert.equal(result.snapshots, undefined, 'snapshots must not exist');
    assert.equal(result.identity_lock_state, undefined, 'identity_lock_state must not exist');
  });
});

describe('Phase 01 â€” Identity Context in Debug', () => {
  it('identityContext is preserved in debug.identity_context', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.debug.identity_context, 'debug.identity_context must exist');
    assert.equal(result.debug.identity_context.status, 'locked');
  });

  it('identity state NOT used for scoring â€” no score impact from identity status', () => {
    // Same field, same provenance, different identity statuses should produce same state
    const locked = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } },
      identityContext: makeIdentityLocked()
    }));
    const unlocked = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } },
      identityContext: makeIdentityUnlocked()
    }));
    const lockedRow = locked.rows.find((r) => r.field_key === 'weight');
    const unlockedRow = unlocked.rows.find((r) => r.field_key === 'weight');
    assert.ok(lockedRow, 'weight in locked result');
    assert.ok(unlockedRow, 'weight in unlocked result');
    assert.equal(lockedRow.state, unlockedRow.state, 'state should be same regardless of identity');
    assert.equal(lockedRow.priority_bucket, unlockedRow.priority_bucket, 'bucket should be same regardless of identity');
  });
});

describe('Phase 01 â€” Top-Level Output Shape', () => {
  it('debug section has expected fields', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.debug, 'debug must exist');
    assert.ok(Array.isArray(result.debug.suppressed_duplicate_rows), 'debug.suppressed_duplicate_rows must be array');
    assert.ok(result.debug.state_inputs !== undefined, 'debug.state_inputs must exist');
    assert.ok(Array.isArray(result.debug.bundle_assignment_notes), 'debug.bundle_assignment_notes must be array');
    assert.ok(result.debug.identity_context !== undefined, 'debug.identity_context must exist');
  });
});

describe('Phase 01 â€” NeedSet Event Payload Shape (via runtimeBridge)', () => {
  it('needset_computed event payload matches new NeedSet output shape', async () => {
    const { createAuditHarness, makeRunStartedEvent, makeNeedsetComputedEvent } = await import('./helpers/auditHarness.js');
    const harness = createAuditHarness();
    const bridge = await harness.setup();
    const runId = 'r_needset_event_test';

    await harness.feedEvents([
      makeRunStartedEvent(runId),
      makeNeedsetComputedEvent(runId, {
        total_fields: 60,
        fields: [
          { field_key: 'weight', required_level: 'required', state: 'missing', need_score: 10 }
        ],
        rows: [
          { field_key: 'weight', required_level: 'required', priority_bucket: 'core', state: 'missing', bundle_id: '' }
        ],
        focus_fields: ['weight'],
        bundles: [],
        summary: { core_unresolved: 1, secondary_unresolved: 0, optional_unresolved: 0, conflicts: 0, bundles_planned: 0 },
        blockers: { missing: 1, weak: 0, conflict: 0 },
        profile_mix: { manufacturer_html: 0, manual_pdf: 0, support_docs: 0, fallback_web: 0, targeted_single_field: 0 }
      })
    ]);

    const events = await harness.getEmittedEvents();
    const ncEvent = events.find((e) => e.event === 'needset_computed');
    assert.ok(ncEvent, 'needset_computed event should exist');

    const requiredPayloadKeys = [
      'total_fields', 'summary', 'blockers', 'focus_fields',
      'bundles', 'rows', 'needset_size', 'fields'
    ];
    const missing = requiredPayloadKeys.filter((k) => !(k in ncEvent.payload));
    assert.deepStrictEqual(missing, [], `needset_computed payload missing: ${missing.join(', ')}`);
    assert.equal(ncEvent.payload.total_fields, 60);
    // needset_size is backward-compat derived from rows.length
    assert.equal(ncEvent.payload.needset_size, 1);
    assert.equal(ncEvent.stage, 'index');

    await harness.cleanup();
  });

  it('runtimeBridge preserves identity in artifact via passthrough', async () => {
    const { createAuditHarness, makeRunStartedEvent, makeNeedsetComputedEvent } = await import('./helpers/auditHarness.js');
    const harness = createAuditHarness();
    await harness.setup();
    const runId = 'r_needset_identity_breakdown';

    await harness.feedEvents([
      makeRunStartedEvent(runId),
      makeNeedsetComputedEvent(runId, {
        total_fields: 10,
        rows: [],
        fields: [],
        focus_fields: [],
        bundles: [],
        identity: {
          state: 'conflict',

          confidence: 0.32,
          manufacturer: 'TestBrand',
          model: 'TestModel'
        }
      })
    ]);

    // WHY: Step 15 — mid-run artifact writes are SQL-only. Finalize
    // triggers the JSON write so getNeedSet() can read it from disk.
    await harness.getBridge().finalize({ status: 'completed' });

    const needsetArtifact = await harness.getNeedSet();
    assert.ok(needsetArtifact, 'needset artifact should be written');
    assert.equal(needsetArtifact.identity?.state, 'conflict');
    assert.equal(needsetArtifact.identity?.confidence, 0.32);

    await harness.cleanup();
  });
});

