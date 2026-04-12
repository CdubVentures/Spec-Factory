import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../../../core/storage/storage.js';
import { resolveOverrideFilePath } from '../../overrideWorkflow.js';
import { readProductFromConsolidated } from '../../../../../shared/consolidatedOverrides.js';
import { SpecDb } from '../../../../../db/specDb.js';

export async function createReviewOverrideHarness(
  t,
  { category = 'mouse', productId = 'mouse-review-override' } = {},
) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-override-'));
  const storage = createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
  });
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
  };
  // WHY: Phase E3 — SQL is sole runtime source, tests need specDb
  const specDb = new SpecDb({ dbPath: ':memory:', category });

  if (typeof t?.after === 'function') {
    t.after(async () => {
      try { specDb?.close(); } catch { /* no-op */ }
      await fs.rm(tempRoot, { recursive: true, force: true });
    });
  }

  return { tempRoot, storage, config, category, productId, specDb };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function seedFieldRulesArtifacts({ config, category }) {
  const generatedRoot = path.join(config.categoryAuthorityRoot, category, '_generated');
  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category,
    fields: {
      weight: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 },
        },
      },
    },
  });
  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category,
    enums: {},
  });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category,
    templates: {},
  });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category,
    rules: [],
  });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {
    version: '1.0.0',
    previous_version: '1.0.0',
    bump: 'patch',
    summary: { added_count: 0, removed_count: 0, changed_count: 0 },
    key_map: {},
    migrations: [],
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category,
    fields: [{ key: 'weight', group: 'physical' }],
  });
}

export async function seedReviewCandidates(
  { storage, category, productId },
  value = '59',
) {
  const reviewBase = storage.resolveOutputKey(category, productId, 'review');
  await storage.writeObject(
    `${reviewBase}/candidates.json`,
    Buffer.from(JSON.stringify({
      version: 1,
      category,
      product_id: productId,
      candidate_count: 1,
      field_count: 1,
      items: [
        {
          candidate_id: 'cand_1',
          field: 'weight',
          value,
          score: 0.91,
          host: 'manufacturer.example',
          source_id: 'manufacturer_example',
          method: 'dom',
          tier: 1,
          evidence_key: 'https://manufacturer.example/spec#weight',
          evidence: {
            url: 'https://manufacturer.example/spec',
            snippet_id: 'snp_weight_1',
            snippet_hash: 'sha256:abc123',
            quote: `Weight: ${value} g`,
            quote_span: [0, 12],
            snippet_text: `Weight: ${value} g without cable`,
            source_id: 'manufacturer_example',
          },
        },
      ],
      by_field: {
        weight: ['cand_1'],
      },
    }, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
}

export function seedLatestArtifacts({ specDb, category, productId }) {
  // WHY: Seeds specDb instead of writing latest/*.json files (retired).
  // Inserts a product + an unresolved candidate so finalizeOverrides has initial state.
  specDb.upsertProduct({
    product_id: productId,
    category,
    brand: 'Razer',
    model: 'Viper V3 Pro',
    base_model: '',
    variant: '',
  });
  specDb.upsertFieldCandidate({
    category,
    product_id: productId,
    field_key: 'weight',
    value: 'unk',
    confidence: 0,
    status: 'candidate',
    sources_json: [],
    metadata_json: {},
  });
}

export async function seedReviewProductPayload(
  { storage, category, productId },
  fieldStates = {},
) {
  const reviewBase = storage.resolveOutputKey(category, productId, 'review');
  const payload = {
    product_id: productId,
    category,
    identity: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
    },
    fields: {
      weight: {
        selected: {
          value: '59',
          confidence: 0.95,
          status: 'ok',
          color: 'green',
        },
        needs_review: false,
        reason_codes: [],
        candidates: [
          {
            candidate_id: 'cand_1',
            value: '59',
            score: 0.91,
            source_id: 'manufacturer_example',
            source: 'manufacturer.example',
            tier: 1,
            method: 'dom',
            evidence: {
              url: 'https://manufacturer.example/spec',
              snippet_id: 'snp_weight_1',
              snippet_hash: 'sha256:abc123',
              quote: 'Weight: 59 g',
              quote_span: [0, 12],
              snippet_text: 'Weight: 59 g without cable',
              source_id: 'manufacturer_example',
            },
          },
        ],
      },
      ...fieldStates,
    },
  };
  await storage.writeObject(
    `${reviewBase}/product.json`,
    Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
}

export async function readOverridePayload({ config, category, productId }) {
  // WHY: Read from consolidated JSON SSOT — DB sync removed from overrideWorkflow.
  const entry = await readProductFromConsolidated({ config, category, productId });
  if (entry) {
    return {
      version: 1,
      category,
      product_id: productId,
      review_status: entry.review_status || 'in_progress',
      overrides: entry.overrides || {},
    };
  }
  const overridePath = resolveOverrideFilePath({ config, category, productId });
  return JSON.parse(await fs.readFile(overridePath, 'utf8'));
}

