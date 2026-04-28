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

test('normalizeAiAssistConfig keeps reasoning_note plus color edition context enabled flag', async () => {
  const { normalizeAiAssistConfig } = await loadStudioPriority();

  // Retired fields are ignored; canonical {enabled} shape becomes a single checkbox flag.
  assert.deepEqual(
    normalizeAiAssistConfig({
      mode: ' Planner ',
      model_strategy: 'force_deep',
      max_calls: 50,
      max_tokens: 42,
      reasoning_note: 5,
      color_edition_context: { enabled: true },
      pif_priority_images: {
        enabled: true,
        text: '  ignored  ',
      },
    }),
    {
      reasoning_note: '5',
      color_edition_context: {
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
      label: 'color_edition_context explicit enabled false preserved',
      input: { color_edition_context: { enabled: false, mode: 'append', text: ' Ignore me. ' } },
      expected: { reasoning_note: '', color_edition_context: { enabled: false } },
    },
    {
      label: 'color_edition_context explicit enabled true preserved',
      input: { color_edition_context: { enabled: true } },
      expected: { reasoning_note: '', color_edition_context: { enabled: true } },
    },
    {
      label: 'legacy variant_inventory_usage active mode maps to color_edition_context enabled',
      input: { variant_inventory_usage: { mode: 'override', profile: 'visual_design', text: ' Ignore me. ' } },
      expected: { reasoning_note: '', color_edition_context: { enabled: true } },
    },
    {
      label: 'legacy variant_inventory_usage off mode maps to color_edition_context disabled',
      input: { variant_inventory_usage: { mode: 'off' } },
      expected: { reasoning_note: '', color_edition_context: { enabled: false } },
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
      label: 'color_edition_context missing uses default-on behavior',
      rule: {},
      path: 'ai_assist.color_edition_context',
      expected: true,
    },
    {
      label: 'color_edition_context explicit enabled false wins',
      rule: { ai_assist: { color_edition_context: { enabled: false } } },
      path: 'ai_assist.color_edition_context',
      expected: false,
    },
    {
      label: 'color_edition_context explicit enabled true wins',
      rule: { ai_assist: { color_edition_context: { enabled: true } } },
      path: 'ai_assist.color_edition_context',
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
