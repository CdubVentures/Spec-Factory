import test from 'node:test';
import assert from 'node:assert/strict';

// WHY: Verifies extraction files use resolvePhaseModel() from the routing SSOT
// instead of reading raw config keys. Dead fields (config.llmModelExtract)
// must not appear in production code.

test('extraction files use routing SSOT (resolvePhaseModel)', async (t) => {
  const { readFileSync } = await import('node:fs');
  const resolve = (rel) => new URL(rel, import.meta.url);

  await t.test('runExtractionVerification uses resolvePhaseModel, not config.llmModelExtract', () => {
    const source = readFileSync(
      resolve('../src/features/indexing/extraction/runExtractionVerification.js'),
      'utf8'
    );
    assert.ok(
      source.includes('resolvePhaseModel'),
      'Expected runExtractionVerification.js to use resolvePhaseModel'
    );
    assert.ok(
      !source.includes('config.llmModelExtract'),
      'runExtractionVerification.js must NOT read dead field config.llmModelExtract'
    );
  });

  await t.test('fieldBatching uses resolvePhaseModel', () => {
    const source = readFileSync(
      resolve('../src/features/indexing/extraction/fieldBatching.js'),
      'utf8'
    );
    assert.ok(
      source.includes('resolvePhaseModel'),
      'Expected fieldBatching.js to use resolvePhaseModel'
    );
  });

  await t.test('aggressiveReasoning uses resolvePhaseModel', () => {
    const source = readFileSync(
      resolve('../src/features/indexing/extraction/aggressiveReasoning.js'),
      'utf8'
    );
    assert.ok(
      source.includes('resolvePhaseModel'),
      'Expected aggressiveReasoning.js to use resolvePhaseModel'
    );
  });

  await t.test('aggressiveDom uses resolvePhaseModel', () => {
    const source = readFileSync(
      resolve('../src/features/indexing/extraction/aggressiveDom.js'),
      'utf8'
    );
    assert.ok(
      source.includes('resolvePhaseModel'),
      'Expected aggressiveDom.js to use resolvePhaseModel'
    );
  });

  await t.test('healthCheck does not reference config.llmModelExtract', () => {
    const source = readFileSync(
      resolve('../src/core/llm/client/healthCheck.js'),
      'utf8'
    );
    assert.ok(
      !source.includes('config.llmModelExtract'),
      'healthCheck.js must NOT read dead field config.llmModelExtract'
    );
  });
});
