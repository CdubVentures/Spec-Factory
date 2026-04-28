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

test('normalizeAiAssistConfig keeps reasoning_note plus variant inventory enabled flag', async () => {
  const { normalizeAiAssistConfig } = await loadStudioPriority();

  // Retired fields are ignored; legacy variant inventory usage metadata becomes a single checkbox flag.
  assert.deepEqual(
    normalizeAiAssistConfig({
      mode: ' Planner ',
      model_strategy: 'force_deep',
      max_calls: 50,
      max_tokens: 42,
      reasoning_note: 5,
      variant_inventory_usage: {
        mode: 'append',
        profile: 'visual_design',
        text: '  Prefer base shell evidence.  ',
      },
      pif_priority_images: {
        enabled: true,
        text: '  ignored  ',
      },
    }),
    {
      reasoning_note: '5',
      variant_inventory_usage: {
        enabled: true,
      },
      pif_priority_images: {
        enabled: true,
      },
    },
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
    {
      label: 'variant_inventory_usage explicit enabled false preserved',
      input: { variant_inventory_usage: { enabled: false, mode: 'append', text: ' Ignore me. ' } },
      expected: { reasoning_note: '', variant_inventory_usage: { enabled: false } },
    },
    {
      label: 'variant_inventory_usage explicit enabled true preserved',
      input: { variant_inventory_usage: { enabled: true } },
      expected: { reasoning_note: '', variant_inventory_usage: { enabled: true } },
    },
    {
      label: 'variant_inventory_usage legacy off mode maps disabled',
      input: { variant_inventory_usage: { mode: 'off', profile: 'visual_design', text: ' Ignore me. ' } },
      expected: { reasoning_note: '', variant_inventory_usage: { enabled: false } },
    },
    {
      label: 'variant_inventory_usage legacy active mode maps enabled',
      input: { variant_inventory_usage: { mode: 'override', profile: 'visual_design', text: ' Ignore me. ' } },
      expected: { reasoning_note: '', variant_inventory_usage: { enabled: true } },
    },
    {
      label: 'variant_inventory_usage invalid empty metadata ignored',
      input: { variant_inventory_usage: { mode: 'bad', profile: 'bad', text: '   ' } },
      expected: { reasoning_note: '' },
    },
    {
      label: 'variant_inventory_usage text-only metadata ignored',
      input: { variant_inventory_usage: { text: ' Prefer official table. ' } },
      expected: { reasoning_note: '' },
    },
    {
      label: 'pif_priority_images explicit enabled true preserved',
      input: { pif_priority_images: { enabled: true, text: ' Ignore me. ' } },
      expected: { reasoning_note: '', pif_priority_images: { enabled: true } },
    },
    {
      label: 'pif_priority_images direct boolean false preserved',
      input: { pif_priority_images: false },
      expected: { reasoning_note: '', pif_priority_images: { enabled: false } },
    },
    {
      label: 'pif_priority_images invalid metadata ignored',
      input: { pif_priority_images: { text: ' No second guidance box. ' } },
      expected: { reasoning_note: '' },
    },
  ];

  for (const { label, input, expected } of cases) {
    assert.deepEqual(normalizeAiAssistConfig(input), expected, label);
  }
});

test('readAiAssistToggleEnabled characterizes legacy and simple toggle defaults', async () => {
  const { readAiAssistToggleEnabled } = await loadStudioPriority();

  const cases = [
    {
      label: 'variant inventory missing uses legacy default-on behavior',
      rule: {},
      path: 'ai_assist.variant_inventory_usage',
      expected: true,
    },
    {
      label: 'variant inventory explicit enabled false wins',
      rule: { ai_assist: { variant_inventory_usage: { enabled: false, mode: 'append' } } },
      path: 'ai_assist.variant_inventory_usage',
      expected: false,
    },
    {
      label: 'variant inventory direct boolean is accepted',
      rule: { ai_assist: { variant_inventory_usage: true } },
      path: 'ai_assist.variant_inventory_usage',
      expected: true,
    },
    {
      label: 'variant inventory legacy off disables',
      rule: { ai_assist: { variant_inventory_usage: { mode: 'off' } } },
      path: 'ai_assist.variant_inventory_usage',
      expected: false,
    },
    {
      label: 'variant inventory legacy active mode enables',
      rule: { ai_assist: { variant_inventory_usage: { mode: 'append' } } },
      path: 'ai_assist.variant_inventory_usage',
      expected: true,
    },
    {
      label: 'pif priority images missing defaults off',
      rule: {},
      path: 'ai_assist.pif_priority_images',
      expected: false,
    },
    {
      label: 'pif priority images direct boolean is accepted',
      rule: { ai_assist: { pif_priority_images: true } },
      path: 'ai_assist.pif_priority_images',
      expected: true,
    },
    {
      label: 'pif priority images explicit enabled false wins',
      rule: { ai_assist: { pif_priority_images: { enabled: false } } },
      path: 'ai_assist.pif_priority_images',
      expected: false,
    },
    {
      label: 'pif priority images does not use legacy mode fallback',
      rule: { ai_assist: { pif_priority_images: { mode: 'append' } } },
      path: 'ai_assist.pif_priority_images',
      expected: false,
    },
  ];

  for (const { label, rule, path, expected } of cases) {
    assert.equal(readAiAssistToggleEnabled(rule, path), expected, label);
  }
});
