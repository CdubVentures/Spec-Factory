import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioComponentSources() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioComponentSources.ts',
    {
      prefix: 'studio-component-sources-',
    },
  );
}

test('studio component sources migrate legacy property keys and normalize variance defaults', async () => {
  const { migrateProperty } = await loadStudioComponentSources();

  assert.deepEqual(
    migrateProperty({
      key: 'max_dpi',
      variance_policy: 'range',
      tolerance: '12.5',
    }),
    {
      field_key: 'dpi',
      variance_policy: 'range',
      tolerance: 12.5,
    },
  );

  assert.deepEqual(
    migrateProperty({
      key: 'max_dpi',
      field_key: 'custom_field',
      variance_policy: 'invalid',
      tolerance: null,
    }),
    {
      field_key: 'custom_field',
      variance_policy: 'authoritative',
      tolerance: null,
    },
  );
});

test('studio component sources create empty component rows with stable default priority and ai assist state', async () => {
  const { createEmptyComponentSource } = await loadStudioComponentSources();

  assert.deepEqual(createEmptyComponentSource(), {
    component_type: '',
    roles: {
      maker: 'yes',
      aliases: [],
      links: [],
      properties: [],
    },
    priority: {
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'medium',
      effort: 3,
    },
    ai_assist: {
      mode: null,
      model_strategy: 'auto',
      max_calls: null,
      max_tokens: null,
      reasoning_note: '',
    },
  });
});
