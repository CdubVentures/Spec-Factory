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

test('studio priority normalizes profiles with enum fallback', async () => {
  const { normalizePriorityProfile, DEFAULT_PRIORITY_PROFILE } =
    await loadStudioPriority();

  assert.deepEqual(normalizePriorityProfile(undefined), DEFAULT_PRIORITY_PROFILE);

  assert.deepEqual(
    normalizePriorityProfile({
      required_level: 'mandatory',
      availability: 'sometimes',
      difficulty: 'hard',
    }),
    {
      required_level: 'mandatory',
      availability: 'sometimes',
      difficulty: 'hard',
    },
  );

  assert.deepEqual(
    normalizePriorityProfile({
      required_level: 'invalid',
      availability: 'nope',
      difficulty: 'bad',
    }),
    DEFAULT_PRIORITY_PROFILE,
  );
});

test('studio priority detects explicit priority fields and merges nested rule priority with top-level fallback', async () => {
  const { hasExplicitPriority, resolveRulePriority } = await loadStudioPriority();

  assert.equal(hasExplicitPriority(undefined), false);
  assert.equal(hasExplicitPriority({}), false);
  assert.equal(hasExplicitPriority({ difficulty: 'medium' }), true);
  assert.equal(hasExplicitPriority({ availability: 'rare' }), true);

  assert.deepEqual(
    resolveRulePriority({
      required_level: 'mandatory',
      availability: 'always',
      difficulty: 'medium',
      priority: {
        availability: 'rare',
      },
    }),
    {
      required_level: 'mandatory',
      availability: 'rare',
      difficulty: 'medium',
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
      required_level: 'non_mandatory',
      availability: 'sometimes',
      difficulty: 'medium',
    },
    dpi: {
      priority: {
        required_level: 'mandatory',
        availability: 'always',
        difficulty: 'hard',
      },
    },
    latency: {
      priority: {
        required_level: 'mandatory',
        availability: 'rare',
        difficulty: 'very_hard',
      },
    },
    polling_rate: {
      priority: {
        required_level: 'mandatory',
        availability: 'always',
        difficulty: 'medium',
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
      required_level: 'mandatory',
      availability: 'always',
      difficulty: 'very_hard',
    },
  );

  assert.deepEqual(deriveListPriority('polling', rules), {
    required_level: 'mandatory',
    availability: 'always',
    difficulty: 'medium',
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
