import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../core/storage/storage.js';
import {
  analyzeContract,
  loadComponentIdentityPools,
  buildSeedComponentDB,
  buildTestProducts,
  buildDeterministicSourceResults,
} from '../../../testing/testDataProvider.js';
import {
  buildReviewLayout,
  buildProductReviewPayload,
} from '../../../features/review/domain/reviewGridData.js';
import {
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
} from '../../../features/review/domain/componentReviewData.js';
import { SpecDb } from '../../specDb.js';
import { seedSpecDb } from '../../seed.js';

export const CATEGORY = 'mouse';
export const HELPER_ROOT = path.resolve('category_authority');
export const REAL_FLAGS = new Set([
  'variance_violation',
  'constraint_conflict',
  'compound_range_conflict',
  'dependency_missing',
  'new_component',
  'new_enum_value',
  'below_min_evidence',
  'conflict_policy_hold',
]);
let contractDrivenAnalysisHarnessPromise;

function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
  });
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value), 'utf8');
}

function simpleHash(text) {
  const input = String(text || '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sourceResultsToArtifacts(sourceResults, product, contractAnalysis) {
  const valuesByField = {};

  for (let sourceIndex = 0; sourceIndex < sourceResults.length; sourceIndex += 1) {
    const source = sourceResults[sourceIndex];
    for (const fieldCandidate of source.fieldCandidates) {
      if (!valuesByField[fieldCandidate.field]) valuesByField[fieldCandidate.field] = [];
      const baseScore = source.tier === 1 ? 0.85 : source.tier === 2 ? 0.65 : 0.45;
      const hashInput = `${product.productId}::${fieldCandidate.field}::s${sourceIndex}`;
      const hashOffset = (simpleHash(hashInput) % 15) / 100;
      const score = Math.round((baseScore + hashOffset) * 100) / 100;
      valuesByField[fieldCandidate.field].push({
        value: fieldCandidate.value,
        score,
        source_tier: source.tier,
      });
    }
  }

  const fields = {};
  const provenance = {};
  for (const [fieldKey, entries] of Object.entries(valuesByField)) {
    const winner = [...entries].sort((left, right) => {
      if (left.source_tier !== right.source_tier) return left.source_tier - right.source_tier;
      return right.score - left.score;
    })[0];
    fields[fieldKey] = winner.value;
    provenance[fieldKey] = { value: winner.value, confidence: winner.score };
  }

  const normalized = {
    identity: product.identityLock || {},
    fields,
  };

  const raw = contractAnalysis?._raw || {};
  const requiredFields = contractAnalysis?.summary?.requiredFields || [];
  const allFieldKeys = raw.fieldKeys || [];
  const missingRequired = requiredFields.filter((fieldKey) => !fields[fieldKey] || fields[fieldKey] === 'unk');
  const populatedCount = Object.values(fields).filter((value) => value && value !== 'unk').length;
  const coverage = allFieldKeys.length > 0
    ? Math.round((populatedCount / allFieldKeys.length) * 100)
    : 0;
  const confidenceValues = Object.values(provenance).map((entry) => entry.confidence);
  const averageConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  const fieldReasoning = {};
  for (const fieldKey of Object.keys(fields)) {
    fieldReasoning[fieldKey] = {
      value: fields[fieldKey],
      confidence: provenance[fieldKey]?.confidence || 0,
      sources: sourceResults.length,
    };
  }

  const dependencyRules = product._testCase?.name === 'cross_validation'
    ? (raw.rules || []).filter((rule) =>
      String(rule?.requires_field || '').trim() && String(rule?.trigger_field || '').trim())
    : [];
  for (const rule of dependencyRules) {
    const triggerField = String(rule.trigger_field || '').trim();
    if (!triggerField) continue;
    if (!fieldReasoning[triggerField]) {
      fieldReasoning[triggerField] = {
        value: fields[triggerField],
        confidence: provenance[triggerField]?.confidence || 0,
        sources: sourceResults.length,
      };
    }
    fieldReasoning[triggerField] = {
      ...fieldReasoning[triggerField],
      unknown_reason: 'dependency_missing',
    };
  }

  const summary = {
    confidence: Math.round(averageConfidence * 100) / 100,
    coverage_overall_percent: coverage,
    missing_required_fields: missingRequired,
    fields_below_pass_target: [],
    critical_fields_below_pass_target: [],
    field_reasoning: fieldReasoning,
    runtime_engine: { failures: [], curation_suggestions_count: 0 },
    constraint_analysis: product._testCase?.name === 'cross_validation'
      ? {
        contradictions: (raw.rules || []).map((rule) => ({
          fields: [
            rule.trigger_field,
            ...(rule.related_fields || []),
            ...(rule.depends_on || []),
          ].filter(Boolean),
          code: 'constraint_conflict',
          severity: 'error',
          rule_id: rule.rule_id || 'test',
        })),
      }
      : {},
  };

  return { normalized, provenance, summary };
}

export function buildFieldRulesForSeed(contractAnalysis, seedComponentDBs) {
  const raw = contractAnalysis._raw || {};
  const fields = raw.fields || {};

  const componentDBs = {};
  for (const [dbFile, dbObject] of Object.entries(seedComponentDBs)) {
    const entries = {};
    const index = new Map();
    const indexAll = new Map();

    for (let itemIndex = 0; itemIndex < dbObject.items.length; itemIndex += 1) {
      const item = dbObject.items[itemIndex];
      const name = item.name;
      const maker = String(item?.maker || '').trim();
      const entryKey = `${name}::${maker}::${itemIndex}`;
      entries[entryKey] = { ...item, canonical_name: name };

      const tokens = new Set([
        name.toLowerCase(),
        name.toLowerCase().replace(/\s+/g, ''),
        ...(item.aliases || []).flatMap((alias) => [
          String(alias || '').toLowerCase(),
          String(alias || '').toLowerCase().replace(/\s+/g, ''),
        ]),
      ]);

      for (const token of tokens) {
        if (!token) continue;
        if (!index.has(token)) index.set(token, entries[entryKey]);
        if (!indexAll.has(token)) indexAll.set(token, []);
        indexAll.get(token).push(entries[entryKey]);
      }
    }

    componentDBs[dbFile] = { entries, __index: index, __indexAll: indexAll };
  }

  const enums = {};
  for (const catalog of (raw.knownValuesCatalogs || [])) {
    enums[catalog.catalog] = { policy: catalog.policy, values: catalog.values };
  }

  return {
    rules: { fields },
    componentDBs,
    knownValues: { enums },
  };
}

export async function createContractDrivenAnalysisHarness() {
  if (!contractDrivenAnalysisHarnessPromise) {
    contractDrivenAnalysisHarnessPromise = (async () => {
      const contractAnalysis = await analyzeContract(HELPER_ROOT, CATEGORY);
      const scenarioDefs = contractAnalysis.scenarioDefs;
      const componentTypes = (contractAnalysis?._raw?.componentTypes || []).map((entry) => entry.type);
      const identityPoolsByType = await loadComponentIdentityPools({
        componentTypes,
        strict: true,
      });
      const seedDBs = buildSeedComponentDB(contractAnalysis, '_test', {
        identityPoolsByType,
        strictIdentityPools: true,
      });
      const products = buildTestProducts(CATEGORY, contractAnalysis);
      const productByScenarioId = new Map(products.map((product) => [product._testCase.id, product]));
      const productByScenarioName = new Map(products.map((product) => [product._testCase.name, product]));
      const productArtifacts = {};
      for (const product of products) {
        const sourceResults = buildDeterministicSourceResults({
          product,
          contractAnalysis,
          componentDBs: seedDBs,
        });
        productArtifacts[product.productId] = {
          product,
          sourceResults,
          artifacts: sourceResultsToArtifacts(sourceResults, product, contractAnalysis),
        };
      }

      return {
        CATEGORY,
        HELPER_ROOT,
        contractAnalysis,
        scenarioDefs,
        seedDBs,
        fieldRules: buildFieldRulesForSeed(contractAnalysis, seedDBs),
        products,
        productArtifacts,
        getProductByScenarioId: (scenarioId) => productByScenarioId.get(scenarioId),
        getProductByScenarioName: (scenarioName) => productByScenarioName.get(scenarioName),
      };
    })();
  }

  return contractDrivenAnalysisHarnessPromise;
}

async function copyRealContractFiles(categoryAuthorityRoot) {
  const realGeneratedDir = path.join(HELPER_ROOT, CATEGORY, '_generated');
  const tempGeneratedDir = path.join(categoryAuthorityRoot, CATEGORY, '_generated');
  await fs.mkdir(tempGeneratedDir, { recursive: true });
  await Promise.all([
    'field_rules.json',
    'known_values.json',
    'cross_validation_rules.json',
    'parse_templates.json',
    'key_migrations.json',
    'ui_field_catalog.json',
  ].map(async (fileName) => {
    try {
      await fs.copyFile(
        path.join(realGeneratedDir, fileName),
        path.join(tempGeneratedDir, fileName),
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      // Some generated artifacts are intentionally optional in contract-driven tests.
    }
  }));
}

async function writeSupportFiles(categoryAuthorityRoot) {
  await writeJson(
    path.join(categoryAuthorityRoot, CATEGORY, '_control_plane', 'field_studio_map.json'),
    { manual_enum_values: {}, manual_enum_timestamps: {} },
  );
}

export async function createContractDrivenSeedReviewHarness(t, options = {}) {
  const analysis = await createContractDrivenAnalysisHarness();
  const scenarioNames = Array.isArray(options.scenarioNames) ? options.scenarioNames : null;
  const products = scenarioNames
    ? analysis.products.filter((product) => scenarioNames.includes(product._testCase.name))
    : analysis.products;
  const missingScenarioNames = scenarioNames
    ? scenarioNames.filter((scenarioName) =>
      !products.some((product) => product._testCase.name === scenarioName))
    : [];
  if (missingScenarioNames.length > 0) {
    throw new Error(`Unknown contract-driven scenarios: ${missingScenarioNames.join(', ')}`);
  }
  const productArtifacts = Object.fromEntries(
    products.map((product) => [product.productId, analysis.productArtifacts[product.productId]]),
  );
  const productByScenarioId = new Map(products.map((product) => [product._testCase.id, product]));
  const productByScenarioName = new Map(products.map((product) => [product._testCase.name, product]));
  let tempRoot = null;
  let db = null;

  async function cleanup() {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore cleanup errors from already-closed DB handles.
      }
      db = null;
    }
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
      tempRoot = null;
    }
  }

  t.after(cleanup);

  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-e2e-'));
  const storage = makeStorage(tempRoot);
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out'),
    specDbDir: path.join(tempRoot, '.workspace', 'db'),
  };

  await Promise.all([
    copyRealContractFiles(config.categoryAuthorityRoot),
    Promise.all(
      Object.entries(analysis.seedDBs).map(([dbFile, dbObject]) =>
        writeJson(
          path.join(config.categoryAuthorityRoot, CATEGORY, '_generated', 'component_db', `${dbFile}.json`),
          dbObject,
        )),
    ),
    writeSupportFiles(config.categoryAuthorityRoot),
    Promise.all(
      Object.entries(productArtifacts).map(async ([productId, { artifacts }]) => {
        const latestDir = path.join(
          config.localOutputRoot,
          CATEGORY,
          productId,
          'latest',
        );
        await Promise.all([
          writeJson(path.join(latestDir, 'normalized.json'), artifacts.normalized),
          writeJson(path.join(latestDir, 'provenance.json'), artifacts.provenance),
          writeJson(path.join(latestDir, 'summary.json'), artifacts.summary),
        ]);
      }),
    ),
  ]);

  const reviewLayout = await buildReviewLayout({
    storage,
    config,
    category: CATEGORY,
  });

  await fs.mkdir(config.specDbDir, { recursive: true });
  db = new SpecDb({
    dbPath: path.join(config.specDbDir, `${CATEGORY}.sqlite`),
    category: CATEGORY,
  });

  const seedResult = await seedSpecDb({
    db,
    config,
    category: CATEGORY,
    fieldRules: analysis.fieldRules,
    logger: null,
  });

  const itemFieldStatesByProduct = new Map(products.map((product) => [
    product.productId,
    db.getItemFieldState(product.productId),
  ]));
  const itemFieldStateByProductAndField = new Map(
    [...itemFieldStatesByProduct.entries()].map(([productId, states]) => [
      productId,
      new Map(states.map((state) => [state.field_key, state])),
    ]),
  );
  const componentIdentityRowsByType = new Map(
    analysis.contractAnalysis._raw.componentTypes.map((componentType) => [
      componentType.type,
      db.getAllComponentIdentities(componentType.type),
    ]),
  );

  const reviewPayloads = new Map();
  const reviewPayloadsWithSpecDb = new Map();
  const componentReviewPayloads = new Map();
  let enumReviewPayloadPromise = null;

  function cacheAsyncValue(cache, key, factory) {
    if (!cache.has(key)) {
      const pending = factory().catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  return {
    ...analysis,
    products,
    productArtifacts,
    tempRoot,
    storage,
    config,
    db,
    seedResult,
    reviewLayout,
    itemFieldStatesByProduct,
    itemFieldStateByProductAndField,
    componentIdentityRowsByType,
    getProductByScenarioId(scenarioId) {
      return productByScenarioId.get(scenarioId);
    },
    getProductByScenarioName(scenarioName) {
      return productByScenarioName.get(scenarioName);
    },
    getItemFieldState(productId, fieldKey) {
      return itemFieldStateByProductAndField.get(productId)?.get(fieldKey) || null;
    },
    async getReviewPayload(productId, { withSpecDb = false } = {}) {
      if (!withSpecDb) {
        return cacheAsyncValue(reviewPayloads, productId, () => buildProductReviewPayload({
          storage,
          config,
          category: CATEGORY,
          productId,
          layout: reviewLayout,
        }));
      }
      return cacheAsyncValue(reviewPayloadsWithSpecDb, productId, () => buildProductReviewPayload({
        storage,
        config,
        category: CATEGORY,
        productId,
        layout: reviewLayout,
        specDb: db,
      }));
    },
    async getComponentReviewPayload(componentType) {
      return cacheAsyncValue(componentReviewPayloads, componentType, () => buildComponentReviewPayloads({
        config,
        category: CATEGORY,
        componentType,
        specDb: db,
        fieldRules: analysis.fieldRules,
      }));
    },
    async getEnumReviewPayload() {
      if (!enumReviewPayloadPromise) {
        enumReviewPayloadPromise = buildEnumReviewPayloads({
          storage,
          config,
          category: CATEGORY,
          specDb: db,
          fieldRules: analysis.fieldRules,
        }).catch((error) => {
          enumReviewPayloadPromise = null;
          throw error;
        });
      }
      return enumReviewPayloadPromise;
    },
  };
}
