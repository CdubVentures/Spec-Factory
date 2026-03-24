import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../s3/storage.js';
import { FieldRulesEngine } from '../../../engine/fieldRulesEngine.js';
export {
  buildAccuracyTrend,
  buildLlmMetrics,
  buildSourceHealth,
  checkPublishBlockers,
  evaluatePublishGate,
  publishProducts,
  readPublishedChangelog,
  readPublishedProvenance,
  runAccuracyBenchmarkReport,
} from '../../publishingPipeline.js';
export { FieldRulesEngine };

// Shared fixtures and constants for publishingPipeline test slices.

export function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs'
  });
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(value || ''), 'utf8');
}

export async function createCategoryFixture(helperRoot, category = 'mouse') {
  const generated = path.join(helperRoot, category, '_generated');
  await writeJson(path.join(generated, 'field_rules.json'), {
    category,
    fields: {
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 20, max: 120 }
        },
        ui: { label: 'Weight', group: 'General', order: 9 }
      },
      dpi: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: {
          type: 'number',
          shape: 'scalar'
        },
        ui: { label: 'DPI', group: 'Sensor', order: 10 }
      }
    }
  });
  await writeJson(path.join(generated, 'known_values.json'), {
    category,
    enums: {}
  });
  await writeJson(path.join(generated, 'parse_templates.json'), {
    category,
    templates: {}
  });
  await writeJson(path.join(generated, 'cross_validation_rules.json'), {
    category,
    rules: []
  });
  await writeJson(path.join(generated, 'ui_field_catalog.json'), {
    category,
    fields: [
      { key: 'weight', group: 'general', label: 'Weight', order: 9 },
      { key: 'dpi', group: 'sensor', label: 'DPI', order: 10 }
    ]
  });
  await writeJson(path.join(generated, 'schema.json'), {
    category,
    field_order: ['weight', 'dpi'],
    critical_fields: [],
    expected_easy_fields: ['weight', 'dpi'],
    expected_sometimes_fields: [],
    deep_fields: [],
    editorial_fields: [],
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8
    }
  });
  await writeJson(path.join(generated, 'required_fields.json'), ['fields.weight']);
}

export async function seedLatest(storage, category, productId, { weight = '59', dpi = '26000' } = {}) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  await storage.writeObject(
    `${latestBase}/normalized.json`,
    Buffer.from(JSON.stringify({
      identity: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Wireless' },
      fields: { weight, dpi }
    }, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    `${latestBase}/provenance.json`,
    Buffer.from(JSON.stringify({
      weight: {
        value: weight,
        confidence: 0.95,
        evidence: [
          {
            url: 'https://manufacturer.example/spec',
            source_id: 'manufacturer_example',
            snippet_id: 'snp_weight_1',
            snippet_hash: 'sha256:aaa',
            quote_span: [0, 12],
            quote: 'Weight: 59 g',
            retrieved_at: '2026-02-13T00:00:00.000Z'
          }
        ]
      },
      dpi: {
        value: dpi,
        confidence: 0.9,
        evidence: [
          {
            url: 'https://manufacturer.example/spec',
            source_id: 'manufacturer_example',
            snippet_id: 'snp_dpi_1',
            snippet_hash: 'sha256:bbb',
            quote: 'DPI: 26000',
            retrieved_at: '2026-02-13T00:00:00.000Z'
          }
        ]
      }
    }, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    `${latestBase}/summary.json`,
    Buffer.from(JSON.stringify({
      validated: true,
      confidence: 0.92,
      coverage_overall: 1,
      completeness_required: 1,
      generated_at: '2026-02-13T00:00:00.000Z',
      missing_required_fields: [],
      fields_below_pass_target: [],
      critical_fields_below_pass_target: [],
      field_reasoning: {
        weight: { reasons: ['manufacturer_source'] },
        dpi: { reasons: ['manufacturer_source'] }
      }
    }, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}

export async function seedApprovedOverride(helperRoot, category, productId, value) {
  const overridePath = path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
  await writeJson(overridePath, {
    version: 1,
    category,
    product_id: productId,
    review_status: 'approved',
    reviewed_by: 'reviewer_1',
    reviewed_at: '2026-02-13T01:00:00.000Z',
    review_time_seconds: 38,
    overrides: {
      weight: {
        field: 'weight',
        override_source: 'candidate_selection',
        candidate_index: 0,
        override_value: String(value),
        override_reason: 'human verified',
        override_provenance: {
          url: 'https://manufacturer.example/spec',
          source_id: 'manufacturer_example',
          retrieved_at: '2026-02-13T00:00:00.000Z',
          snippet_id: 'snp_weight_1',
          snippet_hash: 'sha256:aaa',
          quote: `Weight: ${value} g`,
          quote_span: [0, 12]
        },
        overridden_by: 'reviewer_1',
        overridden_at: '2026-02-13T01:00:00.000Z'
      }
    }
  });
}

export async function createBlockerFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-blocker-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 20, max: 120 } },
        priority: {
          block_publish_when_unk: true,
          publish_gate: true,
          publish_gate_reason: 'missing_required'
        }
      },
      dpi: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar' },
        priority: {
          block_publish_when_unk: true,
          publish_gate: true,
          publish_gate_reason: 'missing_required'
        }
      },
      sensor: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        priority: {
          block_publish_when_unk: false,
          publish_gate: false
        }
      },
      coating: {
        required_level: 'optional',
        availability: 'sometimes',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {}
  });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: []
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'weight', group: 'general', label: 'Weight', order: 1 },
      { key: 'dpi', group: 'sensor', label: 'DPI', order: 2 },
      { key: 'sensor', group: 'sensor', label: 'Sensor', order: 3 },
      { key: 'coating', group: 'physical', label: 'Coating', order: 4 }
    ]
  });

  return { root, helperRoot };
}

export async function createPublishGateFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-gate-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      brand_name: {
        required_level: 'identity',
        availability: 'always',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'Brand Name', group: 'Identity', order: 1 }
      },
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 20, max: 120 } },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'Weight', group: 'General', order: 2 }
      },
      dpi: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar' },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'DPI', group: 'Sensor', order: 3 }
      },
      sensor: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        evidence_required: false,
        evidence: { required: false },
        ui: { label: 'Sensor', group: 'Sensor', order: 4 }
      },
      coating: {
        required_level: 'optional',
        availability: 'sometimes',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        ui: { label: 'Coating', group: 'Physical', order: 5 }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {}
  });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: []
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'brand_name', group: 'identity', label: 'Brand Name', order: 1 },
      { key: 'weight', group: 'general', label: 'Weight', order: 2 },
      { key: 'dpi', group: 'sensor', label: 'DPI', order: 3 },
      { key: 'sensor', group: 'sensor', label: 'Sensor', order: 4 },
      { key: 'coating', group: 'physical', label: 'Coating', order: 5 }
    ]
  });

  return { root, helperRoot };
}

export const FULL_FIELDS = {
  brand_name: 'Razer',
  weight: 59,
  dpi: 26000,
  sensor: 'Focus Pro',
  coating: 'PTFE'
};

export const GOOD_PROVENANCE = {
  brand_name: { evidence: [{ url: 'https://razer.com', snippet_id: 's1', quote: 'Razer' }] },
  weight: { evidence: [{ url: 'https://razer.com', snippet_id: 's2', quote: '59g' }] },
  dpi: { evidence: [{ url: 'https://razer.com', snippet_id: 's3', quote: '26000 DPI' }] }
};

export const CLEAN_RUNTIME_GATE = { failures: [], warnings: [] };
