import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveAlias,
  resolveTotalFields,
  resolveResultCount,
  resolveSearchQuery,
  normalizeLlmUsage,
  resolveUrl,
  resolveFieldCandidates,
  resolveMetaPath,
} from '../payloadAliases.js';

import { toInt } from '../valueNormalizers.js';
import { toArray } from '../../features/indexing/api/builders/runtimeOpsEventPrimitives.js';

// ---------------------------------------------------------------------------
// resolveAlias — generic resolution
// ---------------------------------------------------------------------------

test('resolveAlias: returns canonical key value when present', () => {
  assert.equal(resolveAlias({ total_fields: 10 }, 'total_fields', ['field_count']), 10);
});

test('resolveAlias: falls back to first alias when canonical missing', () => {
  assert.equal(resolveAlias({ field_count: 7 }, 'total_fields', ['field_count', 'needset_size']), 7);
});

test('resolveAlias: falls back to second alias when both canonical and first missing', () => {
  assert.equal(resolveAlias({ needset_size: 5 }, 'total_fields', ['field_count', 'needset_size']), 5);
});

test('resolveAlias: returns undefined when all keys missing', () => {
  assert.equal(resolveAlias({ other: 1 }, 'total_fields', ['field_count']), undefined);
});

test('resolveAlias: preserves 0 as a valid value', () => {
  assert.equal(resolveAlias({ total_fields: 0 }, 'total_fields', ['field_count']), 0);
});

test('resolveAlias: preserves false as a valid value', () => {
  assert.equal(resolveAlias({ flag: false }, 'flag', ['alt_flag']), false);
});

test('resolveAlias: preserves empty string as a valid value', () => {
  assert.equal(resolveAlias({ name: '' }, 'name', ['alt_name']), '');
});

test('resolveAlias: returns undefined for null obj', () => {
  assert.equal(resolveAlias(null, 'key', ['alt']), undefined);
});

test('resolveAlias: returns undefined for undefined obj', () => {
  assert.equal(resolveAlias(undefined, 'key', ['alt']), undefined);
});

// ---------------------------------------------------------------------------
// resolveTotalFields — NeedSet cardinality
// ---------------------------------------------------------------------------

test('resolveTotalFields: prefers total_fields', () => {
  assert.equal(resolveTotalFields({ total_fields: 10, field_count: 7 }), 10);
});

test('resolveTotalFields: falls back to field_count', () => {
  assert.equal(resolveTotalFields({ field_count: 7, needset_size: 5 }), 7);
});

test('resolveTotalFields: falls back to needset_size', () => {
  assert.equal(resolveTotalFields({ needset_size: 5 }), 5);
});

test('resolveTotalFields: uses fallback when all missing', () => {
  assert.equal(resolveTotalFields({}, 99), 99);
});

test('resolveTotalFields: preserves 0 as a valid total_fields value', () => {
  assert.equal(resolveTotalFields({ total_fields: 0 }, 99), 0);
});

// ---------------------------------------------------------------------------
// resolveResultCount — search event cardinality
// ---------------------------------------------------------------------------

test('resolveResultCount: prefers result_count', () => {
  assert.equal(resolveResultCount({ result_count: 10, results_count: 7 }), 10);
});

test('resolveResultCount: falls back to results_count', () => {
  assert.equal(resolveResultCount({ results_count: 7 }), 7);
});

test('resolveResultCount: uses results array length as last resort', () => {
  assert.equal(resolveResultCount({ results: ['a', 'b', 'c'] }), 3);
});

test('resolveResultCount: returns 0 when all missing', () => {
  assert.equal(resolveResultCount({}), 0);
});

// ---------------------------------------------------------------------------
// resolveSearchQuery — event payload query resolution
// ---------------------------------------------------------------------------

test('resolveSearchQuery: prefers row.query', () => {
  assert.equal(resolveSearchQuery({ query: 'row-q' }, { query: 'p-q' }), 'row-q');
});

test('resolveSearchQuery: falls back to payload.query', () => {
  assert.equal(resolveSearchQuery({}, { query: 'p-q' }), 'p-q');
});

test('resolveSearchQuery: falls back to payload.search_query', () => {
  assert.equal(resolveSearchQuery({}, { search_query: 'sq' }), 'sq');
});

test('resolveSearchQuery: falls back to payload.searchQuery', () => {
  assert.equal(resolveSearchQuery({}, { searchQuery: 'cq' }), 'cq');
});

test('resolveSearchQuery: returns empty string when all missing', () => {
  assert.equal(resolveSearchQuery({}, {}), '');
});

test('resolveSearchQuery: trims whitespace', () => {
  assert.equal(resolveSearchQuery({ query: '  padded  ' }, {}), 'padded');
});

// ---------------------------------------------------------------------------
// normalizeLlmUsage — cross-provider token normalization
// ---------------------------------------------------------------------------

test('normalizeLlmUsage: reads OpenAI naming', () => {
  const result = normalizeLlmUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, toInt);
  assert.equal(result.prompt_tokens, 100);
  assert.equal(result.completion_tokens, 50);
  assert.equal(result.total_tokens, 150);
});

test('normalizeLlmUsage: falls back to Gemini naming', () => {
  const result = normalizeLlmUsage({ input_tokens: 80, output_tokens: 40, total_tokens: 120 }, toInt);
  assert.equal(result.prompt_tokens, 80);
  assert.equal(result.completion_tokens, 40);
  assert.equal(result.total_tokens, 120);
});

