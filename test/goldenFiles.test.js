import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildAccuracyReport,
  createGoldenFixture,
  createGoldenFromCatalog,
  renderAccuracyReportMarkdown,
  validateGoldenFixtures
} from '../src/testing/goldenFiles.js';

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function seedCatalogFixtures(helperRoot) {
  const categoryRoot = path.join(helperRoot, 'mouse');
  await writeJson(path.join(categoryRoot, '_generated', 'field_rules.json'), {
    version: 1,
    fields: {
      connection: { type: 'string', required: 'required' },
      weight: { type: 'number', required: 'required' },
      dpi: { type: 'number', required: 'recommended' }
    },
    schema: {}
  });
  await writeJson(path.join(categoryRoot, '_control_plane', 'product_catalog.json'), {
    _version: 1,
    products: {
      'mouse-acme-m100': { brand: 'Acme', model: 'M100', variant: '' },
      'mouse-acme-m200': { brand: 'Acme', model: 'M200', variant: '' },
      'mouse-acme-m300': { brand: 'Acme', model: 'M300', variant: '' }
    }
  });
  await writeJson(path.join(categoryRoot, '_overrides', 'mouse-acme-m100.overrides.json'), {
    product_id: 'mouse-acme-m100',
    overrides: {
      connection: { value: 'wireless' },
      weight: { value: '54' },
      dpi: { value: '26000' }
    }
  });
  await writeJson(path.join(categoryRoot, '_overrides', 'mouse-acme-m200.overrides.json'), {
    product_id: 'mouse-acme-m200',
    overrides: {
      connection: { value: 'wired' },
      weight: { value: '59' },
      dpi: { value: '19000' }
    }
  });
  await writeJson(path.join(categoryRoot, '_overrides', 'mouse-acme-m300.overrides.json'), {
    product_id: 'mouse-acme-m300',
    overrides: {
      connection: { value: 'wireless' },
      weight: { value: '62' },
      dpi: { value: '12000' }
    }
  });
}

function makeStorage({ category, productId, fields }) {
  const latestBase = `specs/outputs/${category}/${productId}/latest`;
  const map = new Map([
    [`${latestBase}/normalized.json`, Buffer.from(JSON.stringify({ fields }), 'utf8')],
    [`${latestBase}/summary.json`, Buffer.from(JSON.stringify({ validated: true, confidence: 0.95 }), 'utf8')]
  ]);
  return {
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].join('/');
    },
    async readJsonOrNull(key) {
      const raw = map.get(key);
      return raw ? JSON.parse(raw.toString('utf8')) : null;
    }
  };
}

test('createGoldenFixture writes expected fixture and manifest rows', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase2-golden-create-'));
  const goldenRoot = path.join(root, 'fixtures', 'golden');
  try {
    const created = await createGoldenFixture({
      category: 'mouse',
      productId: 'mouse-acme-m100',
      identity: {
        brand: 'Acme',
        model: 'M100',
        variant: 'Wireless'
      },
      fields: {
        weight: 54,
        connection: 'wireless'
      },
      expectedUnknowns: {
        shift_latency: 'not_publicly_disclosed'
      },
      config: {
        goldenRoot
      }
    });

    assert.equal(created.created, true);
    assert.equal(typeof created.expected_path, 'string');
    const manifestPath = path.join(goldenRoot, 'mouse', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    assert.equal(Array.isArray(manifest.cases), true);
    assert.equal(manifest.cases.length, 1);
    assert.equal(manifest.cases[0].product_id, 'mouse-acme-m100');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('createGoldenFromCatalog creates a bounded batch and validateGoldenFixtures passes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase2-golden-catalog-'));
  const helperRoot = path.join(root, 'helper_files');
  const goldenRoot = path.join(root, 'fixtures', 'golden');
  try {
    await seedCatalogFixtures(helperRoot);
    const created = await createGoldenFromCatalog({
      category: 'mouse',
      count: 3,
      config: {
        helperFilesRoot: helperRoot,
        goldenRoot
      }
    });
    assert.equal(created.created_count, 3);
    assert.equal(created.case_count, 3);

    const validation = await validateGoldenFixtures({
      category: 'mouse',
      config: {
        helperFilesRoot: helperRoot,
        goldenRoot
      }
    });
    assert.equal(validation.valid, true);
    assert.equal(validation.case_count, 3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('buildAccuracyReport computes field-level metrics and markdown rendering', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase2-golden-accuracy-'));
  const goldenRoot = path.join(root, 'fixtures', 'golden');
  try {
    await createGoldenFixture({
      category: 'mouse',
      productId: 'mouse-acme-m100',
      identity: {
        brand: 'Acme',
        model: 'M100'
      },
      fields: {
        weight: 54,
        connection: 'wireless',
        sensor: 'PixArt 3395'
      },
      config: {
        goldenRoot
      }
    });

    const storage = makeStorage({
      category: 'mouse',
      productId: 'mouse-acme-m100',
      fields: {
        weight: 54,
        connection: 'wired',
        sensor: 'PixArt 3395'
      }
    });
    const report = await buildAccuracyReport({
      category: 'mouse',
      storage,
      config: { goldenRoot }
    });
    assert.equal(report.products_tested, 1);
    assert.equal(report.by_field.weight.correct, 1);
    assert.equal(report.by_field.connection.incorrect, 1);
    assert.equal(report.by_field.sensor.correct, 1);
    assert.equal(report.overall_accuracy < 1, true);

    const md = renderAccuracyReportMarkdown(report);
    assert.equal(typeof md, 'string');
    assert.equal(md.includes('# Accuracy Report: mouse'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
