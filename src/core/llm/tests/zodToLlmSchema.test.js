import test from 'node:test';
import assert from 'node:assert/strict';
import { z, toJSONSchema } from 'zod';

import { zodToLlmSchema } from '../zodToLlmSchema.js';

// WHY: 8+ call sites repeat `const { $schema, ...schema } = toJSONSchema(zodSchema)`.
// This utility centralises that pattern so new LLM adapters don't copy-paste it.

test('zodToLlmSchema — contract', async (t) => {
  const simpleSchema = z.object({
    name: z.string(),
    score: z.number(),
  });

  const nestedSchema = z.object({
    items: z.array(z.object({ id: z.number(), label: z.string() })),
    meta: z.object({ total: z.number() }),
  });

  await t.test('strips $schema key from simple object schema', () => {
    const result = zodToLlmSchema(simpleSchema);
    assert.equal(result.$schema, undefined, '$schema must be removed');
  });

  await t.test('preserves type, properties, and required from simple schema', () => {
    const result = zodToLlmSchema(simpleSchema);
    assert.equal(result.type, 'object');
    assert.ok(result.properties.name, 'should have name property');
    assert.ok(result.properties.score, 'should have score property');
    assert.ok(Array.isArray(result.required), 'should have required array');
  });

  await t.test('handles nested objects and arrays', () => {
    const result = zodToLlmSchema(nestedSchema);
    assert.equal(result.$schema, undefined, '$schema must be removed at root');
    assert.equal(result.type, 'object');
    assert.ok(result.properties.items, 'should have items property');
    assert.ok(result.properties.meta, 'should have meta property');
  });

  await t.test('output matches toJSONSchema minus $schema', () => {
    const full = toJSONSchema(simpleSchema);
    const result = zodToLlmSchema(simpleSchema);
    const { $schema, ...expected } = full;
    assert.deepEqual(result, expected);
  });

  await t.test('deterministic — same input produces identical output', () => {
    const a = zodToLlmSchema(simpleSchema);
    const b = zodToLlmSchema(simpleSchema);
    assert.deepEqual(a, b);
  });
});
