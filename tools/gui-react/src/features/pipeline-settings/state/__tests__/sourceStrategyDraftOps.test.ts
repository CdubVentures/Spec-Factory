import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';

import {
  defaultSourceFormEntry,
  updateFormEntryByPath,
  entryToFormEntry,
  formEntryToPayload,
  resolveSourceHost,
  SOURCE_FORM_ENTRY_FIELD_PATHS,
  type SourceEntry,
} from '../sourceEntryDerived.ts';

import {
  CRAWL_CONFIG_FIELD_KEYS,
  DISCOVERY_FIELD_KEYS,
  FIELD_COVERAGE_KEYS,
} from '../../../../../../../src/features/indexing/pipeline/shared/contracts/sourceEntryContract.js';

// -- Helpers --

function baseEntry(): SourceFormEntry {
  return defaultSourceFormEntry();
}

function fullSourceEntry(): SourceEntry {
  return {
    sourceId: 'example_com',
    display_name: 'Example',
    tier: 'tier1_official',
    authority: 'manufacturer',
    base_url: 'https://example.com',
    content_types: ['review', 'spec_sheet'],
    doc_kinds: ['product_page'],
    crawl_config: {
      method: 'playwright',
      rate_limit_ms: 3000,
      timeout_ms: 15000,
      max_concurrent: 8,
      robots_txt_compliant: false,
    },
    field_coverage: {
      high: ['weight', 'dimensions'],
      medium: ['color'],
      low: ['battery'],
    },
    discovery: {
      method: 'search_first',
      source_type: 'lab_review',
      search_pattern: '{brand} {model} review',
      priority: 75,
      enabled: false,
      notes: 'Test notes',
    },
  };
}

// -- updateFormEntryByPath --

describe('updateFormEntryByPath', () => {
  it('sets a top-level string key', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'host', 'example.com');
    strictEqual(result.host, 'example.com');
  });

  it('sets a nested crawl_config key', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'crawl_config.method', 'playwright');
    strictEqual(result.crawl_config.method, 'playwright');
  });

  it('sets a nested discovery number key', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'discovery.priority', 99);
    strictEqual(result.discovery.priority, 99);
  });

  it('sets a nested field_coverage array key', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'field_coverage.high', ['weight', 'length']);
    deepStrictEqual(result.field_coverage.high, ['weight', 'length']);
  });

  it('sets a boolean key', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'crawl_config.robots_txt_compliant', false);
    strictEqual(result.crawl_config.robots_txt_compliant, false);
  });

  it('preserves sibling keys in the same nested group', () => {
    const entry = baseEntry();
    const original = entry.crawl_config.robots_txt_compliant;
    const result = updateFormEntryByPath(entry, 'crawl_config.method', 'playwright');
    strictEqual(result.crawl_config.robots_txt_compliant, original);
  });

  it('preserves other nested groups', () => {
    const entry = baseEntry();
    const originalDiscovery = entry.discovery;
    const result = updateFormEntryByPath(entry, 'crawl_config.method', 'playwright');
    deepStrictEqual(result.discovery, originalDiscovery);
  });

  it('returns a new object (immutable)', () => {
    const entry = baseEntry();
    const result = updateFormEntryByPath(entry, 'host', 'new.com');
    ok(result !== entry);
  });
});

// -- entryToFormEntry --

describe('entryToFormEntry', () => {
  it('copies typed values without stringification', () => {
    const entry = fullSourceEntry();
    const form = entryToFormEntry(entry);
    strictEqual(form.crawl_config.rate_limit_ms, 3000);
    strictEqual(form.crawl_config.robots_txt_compliant, false);
    strictEqual(form.discovery.priority, 75);
    strictEqual(form.discovery.enabled, false);
    deepStrictEqual(form.content_types, ['review', 'spec_sheet']);
  });

  it('derives host from base_url', () => {
    const entry = fullSourceEntry();
    const form = entryToFormEntry(entry);
    strictEqual(form.host, 'example.com');
  });

  it('falls back to sourceId for host when base_url is empty', () => {
    const entry = fullSourceEntry();
    entry.base_url = '';
    entry.sourceId = 'test_example_com';
    const form = entryToFormEntry(entry);
    strictEqual(form.host, 'test.example.com');
  });

  it('provides defaults for missing nested fields', () => {
    const entry = fullSourceEntry();
    // @ts-expect-error — testing missing crawl_config
    entry.crawl_config = undefined;
    const form = entryToFormEntry(entry);
    strictEqual(form.crawl_config.rate_limit_ms, 2000);
    strictEqual(form.crawl_config.robots_txt_compliant, true);
  });
});

// -- formEntryToPayload --

describe('formEntryToPayload', () => {
  it('passes through typed values without conversion', () => {
    const form = entryToFormEntry(fullSourceEntry());
    const payload = formEntryToPayload(form);
    strictEqual(payload.crawl_config?.rate_limit_ms, 3000);
    strictEqual(payload.crawl_config?.robots_txt_compliant, false);
    strictEqual(payload.discovery?.priority, 75);
    deepStrictEqual(payload.content_types, ['review', 'spec_sheet']);
  });

  it('falls back display_name to host when empty', () => {
    const form = defaultSourceFormEntry();
    form.host = 'test.com';
    form.display_name = '';
    const payload = formEntryToPayload(form);
    strictEqual(payload.display_name, 'test.com');
  });

  it('falls back base_url to https://{host} when empty', () => {
    const form = defaultSourceFormEntry();
    form.host = 'test.com';
    form.base_url = '';
    const payload = formEntryToPayload(form);
    strictEqual(payload.base_url, 'https://test.com');
  });
});

// -- resolveSourceHost --

describe('resolveSourceHost', () => {
  it('extracts hostname from valid URL', () => {
    strictEqual(resolveSourceHost('https://example.com/path', 'fallback'), 'example.com');
  });

  it('returns fallback for empty string', () => {
    strictEqual(resolveSourceHost('', 'fallback'), 'fallback');
  });

  it('returns fallback for invalid URL', () => {
    strictEqual(resolveSourceHost('not-a-url', 'fallback'), 'fallback');
  });
});

// -- Contract alignment --

describe('SOURCE_FORM_ENTRY_FIELD_PATHS contract alignment', () => {
  const pathSet = new Set(SOURCE_FORM_ENTRY_FIELD_PATHS);

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

  it('includes all top-level form fields', () => {
    const topLevel = ['host', 'display_name', 'tier', 'authority', 'base_url', 'content_types', 'doc_kinds'];
    const missing = topLevel.filter((k) => !pathSet.has(k));
    deepStrictEqual(missing, [], `Missing top-level paths: ${missing.join(', ')}`);
  });
});
