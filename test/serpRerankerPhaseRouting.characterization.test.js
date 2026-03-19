import test from 'node:test';
import assert from 'node:assert/strict';

// WHY: Verifies serpReranker uses the correct registered phase name and role
// for SERP reranking. Phase must be 'serpSelector' (registered in PHASE_DEFS)
// and role must be 'triage' (for correct token budget tier).

test('serpReranker callLlmWithRouting receives phase and role args', async (t) => {
  const captured = [];

  // Stub callLlmWithRouting to capture args
  const stubCallLlm = async (opts) => {
    captured.push({
      phase: opts.phase,
      role: opts.role,
      reason: opts.reason,
    });
    return { selected_urls: [] };
  };

  // Stub hasLlmRouteApiKey to return true
  const stubHasKey = () => true;

  // Dynamic import with module-level DI is not possible for this module.
  // Instead, test the actual file by reading its source and verifying the string.
  // This is a golden-master characterization test.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/research/serpReranker.js', import.meta.url),
    'utf8'
  );

  await t.test('source contains phase: serpSelector (registered phase)', () => {
    assert.ok(
      source.includes("phase: 'serpSelector'"),
      'Expected serpReranker.js to contain phase: \'serpSelector\''
    );
    assert.ok(
      !source.includes("phase: 'serpTriage'"),
      'serpReranker.js must NOT contain unregistered phase \'serpTriage\''
    );
  });

  await t.test('source contains role: triage (correct token budget tier)', () => {
    const callBlock = source.slice(
      source.indexOf('callLlmWithRouting({'),
      source.indexOf('jsonSchema: rerankSchema()')
    );
    assert.ok(
      callBlock.includes("role: 'triage'"),
      'Expected callLlmWithRouting block to contain role: \'triage\''
    );
  });
});
