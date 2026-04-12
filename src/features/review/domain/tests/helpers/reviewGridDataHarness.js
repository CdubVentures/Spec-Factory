import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildReviewLayout,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  buildFieldState,
} from '../../reviewGridData.js';

export {
  buildReviewLayout,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  buildFieldState,
};

export function makeStorage(tempRoot) {
  const objects = new Map();
  return {
    readJson: async (key) => {
      const raw = objects.get(key);
      return JSON.parse(raw);
    },
    readJsonOrNull: async (key) => {
      const raw = objects.get(key);
      return raw == null ? null : JSON.parse(raw);
    },
    writeObject: async (key, body) => {
      objects.set(key, Buffer.isBuffer(body) ? body.toString('utf8') : Buffer.from(body).toString('utf8'));
    },
    resolveOutputKey: (...parts) => ['specs', 'outputs', ...parts].filter(Boolean).join('/'),
  };
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function seedCategoryArtifacts(helperRoot, category) {
  const generated = path.join(helperRoot, category, '_generated');
  await writeJson(path.join(generated, 'field_rules.json'), {
    category,
    fields: {
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        effort: 2,
        contract: { type: 'number', shape: 'scalar', unit: 'g' },
        field_studio_hints: {
          dataEntry: { sheet: 'dataEntry', row: 9, key_cell: 'B9' }
        },
        ui: { label: 'Weight', group: 'General', order: 9 }
      },
      dpi: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'medium',
        effort: 5,
        contract: { type: 'number', shape: 'scalar', unit: null },
        field_studio_hints: {
          dataEntry: { sheet: 'dataEntry', row: 10, key_cell: 'B10' }
        },
        ui: { label: 'DPI', group: '', order: 10 }
      },
      connection: {
        required_level: 'expected',
        availability: 'sometimes',
        difficulty: 'easy',
        effort: 3,
        contract: { type: 'enum', shape: 'scalar', unit: null },
        field_studio_hints: {
          dataEntry: { sheet: 'dataEntry', row: 11, key_cell: 'B11' }
        },
        ui: { label: 'Connection', group: 'Connectivity', order: 11 }
      }
    }
  });
  await writeJson(path.join(generated, 'ui_field_catalog.json'), {
    category,
    fields: [
      { key: 'weight', label: 'Weight', group: 'General', order: 9 },
      { key: 'dpi', label: 'DPI', group: '', order: 10 },
      { key: 'connection', label: 'Connection', group: 'Connectivity', order: 11 }
    ]
  });
}

export async function seedLatestArtifacts(storage, category, productId, options = {}) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  const identity = options.identity ?? {
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro Wireless',
    variant: 'Wireless',
  };
  const fields = options.fields ?? { weight: 59, dpi: 'unk', connection: 'wireless' };
  const summary = {
    productId,
    runId: 'run_test_001',
    confidence: 0.88,
    coverage_overall: 0.66,
    validated: false,
    fields_below_pass_target: ['dpi'],
    critical_fields_below_pass_target: ['dpi'],
    missing_required_fields: ['dpi'],
    field_reasoning: {
      dpi: {
        unknown_reason: 'not_found_after_search',
        reasons: ['missing_required_field']
      }
    },
    generated_at: '2026-02-13T00:00:00.000Z',
    ...(options.summary || {})
  };
  const candidates = options.candidates ?? {
    weight: [
      {
        candidate_id: 'cand_weight_1',
        value: '59',
        score: 0.96,
        host: 'razer.example',
        source_id: 'razer_com',
        tier: 1,
        method: 'spec_table_match',
        evidence: {
          url: 'https://razer.example/specs',
          snippet_id: 'snp_001',
          snippet_hash: 'sha256:abc',
          quote: 'Weight: 59 g',
          quote_span: [0, 12],
          snippet_text: 'Weight: 59 g (without cable)'
        }
      }
    ],
    dpi: [
      {
        candidate_id: 'cand_dpi_1',
        value: '30000',
        score: 0.54,
        host: 'db.example',
        source_id: 'db_example',
        tier: 2,
        method: 'llm_extract',
        evidence: {
          url: 'https://db.example/review',
          snippet_id: 'snp_777',
          quote: 'DPI: 30000'
        }
      }
    ]
  };

  await storage.writeObject(
    `${latestBase}/normalized.json`,
    Buffer.from(JSON.stringify({
      identity,
      fields
    }, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    `${latestBase}/provenance.json`,
    Buffer.from(JSON.stringify({
      weight: {
        value: 59,
        confidence: 0.96,
        evidence: [
          {
            url: 'https://razer.example/specs',
            source_id: 'razer_com',
            snippet_id: 'snp_001',
            snippet_hash: 'sha256:abc',
            quote: 'Weight: 59 g',
            quote_span: [0, 12],
            extraction_method: 'spec_table_match'
          }
        ]
      },
      dpi: {
        value: 'unk',
        confidence: 0,
        evidence: []
      },
      connection: {
        value: 'wireless',
        confidence: 0.9,
        evidence: [
          {
            url: 'https://razer.example/specs',
            source_id: 'razer_com',
            snippet_id: 'snp_010',
            quote: 'Connection: Wireless'
          }
        ]
      }
    }, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    `${latestBase}/summary.json`,
    Buffer.from(JSON.stringify(summary, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    `${latestBase}/candidates.json`,
    Buffer.from(JSON.stringify(candidates, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}

export async function seedQueueState(storage, category, productIds = []) {
  const state = {
    category,
    updated_at: '2026-02-13T00:00:00.000Z',
    products: {}
  };
  for (const productId of productIds) {
    state.products[productId] = {
      productId,
      s3key: `specs/inputs/${category}/products/${productId}.json`,
      status: 'complete',
      priority: 3,
      updated_at: '2026-02-13T00:00:00.000Z'
    };
  }
  const modernKey = `_queue/${category}/state.json`;
  const legacyKey = storage.resolveOutputKey('_queue', category, 'state.json');
  await storage.writeObject(
    modernKey,
    Buffer.from(JSON.stringify(state, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    legacyKey,
    Buffer.from(JSON.stringify(state, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}
