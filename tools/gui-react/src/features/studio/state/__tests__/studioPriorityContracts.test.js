import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPriority() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPriority.ts',
    {
      prefix: 'studio-priority-',
    },
  );
}

test('studio priority normalizes profiles with enum fallback and bounded effort', async () => {
  const { normalizePriorityProfile, DEFAULT_PRIORITY_PROFILE } =
    await loadStudioPriority();

  assert.deepEqual(normalizePriorityProfile(undefined), DEFAULT_PRIORITY_PROFILE);

  assert.deepEqual(
    normalizePriorityProfile({
      required_level: 'critical',
      availability: 'sometimes',
      difficulty: 'hard',
      effort: '99',
    }),
    {
      required_level: 'critical',
      availability: 'sometimes',
      difficulty: 'hard',
      effort: 10,
    },
  );

  assert.deepEqual(
    normalizePriorityProfile({
      required_level: 'invalid',
      availability: 'nope',
      difficulty: 'bad',
      effort: 0,
    }),
    {
      ...DEFAULT_PRIORITY_PROFILE,
      effort: 1,
    },
  );
});

test('studio priority detects explicit priority fields and merges nested rule priority with top-level fallback', async () => {
  const { hasExplicitPriority, resolveRulePriority } = await loadStudioPriority();

  assert.equal(hasExplicitPriority(undefined), false);
  assert.equal(hasExplicitPriority({}), false);
  assert.equal(hasExplicitPriority({ effort: 0 }), true);
  assert.equal(hasExplicitPriority({ availability: 'rare' }), true);

  assert.deepEqual(
    resolveRulePriority({
      required_level: 'required',
      availability: 'expected',
      difficulty: 'medium',
      effort: 7,
      priority: {
        availability: 'rare',
      },
    }),
    {
      required_level: 'required',
      availability: 'rare',
      difficulty: 'medium',
      effort: 7,
    },
  );
});

test('studio priority derives component-source and list priority from ranked matching rules', async () => {
  const {
    deriveComponentSourcePriority,
    deriveListPriority,
    DEFAULT_PRIORITY_PROFILE,
  } = await loadStudioPriority();

  const rules = {
    sensor: {
      required_level: 'optional',
      availability: 'sometimes',
      difficulty: 'medium',
      effort: 2,
    },
    dpi: {
      priority: {
        required_level: 'critical',
        availability: 'always',
        difficulty: 'hard',
        effort: 8,
      },
    },
    latency: {
      priority: {
        required_level: 'required',
        availability: 'rare',
        difficulty: 'instrumented',
        effort: 6,
      },
    },
    polling_rate: {
      priority: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'medium',
        effort: 4,
      },
    },
  };

  assert.deepEqual(
    deriveComponentSourcePriority(
      {
        type: 'SENSOR',
        roles: {
          properties: [{ field_key: 'dpi' }, { key: 'latency' }],
        },
      },
      rules,
    ),
    {
      required_level: 'critical',
      availability: 'always',
      difficulty: 'instrumented',
      effort: 8,
    },
  );

  assert.deepEqual(deriveListPriority('polling', rules), {
    required_level: 'required',
    availability: 'expected',
    difficulty: 'medium',
    effort: 4,
  });

  assert.deepEqual(
    deriveListPriority('unknown_field', rules),
    DEFAULT_PRIORITY_PROFILE,
  );
});

test('normalizeAiAssistConfig returns only reasoning_note after knob retirement', async () => {
  const { normalizeAiAssistConfig } = await loadStudioPriority();

  // Retired fields are ignored; only reasoning_note survives
  assert.deepEqual(
    normalizeAiAssistConfig({
      mode: ' Planner ',
      model_strategy: 'force_deep',
      max_calls: 50,
      max_tokens: 42,
      reasoning_note: 5,
    }),
    { reasoning_note: '5' },
  );

  assert.deepEqual(
    normalizeAiAssistConfig({ mode: 'invalid', model_strategy: 'unknown' }),
    { reasoning_note: '' },
  );
});

test('normalizeAiAssistConfig boundary characterization', async () => {
  const { normalizeAiAssistConfig } = await loadStudioPriority();

  const cases = [
    { label: 'undefined', input: undefined, expected: { reasoning_note: '' } },
    { label: 'null', input: null, expected: { reasoning_note: '' } },
    { label: 'empty object', input: {}, expected: { reasoning_note: '' } },
    { label: 'reasoning_note: string', input: { reasoning_note: 'test' }, expected: { reasoning_note: 'test' } },
    { label: 'reasoning_note: number coercion', input: { reasoning_note: 42 }, expected: { reasoning_note: '42' } },
    { label: 'retired fields ignored', input: { mode: 'judge', max_calls: 5, reasoning_note: 'keep' }, expected: { reasoning_note: 'keep' } },
  ];

  for (const { label, input, expected } of cases) {
    assert.deepEqual(normalizeAiAssistConfig(input), expected, label);
  }
});
