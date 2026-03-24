// WHY: Contract test for sourceEntryContract — the SSOT for source strategy
// shapes. Verifies the contract module correctly derives field keys, defaults,
// enum values, and mutable keys from the Zod schema.

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import {
  SOURCE_ENTRY_FIELD_KEYS,
  SOURCE_ENTRY_DEFAULTS,
  TIER_VALUES,
  AUTHORITY_VALUES,
  DISCOVERY_DEFAULTS,
  DISCOVERY_METHOD_VALUES,
  FIELD_COVERAGE_KEYS,
  sourceEntryMutableKeys,
} from '../sourceEntryContract.js';

describe('sourceEntryContract', () => {

  describe('SOURCE_ENTRY_FIELD_KEYS', () => {
    it('is a frozen non-empty array', () => {
      ok(Array.isArray(SOURCE_ENTRY_FIELD_KEYS));
      ok(SOURCE_ENTRY_FIELD_KEYS.length >= 10);
      ok(Object.isFrozen(SOURCE_ENTRY_FIELD_KEYS));
    });

    it('includes all canonical schema fields', () => {
      const expected = [
        'host', 'display_name', 'tier', 'authority', 'base_url',
        'content_types', 'doc_kinds', 'field_coverage', 'preferred_paths',
        'crawl_config', 'discovery', 'requires_js', 'connector_only', 'blocked_in_search',
        'synthetic', 'health',
      ];
      for (const key of expected) {
        ok(SOURCE_ENTRY_FIELD_KEYS.includes(key), `missing field key: ${key}`);
      }
    });

    it('has no duplicates', () => {
      const unique = new Set(SOURCE_ENTRY_FIELD_KEYS);
      strictEqual(unique.size, SOURCE_ENTRY_FIELD_KEYS.length);
    });
  });

  describe('TIER_VALUES', () => {
    it('is a frozen non-empty array', () => {
      ok(Array.isArray(TIER_VALUES));
      ok(TIER_VALUES.length >= 5);
      ok(Object.isFrozen(TIER_VALUES));
    });

    it('includes expected tiers', () => {
      ok(TIER_VALUES.includes('tier1_manufacturer'));
      ok(TIER_VALUES.includes('tier2_lab'));
      ok(TIER_VALUES.includes('tier3_retailer'));
    });
  });

  describe('AUTHORITY_VALUES', () => {
    it('is a frozen non-empty array', () => {
      ok(Array.isArray(AUTHORITY_VALUES));
      ok(AUTHORITY_VALUES.length >= 4);
      ok(Object.isFrozen(AUTHORITY_VALUES));
    });

    it('includes expected authorities', () => {
      ok(AUTHORITY_VALUES.includes('authoritative'));
      ok(AUTHORITY_VALUES.includes('unknown'));
    });
  });

  describe('SOURCE_ENTRY_DEFAULTS', () => {
    it('is a frozen object', () => {
      ok(SOURCE_ENTRY_DEFAULTS && typeof SOURCE_ENTRY_DEFAULTS === 'object');
      ok(Object.isFrozen(SOURCE_ENTRY_DEFAULTS));
    });

    it('has correct default values', () => {
      strictEqual(SOURCE_ENTRY_DEFAULTS.display_name, '');
      strictEqual(SOURCE_ENTRY_DEFAULTS.authority, 'unknown');
      strictEqual(SOURCE_ENTRY_DEFAULTS.base_url, '');
      strictEqual(SOURCE_ENTRY_DEFAULTS.requires_js, false);
      strictEqual(SOURCE_ENTRY_DEFAULTS.connector_only, false);
      strictEqual(SOURCE_ENTRY_DEFAULTS.synthetic, false);
      strictEqual(SOURCE_ENTRY_DEFAULTS.blocked_in_search, false);
      deepStrictEqual(SOURCE_ENTRY_DEFAULTS.content_types, []);
      deepStrictEqual(SOURCE_ENTRY_DEFAULTS.doc_kinds, []);
      strictEqual(SOURCE_ENTRY_DEFAULTS.health, null);
      strictEqual(SOURCE_ENTRY_DEFAULTS.crawl_config, null);
    });
  });

  describe('DISCOVERY_DEFAULTS', () => {
    it('is a frozen object', () => {
      ok(DISCOVERY_DEFAULTS && typeof DISCOVERY_DEFAULTS === 'object');
      ok(Object.isFrozen(DISCOVERY_DEFAULTS));
    });

    it('has required keys', () => {
      ok('method' in DISCOVERY_DEFAULTS);
      ok('priority' in DISCOVERY_DEFAULTS);
      ok('enabled' in DISCOVERY_DEFAULTS);
    });
  });

  describe('DISCOVERY_METHOD_VALUES', () => {
    it('includes expected methods', () => {
      ok(DISCOVERY_METHOD_VALUES.includes('manual'));
      ok(DISCOVERY_METHOD_VALUES.includes('search_first'));
    });
  });

  describe('FIELD_COVERAGE_KEYS', () => {
    it('includes high, medium, low', () => {
      ok(FIELD_COVERAGE_KEYS.includes('high'));
      ok(FIELD_COVERAGE_KEYS.includes('medium'));
      ok(FIELD_COVERAGE_KEYS.includes('low'));
    });
  });

  describe('sourceEntryMutableKeys', () => {
    it('returns a Set', () => {
      const keys = sourceEntryMutableKeys();
      ok(keys instanceof Set);
      ok(keys.size > 0);
    });

    it('includes editable fields', () => {
      const keys = sourceEntryMutableKeys();
      ok(keys.has('display_name'));
      ok(keys.has('tier'));
      ok(keys.has('authority'));
      ok(keys.has('base_url'));
      ok(keys.has('content_types'));
      ok(keys.has('doc_kinds'));
      ok(keys.has('field_coverage'));
    });

    it('excludes non-mutable fields', () => {
      const keys = sourceEntryMutableKeys();
      ok(!keys.has('host'), 'host should not be mutable');
      ok(!keys.has('health'), 'health should not be mutable');
      ok(!keys.has('synthetic'), 'synthetic should not be mutable');
    });
  });
});
