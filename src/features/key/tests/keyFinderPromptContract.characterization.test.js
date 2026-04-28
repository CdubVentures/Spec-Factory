import test from 'node:test';
import assert from 'node:assert/strict';

import { KEY_FINDER_VARIABLES } from '../keyFinderPromptContract.js';

test('key finder prompt contract characterizes deterministic field-rule slots', () => {
  const byName = new Map(KEY_FINDER_VARIABLES.map((entry) => [entry.name, entry]));

  assert.deepEqual(
    ['FIELD_IDENTITY_USAGE', 'PIF_PRIORITY_IMAGES'].map((name) => {
      const entry = byName.get(name);
      return {
        name: entry?.name,
        required: entry?.required,
        category: entry?.category,
        description: entry?.description,
      };
    }),
    [
      {
        name: 'FIELD_IDENTITY_USAGE',
        required: false,
        category: 'deterministic',
        description: 'Per-primary-field instructions for how to use {{VARIANT_INVENTORY}} as an evidence filter. Generated deterministically when ai_assist.color_edition_context.enabled is not false. Enable only when color/edition identity adds value without ambiguity; field-specific union/exact/base/default interpretation belongs in ai_assist.reasoning_note.',
      },
      {
        name: 'PIF_PRIORITY_IMAGES',
        required: false,
        category: 'deterministic',
        description: 'PIF-evaluated default/base variant priority images for visually answerable keys. Rendered when ai_assist.pif_priority_images.enabled is true; missing/unattachable images produce explicit guidance instead of silent absence. Edition-specific interpretation belongs in ai_assist.reasoning_note.',
      },
    ],
  );
});
