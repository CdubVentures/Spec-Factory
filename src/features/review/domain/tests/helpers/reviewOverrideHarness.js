import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../../../core/storage/storage.js';
import { resolveOverrideFilePath } from '../../overrideWorkflow.js';
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
  await storage.writeObject(
    `${reviewBase}/review_queue.json`,
    Buffer.from(JSON.stringify({
      version: 1,
      category,
      product_id: productId,
      count: 1,
      items: [{ field: 'weight', reason_codes: ['missing_required_field'] }],
    }, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
}

export async function seedLatestArtifacts({ storage, category, productId }) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  await storage.writeObject(
    `${latestBase}/normalized.json`,
    Buffer.from(JSON.stringify({
      identity: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
      },
      fields: {
        weight: 'unk',
      },
    }, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    `${latestBase}/provenance.json`,
    Buffer.from(JSON.stringify({
      weight: {
        value: 'unk',
        confidence: 0,
      },
    }, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    `${latestBase}/summary.json`,
    Buffer.from(JSON.stringify({
      missing_required_fields: ['weight'],
      fields_below_pass_target: ['weight'],
      critical_fields_below_pass_target: ['weight'],
      field_reasoning: {
        weight: {
          value: 'unk',
          unknown_reason: 'not_found_after_search',
          reasons: ['missing_required_field'],
        },
      },
    }, null, 2), 'utf8'),
    { contentType: 'application/json' },
  );
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

export async function readOverridePayload({ config, category, productId, specDb }) {
  // WHY: Phase E3 — read from SQL when specDb available, file fallback for legacy tests
  if (specDb) {
    const reviewState = specDb.getProductReviewState(productId);
    const overriddenRows = specDb.getOverriddenFieldsForProduct(productId);
    const overrides = {};
    for (const row of overriddenRows) {
      let provenance = null;
      if (row.override_provenance) {
        try { provenance = JSON.parse(row.override_provenance); } catch { /* keep null */ }
      }
      overrides[row.field_key] = {
        field: row.field_key,
        override_source: row.override_source || 'candidate_selection',
        override_value: row.override_value || row.value || '',
        override_reason: row.override_reason || null,
        override_provenance: provenance,
        overridden_by: row.overridden_by || null,
        overridden_at: row.overridden_at || row.updated_at || null,
        candidate_id: row.accepted_candidate_id || '',
        value: row.override_value || row.value || '',
        set_at: row.overridden_at || row.updated_at || null,
      };
    }
    return {
      version: 1,
      category,
      product_id: productId,
      review_status: reviewState?.review_status || 'in_progress',
      overrides,
    };
  }
  const overridePath = resolveOverrideFilePath({ config, category, productId });
  return JSON.parse(await fs.readFile(overridePath, 'utf8'));
}

export async function readLatestArtifacts({ storage, category, productId }) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  return {
    normalized: await storage.readJson(`${latestBase}/normalized.json`),
    provenance: await storage.readJson(`${latestBase}/provenance.json`),
    summary: await storage.readJson(`${latestBase}/summary.json`),
  };
}
