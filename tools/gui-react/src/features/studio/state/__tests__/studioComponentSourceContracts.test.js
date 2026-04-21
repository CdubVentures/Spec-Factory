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

test('studio component sources preserve component_only flag through migrateProperty', async () => {
  const { migrateProperty } = await loadStudioComponentSources();

  // WHY: The flag must round-trip via save → load, otherwise toggling the
  // checkbox in Mapping Studio appears to "stick" but is silently lost.
  assert.deepEqual(
    migrateProperty({
      field_key: 'encoder_steps',
      variance_policy: 'authoritative',
      tolerance: null,
      component_only: true,
    }),
    {
      field_key: 'encoder_steps',
      variance_policy: 'authoritative',
      tolerance: null,
      component_only: true,
    },
  );

  // Absent / falsy stays absent (keeps shape minimal for default case)
  const withoutFlag = migrateProperty({
    field_key: 'dpi',
    variance_policy: 'upper_bound',
    tolerance: null,
  });
  assert.equal(withoutFlag.component_only, undefined);

  const withFalse = migrateProperty({
    field_key: 'dpi',
    variance_policy: 'upper_bound',
    tolerance: null,
    component_only: false,
  });
  assert.equal(withFalse.component_only, undefined);
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
      required_level: 'non_mandatory',
      availability: 'sometimes',
      difficulty: 'medium',
    },
    ai_assist: {
      reasoning_note: '',
    },
  });
});
