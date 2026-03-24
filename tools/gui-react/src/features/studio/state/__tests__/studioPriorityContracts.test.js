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

test('studio priority normalizes ai assist config and preserves current ai derivation thresholds', async () => {
  const {
    normalizeAiAssistConfig,
    deriveAiModeFromPriority,
    deriveAiCallsFromEffort,
  } = await loadStudioPriority();

  assert.deepEqual(
    normalizeAiAssistConfig({
      mode: ' Planner ',
      model_strategy: 'force_deep',
      max_calls: 50,
      max_tokens: 42,
      reasoning_note: 5,
    }),
    {
      mode: 'planner',
      model_strategy: 'force_deep',
      max_calls: 10,
      max_tokens: 256,
      reasoning_note: '5',
    },
  );

  assert.deepEqual(
    normalizeAiAssistConfig({
      mode: 'invalid',
      model_strategy: 'unknown',
      max_calls: '',
      max_tokens: null,
    }),
    {
      mode: null,
      model_strategy: 'auto',
      max_calls: null,
      max_tokens: null,
      reasoning_note: '',
    },
  );

  assert.equal(
    deriveAiModeFromPriority({
      required_level: 'identity',
      availability: 'always',
      difficulty: 'easy',
      effort: 1,
    }),
    'judge',
  );
  assert.equal(
    deriveAiModeFromPriority({
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'hard',
      effort: 5,
    }),
    'planner',
  );
  assert.equal(
    deriveAiModeFromPriority({
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'medium',
      effort: 5,
    }),
    'advisory',
  );
  assert.equal(
    deriveAiModeFromPriority({
      required_level: 'optional',
      availability: 'rare',
      difficulty: 'easy',
      effort: 1,
    }),
    'off',
  );

  assert.equal(deriveAiCallsFromEffort(3), 1);
  assert.equal(deriveAiCallsFromEffort(6), 2);
  assert.equal(deriveAiCallsFromEffort(7), 3);
});