test('normalizeLlmUsage: handles mixed naming', () => {
  const result = normalizeLlmUsage({ prompt_tokens: 100, output_tokens: 40, total_tokens: 140 }, toInt);
  assert.equal(result.prompt_tokens, 100);
  assert.equal(result.completion_tokens, 40);
});

test('normalizeLlmUsage: returns all zeros for null usage', () => {
  const result = normalizeLlmUsage(null, toInt);
  assert.deepStrictEqual(result, { prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, total_tokens: 0 });
});

test('normalizeLlmUsage: returns all zeros for undefined usage', () => {
  const result = normalizeLlmUsage(undefined, toInt);
  assert.deepStrictEqual(result, { prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, total_tokens: 0 });
});

test('normalizeLlmUsage: handles cached token aliases', () => {
  const result = normalizeLlmUsage({ cached_input_tokens: 25, total_tokens: 0 }, toInt);
  assert.equal(result.cached_prompt_tokens, 25);
});

test('normalizeLlmUsage: reads OpenAI prompt_tokens_details.cached_tokens (nested)', () => {
  const usage = {
    prompt_tokens: 2000,
    completion_tokens: 300,
    total_tokens: 2300,
    prompt_tokens_details: { cached_tokens: 1800 },
  };
  const result = normalizeLlmUsage(usage, toInt);
  assert.equal(result.cached_prompt_tokens, 1800);
  assert.equal(result.prompt_tokens, 2000);
  assert.equal(result.completion_tokens, 300);
});

test('normalizeLlmUsage: reads Anthropic cache_read_input_tokens', () => {
  const usage = {
    input_tokens: 200,
    output_tokens: 500,
    cache_read_input_tokens: 1800,
    cache_creation_input_tokens: 0,
  };
  const result = normalizeLlmUsage(usage, toInt);
  assert.equal(result.cached_prompt_tokens, 1800);
  assert.equal(result.completion_tokens, 500);
});

test('normalizeLlmUsage: reads DeepSeek prompt_cache_hit_tokens', () => {
  const usage = {
    prompt_tokens: 2500,
    completion_tokens: 400,
    prompt_cache_hit_tokens: 2100,
    prompt_cache_miss_tokens: 400,
    total_tokens: 2900,
  };
  const result = normalizeLlmUsage(usage, toInt);
  assert.equal(result.cached_prompt_tokens, 2100);
});

test('normalizeLlmUsage: prefers direct cached_prompt_tokens over nested details (back-compat)', () => {
  const usage = {
    prompt_tokens: 2000,
    cached_prompt_tokens: 500,
    prompt_tokens_details: { cached_tokens: 1800 },
  };
  const result = normalizeLlmUsage(usage, toInt);
  assert.equal(result.cached_prompt_tokens, 500);
});

test('normalizeLlmUsage: returns 0 when prompt_tokens_details is malformed', () => {
  const usage = { prompt_tokens: 2000, prompt_tokens_details: null };
  const result = normalizeLlmUsage(usage, toInt);
  assert.equal(result.cached_prompt_tokens, 0);
});

// ---------------------------------------------------------------------------
// resolveUrl — source_url / url / href resolution
// ---------------------------------------------------------------------------

test('resolveUrl: prefers source_url', () => {
  assert.equal(resolveUrl({ source_url: 'https://a.com', url: 'https://b.com' }), 'https://a.com');
});

test('resolveUrl: falls back to url', () => {
  assert.equal(resolveUrl({ url: 'https://b.com', href: 'https://c.com' }), 'https://b.com');
});

test('resolveUrl: falls back to href', () => {
  assert.equal(resolveUrl({ href: 'https://c.com' }), 'https://c.com');
});

test('resolveUrl: returns empty string when all missing', () => {
  assert.equal(resolveUrl({}), '');
});

test('resolveUrl: trims whitespace', () => {
  assert.equal(resolveUrl({ url: '  https://a.com  ' }), 'https://a.com');
});

// ---------------------------------------------------------------------------
// resolveFieldCandidates — LLM extraction response casing
// ---------------------------------------------------------------------------

test('resolveFieldCandidates: reads camelCase fieldCandidates', () => {
  const items = [{ field: 'brand', value: 'Sony' }];
  assert.deepStrictEqual(resolveFieldCandidates({ fieldCandidates: items }, toArray), items);
});

test('resolveFieldCandidates: falls back to snake_case field_candidates', () => {
  const items = [{ field: 'model', value: 'WH-1000XM5' }];
  assert.deepStrictEqual(resolveFieldCandidates({ field_candidates: items }, toArray), items);
});

test('resolveFieldCandidates: returns empty array when neither present', () => {
  assert.deepStrictEqual(resolveFieldCandidates({}, toArray), []);
});

// ---------------------------------------------------------------------------
// resolveMetaPath — camelCase / snake_case metadata keys
// ---------------------------------------------------------------------------

test('resolveMetaPath: prefers snake_case key', () => {
  assert.equal(resolveMetaPath({ run_base: '/a', runBase: '/b' }, 'run_base', 'runBase'), '/a');
});

test('resolveMetaPath: falls back to camelCase key', () => {
  assert.equal(resolveMetaPath({ runBase: '/b' }, 'run_base', 'runBase'), '/b');
});

test('resolveMetaPath: returns empty string when both missing', () => {
  assert.equal(resolveMetaPath({}, 'run_base', 'runBase'), '');
});
