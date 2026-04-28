// WHY: ReviewLayoutRow.field_rule must surface the flags the frontend needs
// to render its key-type icon strip (variant / pif / component-self /
// identity-projection / component-attribute) without needing a separate
// fetch of the full rule. This test pins down the projection contract.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildReviewLayout,
  makeStorage,
  writeJson,
} from './helpers/reviewGridDataHarness.js';

async function seed(category, fields) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-iconflags-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const generated = path.join(config.categoryAuthorityRoot, category, '_generated');
  await writeJson(path.join(generated, 'field_rules.json'), { category, fields });
  return { tempRoot, storage, config };
}

test('field_rule.product_image_dependent passes through from rule', async () => {
  const { tempRoot, storage, config } = await seed('mouse', {
    shape: {
      contract: { type: 'string', shape: 'scalar' },
      product_image_dependent: true,
      ui: { label: 'Shape', group: 'General', order: 1 },
    },
    weight: {
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
      ui: { label: 'Weight', group: 'General', order: 2 },
    },
  });
  try {
    const layout = await buildReviewLayout({ storage, config, category: 'mouse' });
    const shape = layout.rows.find((r) => r.key === 'shape');
    const weight = layout.rows.find((r) => r.key === 'weight');
    assert.equal(shape.field_rule.product_image_dependent, true);
    assert.equal(weight.field_rule.product_image_dependent, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('field_rule.component_identity_projection passes through for force-made <component>_brand', async () => {
  const { tempRoot, storage, config } = await seed('mouse', {
    sensor_brand: {
      contract: { type: 'string', shape: 'scalar' },
      component_identity_projection: { component_type: 'sensor', facet: 'brand' },
      ui: { label: 'Sensor Brand', group: 'Sensor', order: 1 },
    },
    weight: {
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
      ui: { label: 'Weight', group: 'General', order: 2 },
    },
  });
  try {
    const layout = await buildReviewLayout({ storage, config, category: 'mouse' });
    const sensorBrand = layout.rows.find((r) => r.key === 'sensor_brand');
    const weight = layout.rows.find((r) => r.key === 'weight');
    assert.deepEqual(sensorBrand.field_rule.component_identity_projection, {
      component_type: 'sensor',
      facet: 'brand',
    });
    assert.equal(weight.field_rule.component_identity_projection, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('field_rule.belongs_to_component is set from studioMap.component_sources for property fields', async () => {
  const { tempRoot, storage, config } = await seed('mouse', {
    sensor_dpi_max: {
      contract: { type: 'number', shape: 'scalar' },
      ui: { label: 'Sensor DPI Max', group: 'Sensor', order: 1 },
    },
    weight: {
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
      ui: { label: 'Weight', group: 'General', order: 2 },
    },
  });
  try {
    const studioMap = {
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              { field_key: 'sensor_dpi_max' },
            ],
          },
        },
      ],
    };
    const layout = await buildReviewLayout({ storage, config, category: 'mouse', studioMap });
    const sensorDpi = layout.rows.find((r) => r.key === 'sensor_dpi_max');
    const weight = layout.rows.find((r) => r.key === 'weight');
    assert.equal(sensorDpi.field_rule.belongs_to_component, 'sensor');
    assert.equal(weight.field_rule.belongs_to_component, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('field_rule.belongs_to_component is null when studioMap omitted', async () => {
  const { tempRoot, storage, config } = await seed('mouse', {
    sensor_dpi_max: {
      contract: { type: 'number', shape: 'scalar' },
      ui: { label: 'Sensor DPI Max', group: 'Sensor', order: 1 },
    },
  });
  try {
    const layout = await buildReviewLayout({ storage, config, category: 'mouse' });
    const sensorDpi = layout.rows.find((r) => r.key === 'sensor_dpi_max');
    assert.equal(sensorDpi.field_rule.belongs_to_component, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
