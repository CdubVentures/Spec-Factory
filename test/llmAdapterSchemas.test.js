/**
 * Contract tests for LLM adapter Zod schemas.
 *
 * Each LLM adapter defines a Zod schema as SSOT for the structured output
 * contract, then derives JSON Schema via toJSONSchema() for the LLM API.
 * These tests verify both the Zod validation and the JSON Schema output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { serpSelectorOutputZodSchema } from '../src/features/indexing/discovery/serpSelector.js';
import { brandResolverLlmResponseSchema } from '../src/features/indexing/discovery/discoveryLlmAdapters.js';
import { plannerResponseZodSchema } from '../src/indexlab/searchPlanBuilder.js';
import { queryEnhancerResponseZodSchema } from '../src/research/queryPlanner.js';
import { enumConsistencyResponseZodSchema } from '../src/features/indexing/validation/validateEnumConsistency.js';
import { componentMatchResponseZodSchema } from '../src/features/indexing/validation/validateComponentMatches.js';
import { candidateValidatorResponseZodSchema } from '../src/features/indexing/validation/validateCandidatesLLM.js';
import { extractionModelResponseZodSchema } from '../src/features/indexing/extraction/invokeExtractionModel.js';
import { summaryLlmResponseZodSchema } from '../src/features/indexing/orchestration/finalize/writeSummaryLLM.js';
import { healthCheckResponseZodSchema } from '../src/core/llm/client/healthCheck.js';
import { sourceResponseZodSchema } from '../src/testing/testDataProvider.js';

import { toJSONSchema } from 'zod';

// ---------------------------------------------------------------------------
// Helper: verify JSON Schema output structure
// ---------------------------------------------------------------------------

function assertJsonSchemaOutput(zodSchema, expectedProperties, expectedRequired) {
  const { $schema: _, ...jsonSchema } = toJSONSchema(zodSchema);
  assert.equal(jsonSchema.$schema, undefined, 'stripped output should not have $schema');
  assert.equal(jsonSchema.type, 'object');
  for (const prop of expectedProperties) {
    assert.ok(jsonSchema.properties[prop], `should have property: ${prop}`);
  }
  assert.deepEqual((jsonSchema.required || []).sort(), expectedRequired.sort());
}

// ---------------------------------------------------------------------------
// #1 SERP Selector
// ---------------------------------------------------------------------------

test('serpSelectorOutputZodSchema — accepts valid response', () => {
  const result = serpSelectorOutputZodSchema.safeParse({ keep_ids: ['c_0', 'c_3'] });
  assert.equal(result.success, true);
});

test('serpSelectorOutputZodSchema — rejects non-array keep_ids', () => {
  const result = serpSelectorOutputZodSchema.safeParse({ keep_ids: 'not-array' });
  assert.equal(result.success, false);
});

test('serpSelectorOutputZodSchema — JSON Schema has correct structure', () => {
  assertJsonSchemaOutput(serpSelectorOutputZodSchema, ['keep_ids'], ['keep_ids']);
});

// ---------------------------------------------------------------------------
// #2 Brand Resolver
// ---------------------------------------------------------------------------

test('brandResolverLlmResponseSchema — accepts valid response', () => {
  const result = brandResolverLlmResponseSchema.safeParse({
    official_domain: 'razer.com', confidence: 0.95,
  });
  assert.equal(result.success, true);
});

test('brandResolverLlmResponseSchema — rejects missing official_domain', () => {
  const result = brandResolverLlmResponseSchema.safeParse({ confidence: 0.9 });
  assert.equal(result.success, false);
});

test('brandResolverLlmResponseSchema — JSON Schema has description on confidence', () => {
  const { $schema, ...jsonSchema } = toJSONSchema(brandResolverLlmResponseSchema);
  assert.ok(jsonSchema.properties.confidence.description);
  assert.deepEqual(jsonSchema.required.sort(), ['confidence', 'official_domain']);
});

// ---------------------------------------------------------------------------
// #3 Planner Response
// ---------------------------------------------------------------------------

test('plannerResponseZodSchema — accepts valid response', () => {
  const result = plannerResponseZodSchema.safeParse({
    planner_confidence: 0.8,
    groups: [{ key: 'sensor' }],
  });
  assert.equal(result.success, true);
});

test('plannerResponseZodSchema — accepts empty groups', () => {
  const result = plannerResponseZodSchema.safeParse({ groups: [] });
  assert.equal(result.success, true);
});

test('plannerResponseZodSchema — JSON Schema has groups property', () => {
  assertJsonSchemaOutput(plannerResponseZodSchema, ['planner_confidence', 'groups'], []);
});

// ---------------------------------------------------------------------------
// #4 Query Enhancer
// ---------------------------------------------------------------------------

test('queryEnhancerResponseZodSchema — accepts valid response', () => {
  const result = queryEnhancerResponseZodSchema.safeParse({
    enhanced_queries: [{ index: 0, query: 'razer viper v3 specs' }],
  });
  assert.equal(result.success, true);
});

test('queryEnhancerResponseZodSchema — rejects missing enhanced_queries', () => {
  const result = queryEnhancerResponseZodSchema.safeParse({});
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #5 Enum Consistency
// ---------------------------------------------------------------------------

test('enumConsistencyResponseZodSchema — accepts valid response', () => {
  const result = enumConsistencyResponseZodSchema.safeParse({
    decisions: [{ value: 'Optical', decision: 'keep_new' }],
  });
  assert.equal(result.success, true);
});

test('enumConsistencyResponseZodSchema — rejects invalid decision enum', () => {
  const result = enumConsistencyResponseZodSchema.safeParse({
    decisions: [{ value: 'Optical', decision: 'INVALID' }],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #6 Component Match
// ---------------------------------------------------------------------------

test('componentMatchResponseZodSchema — accepts valid response', () => {
  const result = componentMatchResponseZodSchema.safeParse({
    decisions: [{
      review_id: 'r1', decision: 'same_component', confidence: 0.9, reasoning: 'same sensor',
    }],
  });
  assert.equal(result.success, true);
});

test('componentMatchResponseZodSchema — rejects missing reasoning', () => {
  const result = componentMatchResponseZodSchema.safeParse({
    decisions: [{ review_id: 'r1', decision: 'same_component', confidence: 0.9 }],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #7 Candidate Validator
// ---------------------------------------------------------------------------

test('candidateValidatorResponseZodSchema — accepts valid response', () => {
  const result = candidateValidatorResponseZodSchema.safeParse({
    accept: [{ field: 'dpi', value: '26000', reason: 'confirmed', evidenceRefs: ['s1'] }],
    reject: [{ field: 'weight', reason: 'wrong product' }],
    unknown: [{ field: 'polling_rate', unknown_reason: 'no evidence' }],
  });
  assert.equal(result.success, true);
});

test('candidateValidatorResponseZodSchema — rejects missing accept array', () => {
  const result = candidateValidatorResponseZodSchema.safeParse({
    reject: [], unknown: [],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #8 Extraction Model
// ---------------------------------------------------------------------------

test('extractionModelResponseZodSchema — accepts valid response', () => {
  const result = extractionModelResponseZodSchema.safeParse({
    identityCandidates: { brand: 'Razer', model: 'Viper V3' },
    fieldCandidates: [{ field: 'dpi', value: '26000', evidenceRefs: ['s1'] }],
    conflicts: [],
    notes: ['Clean extraction'],
  });
  assert.equal(result.success, true);
});

test('extractionModelResponseZodSchema — rejects missing fieldCandidates', () => {
  const result = extractionModelResponseZodSchema.safeParse({
    identityCandidates: {}, conflicts: [], notes: [],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #9 Summary LLM
// ---------------------------------------------------------------------------

test('summaryLlmResponseZodSchema — accepts valid response', () => {
  const result = summaryLlmResponseZodSchema.safeParse({ markdown: '# Summary' });
  assert.equal(result.success, true);
});

test('summaryLlmResponseZodSchema — rejects missing markdown', () => {
  const result = summaryLlmResponseZodSchema.safeParse({});
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #10 Health Check
// ---------------------------------------------------------------------------

test('healthCheckResponseZodSchema — accepts valid response', () => {
  const result = healthCheckResponseZodSchema.safeParse({
    ok: true, provider: 'gemini', model: 'flash', echo: 'ping', reasoning_used: false,
  });
  assert.equal(result.success, true);
});

test('healthCheckResponseZodSchema — rejects missing ok field', () => {
  const result = healthCheckResponseZodSchema.safeParse({
    provider: 'gemini', model: 'flash', echo: 'ping', reasoning_used: false,
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// #11 Source Response (test data provider)
// ---------------------------------------------------------------------------

test('sourceResponseZodSchema — accepts valid response', () => {
  const result = sourceResponseZodSchema.safeParse({
    sources: [{
      host: 'razer.com', tier: 1, fieldCandidates: [{ field: 'dpi', value: '26000' }],
    }],
  });
  assert.equal(result.success, true);
});

test('sourceResponseZodSchema — rejects missing sources', () => {
  const result = sourceResponseZodSchema.safeParse({});
  assert.equal(result.success, false);
});
