import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRuntimeControlKey,
  resolveIndexingResumeKey,
  defaultRuntimeOverrides,
  normalizeRuntimeOverrides,
} from '../runtimeHelpers.js';

// --- resolveRuntimeControlKey ---

test('resolveRuntimeControlKey uses default path', () => {
  const storage = { resolveOutputKey: (...args) => args.join('/') };
  const result = resolveRuntimeControlKey(storage, {});
  assert.equal(result, '_runtime/control/runtime_overrides.json');
});

test('resolveRuntimeControlKey uses custom path', () => {
  const storage = { resolveOutputKey: (...args) => args.join('/') };
  const result = resolveRuntimeControlKey(storage, { runtimeControlFile: 'custom/path.json' });
  assert.equal(result, 'custom/path.json');
});

test('resolveRuntimeControlKey passes through fully qualified s3 prefix path', () => {
  const storage = { resolveOutputKey: (...args) => args.join('/') };
  const result = resolveRuntimeControlKey(storage, {
    runtimeControlFile: 'specs/outputs/control.json',
  });
  assert.equal(result, 'specs/outputs/control.json');
});

// --- resolveIndexingResumeKey ---

test('resolveIndexingResumeKey builds correct key', () => {
  const storage = { resolveOutputKey: (...args) => args.join('/') };
  const result = resolveIndexingResumeKey(storage, 'mouse', 'viper-v3');
  assert.equal(result, '_runtime/indexing_resume/mouse/viper-v3.json');
});

// --- defaultRuntimeOverrides ---

test('defaultRuntimeOverrides returns expected shape', () => {
  const d = defaultRuntimeOverrides();
  assert.equal(d.pause, false);
  assert.equal(d.max_urls_per_product, null);
  assert.equal(d.max_queries_per_product, null);
  assert.deepEqual(d.blocked_domains, []);
  assert.deepEqual(d.force_high_fields, []);
  assert.equal(d.disable_llm, false);
  assert.equal(d.disable_search, false);
  assert.equal(d.notes, '');
});

// --- normalizeRuntimeOverrides ---

test('normalizeRuntimeOverrides normalizes valid payload', () => {
  const result = normalizeRuntimeOverrides({
    pause: true,
    max_urls_per_product: '10',
    blocked_domains: ['www.example.com', 'TEST.COM', ''],
    force_high_fields: ['sensor', '', 'weight'],
    disable_llm: 1,
    notes: 'test note'
  });
  assert.equal(result.pause, true);
  assert.equal(result.max_urls_per_product, 10);
  assert.deepEqual(result.blocked_domains, ['example.com', 'test.com']);
  assert.deepEqual(result.force_high_fields, ['sensor', 'weight']);
  assert.equal(result.disable_llm, true);
  assert.equal(result.notes, 'test note');
});

test('normalizeRuntimeOverrides handles null/empty input', () => {
  const result = normalizeRuntimeOverrides();
  assert.equal(result.pause, false);
  assert.equal(result.max_urls_per_product, null);
  assert.deepEqual(result.blocked_domains, []);
});

test('normalizeRuntimeOverrides deduplicates blocked domains', () => {
  const result = normalizeRuntimeOverrides({
    blocked_domains: ['example.com', 'www.example.com', 'example.com']
  });
  assert.deepEqual(result.blocked_domains, ['example.com']);
});
