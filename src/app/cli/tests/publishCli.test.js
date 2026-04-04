import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';
import { createLocalCliWorkspace } from './helpers/localCliWorkspaceHarness.js';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function seedHelperArtifacts(helperRoot) {
  const generated = path.join(helperRoot, 'mouse', '_generated');
  await writeJson(path.join(generated, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 20, max: 120 } },
        ui: { label: 'Weight', group: 'General', order: 9 }
      }
    }
  });
  await writeJson(path.join(generated, 'known_values.json'), { category: 'mouse', enums: {} });
  await writeJson(path.join(generated, 'parse_templates.json'), { category: 'mouse', templates: {} });
  await writeJson(path.join(generated, 'cross_validation_rules.json'), { category: 'mouse', rules: [] });
  await writeJson(path.join(generated, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [{ key: 'weight', label: 'Weight', group: 'General', order: 9 }]
  });
  await writeJson(path.join(generated, 'schema.json'), {
    category: 'mouse',
    field_order: ['weight'],
    critical_fields: [],
    expected_easy_fields: ['weight'],
    expected_sometimes_fields: [],
    deep_fields: [],
    editorial_fields: [],
    targets: { targetCompleteness: 0.9, targetConfidence: 0.8 }
  });
  await writeJson(path.join(generated, 'required_fields.json'), ['fields.weight']);
}

async function seedLatest(outputRoot, productId, weight = '59') {
  const base = path.join(outputRoot, 'mouse', productId, 'latest');
  await writeJson(path.join(base, 'normalized.json'), {
    identity: { brand: 'Synthetic', model: 'Probe One', variant: 'Wireless' },
    fields: { weight }
  });
  await writeJson(path.join(base, 'provenance.json'), {
    weight: {
      value: weight,
      confidence: 0.95,
      evidence: [
        {
          url: 'https://manufacturer.example/spec',
          source_id: 'manufacturer_example',
          snippet_id: 'snp_weight_1',
          snippet_hash: 'sha256:aaa',
          quote: `Weight: ${weight} g`,
          quote_span: [0, 12],
          retrieved_at: '2026-02-13T00:00:00.000Z'
        }
      ]
    }
  });
  await writeJson(path.join(base, 'summary.json'), {
    validated: true,
    confidence: 0.9,
    coverage_overall: 1,
    completeness_required: 1,
    generated_at: '2026-02-13T00:00:00.000Z',
    missing_required_fields: [],
    fields_below_pass_target: [],
    critical_fields_below_pass_target: []
  });
}

async function seedApprovedOverride(helperRoot, productId, overrideValue) {
  // WHY: readOverrideDoc reads the consolidated overrides.json file (not per-product files).
  await writeJson(path.join(helperRoot, 'mouse', '_overrides', 'overrides.json'), {
    version: 2,
    category: 'mouse',
    updated_at: '2026-02-13T01:00:00.000Z',
    products: {
      [productId]: {
        version: 1,
        category: 'mouse',
        product_id: productId,
        review_status: 'approved',
        reviewed_by: 'reviewer_cli',
        reviewed_at: '2026-02-13T01:00:00.000Z',
        review_time_seconds: 30,
        overrides: {
          weight: {
            field: 'weight',
            override_source: 'candidate_selection',
            override_value: overrideValue,
            override_reason: 'human approved',
            override_provenance: {
              url: 'https://manufacturer.example/spec',
              source_id: 'manufacturer_example',
              retrieved_at: '2026-02-13T00:00:00.000Z',
              snippet_id: 'snp_weight_1',
              snippet_hash: 'sha256:aaa',
              quote: `Weight: ${overrideValue} g`,
              quote_span: [0, 12]
            }
          }
        }
      }
    }
  });
}

test('publish CLI publishes approved overrides and exposes provenance/changelog queries', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-publish-cli-');
  const {
    outputRoot,
    helperRoot,
  } = workspace;
  const productId = 'mouse-cli-publish';
  await seedHelperArtifacts(helperRoot);
  await seedLatest(outputRoot, productId, '59');
  await seedApprovedOverride(helperRoot, productId, '58');
  const env = { CATEGORY_AUTHORITY_ROOT: helperRoot, SPEC_DB_DIR: workspace.specDbDir };

  const published = await runCli([
    'publish',
    '--category', 'mouse',
    '--product-id', productId,
    ...workspace.localArgs(),
  ], { env });
  assert.equal(published.command, 'publish');
  assert.equal(published.published_count, 1);

  const provenance = await runCli([
    'provenance',
    '--category', 'mouse',
    '--product-id', productId,
    '--field', 'weight',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(provenance.command, 'provenance');
  assert.equal(provenance.field, 'weight');
  assert.equal(provenance.provenance.evidence[0].snippet_id, 'snp_weight_1');

  const changelog = await runCli([
    'changelog',
    '--category', 'mouse',
    '--product-id', productId,
    ...workspace.localArgs(),
  ], { env });
  assert.equal(changelog.command, 'changelog');
  assert.equal(Array.isArray(changelog.entries), true);
  assert.equal(changelog.entries.length >= 1, true);
});

test('publish CLI surfaces provenance validation errors through the top-level command surface', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-publish-cli-errors-');

  await assert.rejects(
    runCli([
      'provenance',
      '--category', 'mouse',
      ...workspace.localArgs(),
    ], {
      env: {
        CATEGORY_AUTHORITY_ROOT: workspace.helperRoot,
      },
    }),
    /provenance requires --category <category> and --product-id <id>/,
  );
});
