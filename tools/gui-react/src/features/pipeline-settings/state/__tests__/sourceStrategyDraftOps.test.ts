import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import {
  makeSourceStrategyDraft,
  updateDraftByPath,
  SOURCE_STRATEGY_DRAFT_FIELD_PATHS,
} from '../sourceEntryDerived.ts';

import {
  CRAWL_CONFIG_FIELD_KEYS,
  DISCOVERY_FIELD_KEYS,
  FIELD_COVERAGE_KEYS,
} from '../../../../../../../src/features/indexing/discovery/contracts/sourceEntryContract.js';

// -- Helpers --

function baseDraft() {
  return makeSourceStrategyDraft();
}

// -- updateDraftByPath --

describe('updateDraftByPath', () => {
  it('sets a top-level key', () => {
    const draft = baseDraft();
    const result = updateDraftByPath(draft, 'host', 'example.com');
    strictEqual(result.host, 'example.com');
  });

  it('sets a nested crawl_config key', () => {
    const draft = baseDraft();
    const result = updateDraftByPath(draft, 'crawl_config.method', 'playwright');
    strictEqual(result.crawl_config.method, 'playwright');
  });

  it('sets a nested discovery key', () => {
    const draft = baseDraft();
    const result = updateDraftByPath(draft, 'discovery.priority', '99');
    strictEqual(result.discovery.priority, '99');
  });

  it('sets a nested field_coverage key', () => {
    const draft = baseDraft();
    const result = updateDraftByPath(draft, 'field_coverage.high', 'weight,length');
    strictEqual(result.field_coverage.high, 'weight,length');
  });

  it('preserves sibling keys in the same nested group', () => {
    const draft = baseDraft();
    const original = draft.crawl_config.robots_txt_compliant;
    const result = updateDraftByPath(draft, 'crawl_config.method', 'playwright');
    strictEqual(result.crawl_config.robots_txt_compliant, original);
  });

  it('preserves other nested groups', () => {
    const draft = baseDraft();
    const originalDiscovery = draft.discovery;
    const result = updateDraftByPath(draft, 'crawl_config.method', 'playwright');
    deepStrictEqual(result.discovery, originalDiscovery);
  });

  it('preserves top-level keys when updating nested', () => {
    const draft = baseDraft();
    draft.host = 'test.com';
    const result = updateDraftByPath(draft, 'crawl_config.method', 'playwright');
    strictEqual(result.host, 'test.com');
  });

  it('returns a new object (immutable)', () => {
    const draft = baseDraft();
    const result = updateDraftByPath(draft, 'host', 'new.com');
    ok(result !== draft);
  });
});

// -- Contract alignment --

describe('SOURCE_STRATEGY_DRAFT_FIELD_PATHS contract alignment', () => {
  const pathSet = new Set(SOURCE_STRATEGY_DRAFT_FIELD_PATHS);

  it('includes all CRAWL_CONFIG_FIELD_KEYS as crawl_config.<key>', () => {
    const missing = CRAWL_CONFIG_FIELD_KEYS
      .map((k: string) => `crawl_config.${k}`)
      .filter((p: string) => !pathSet.has(p));
    deepStrictEqual(missing, [], `Missing crawl_config paths: ${missing.join(', ')}`);
  });

  it('includes all DISCOVERY_FIELD_KEYS as discovery.<key>', () => {
    const missing = DISCOVERY_FIELD_KEYS
      .map((k: string) => `discovery.${k}`)
      .filter((p: string) => !pathSet.has(p));
    deepStrictEqual(missing, [], `Missing discovery paths: ${missing.join(', ')}`);
  });

  it('includes all FIELD_COVERAGE_KEYS as field_coverage.<key>', () => {
    const missing = FIELD_COVERAGE_KEYS
      .map((k: string) => `field_coverage.${k}`)
      .filter((p: string) => !pathSet.has(p));
    deepStrictEqual(missing, [], `Missing field_coverage paths: ${missing.join(', ')}`);
  });

  it('includes all top-level draft fields', () => {
    const topLevel = ['host', 'display_name', 'tier', 'authority', 'base_url', 'content_types', 'doc_kinds'];
    const missing = topLevel.filter((k) => !pathSet.has(k));
    deepStrictEqual(missing, [], `Missing top-level paths: ${missing.join(', ')}`);
  });
});
