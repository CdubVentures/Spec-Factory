import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSourceEntryPatch,
  SOURCE_ENTRY_MUTABLE_KEYS,
} from '../src/features/indexing/sources/sourceFileService.js';

test('SOURCE_ENTRY_MUTABLE_KEYS is a frozen Set', () => {
  assert.ok(SOURCE_ENTRY_MUTABLE_KEYS instanceof Set);
  assert.ok(SOURCE_ENTRY_MUTABLE_KEYS.size > 0);
});

test('validateSourceEntryPatch', async (t) => {
  await t.test('accepts all schema-derived source entry keys', () => {
    const patch = {
      display_name: 'Test Source',
      tier: 'tier1_manufacturer',
      authority: 'manufacturer',
      base_url: 'https://example.com',
      content_types: ['html'],
      doc_kinds: ['spec_sheet'],
      crawl_config: { method: 'http' },
      field_coverage: { high: [], medium: [], low: [] },
      discovery: { method: 'search_first', enabled: true },
    };
    const result = validateSourceEntryPatch(patch);
    assert.deepEqual(result.rejected, {});
    for (const key of Object.keys(patch)) {
      assert.ok(
        Object.hasOwn(result.accepted, key),
        `expected "${key}" in accepted`,
      );
    }
  });

  await t.test('rejects dead legacy keys (enabled, notes, label, url, approved, source_type)', () => {
    const patch = {
      enabled: true,
      notes: 'test note',
      label: 'My Label',
      url: 'https://example.com/page',
      approved: true,
      source_type: 'manufacturer',
    };
    const result = validateSourceEntryPatch(patch);
    assert.deepEqual(result.accepted, {});
    for (const key of Object.keys(patch)) {
      assert.equal(result.rejected[key], 'unknown_key', `expected "${key}" to be rejected`);
    }
  });

  await t.test('rejects unknown keys with unknown_key reason', () => {
    const patch = {
      tier: 'tier2_lab',
      __proto_pollute__: 'bad',
      xss_payload: '<script>',
      randomField: 42,
    };
    const result = validateSourceEntryPatch(patch);
    assert.deepEqual(result.accepted, { tier: 'tier2_lab' });
    assert.equal(result.rejected.__proto_pollute__, 'unknown_key');
    assert.equal(result.rejected.xss_payload, 'unknown_key');
    assert.equal(result.rejected.randomField, 'unknown_key');
  });

  await t.test('rejects discovery when not an object', () => {
    const result = validateSourceEntryPatch({ discovery: 'not_object' });
    assert.equal(result.rejected.discovery, 'invalid_type_expected_object');
    assert.ok(!Object.hasOwn(result.accepted, 'discovery'));
  });

  await t.test('accepts discovery when it is an object', () => {
    const result = validateSourceEntryPatch({ discovery: { method: 'manual' } });
    assert.deepEqual(result.accepted.discovery, { method: 'manual' });
    assert.deepEqual(result.rejected, {});
  });

  await t.test('accepts discovery when undefined (key present, value undefined)', () => {
    const result = validateSourceEntryPatch({ discovery: undefined });
    // undefined discovery should pass through — it just means "no change"
    assert.ok(!result.rejected.discovery);
  });

  await t.test('rejects crawl_config when not an object', () => {
    const result = validateSourceEntryPatch({ crawl_config: 'string' });
    assert.equal(result.rejected.crawl_config, 'invalid_type_expected_object');
  });

  await t.test('rejects field_coverage when not an object', () => {
    const result = validateSourceEntryPatch({ field_coverage: [1, 2, 3] });
    assert.equal(result.rejected.field_coverage, 'invalid_type_expected_object');
  });

  await t.test('accepts field_coverage when it is a plain object', () => {
    const result = validateSourceEntryPatch({ field_coverage: { high: ['weight'] } });
    assert.deepEqual(result.accepted.field_coverage, { high: ['weight'] });
    assert.deepEqual(result.rejected, {});
  });

  await t.test('handles empty patch', () => {
    const result = validateSourceEntryPatch({});
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, {});
  });

  await t.test('handles null/undefined patch', () => {
    const result = validateSourceEntryPatch(null);
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, {});
  });

  await t.test('strips sourceId and host from body (identity keys)', () => {
    const result = validateSourceEntryPatch({
      sourceId: 'injected_id',
      host: 'injected.host',
      tier: 'tier2_lab',
    });
    assert.equal(result.rejected.sourceId, 'unknown_key');
    assert.equal(result.rejected.host, 'unknown_key');
    assert.deepEqual(result.accepted, { tier: 'tier2_lab' });
  });
});
