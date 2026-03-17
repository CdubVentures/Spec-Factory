#!/usr/bin/env node
import { loadConfig, loadDotEnvFile, validateConfig } from '../config.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { createStorage, toPosixKey } from '../s3/storage.js';
import { parseArgs, asBool } from './args.js';
import { createCliCommandDispatcher } from '../app/cli/commandDispatch.js';
import { createMigrateToSqliteCommand } from '../app/cli/commands/migrateToSqliteCommand.js';
import { createQueueCommand } from '../app/cli/commands/queueCommand.js';
import { createDiscoverCommand } from '../app/cli/commands/discoverCommand.js';
import { createSourcesReportCommand } from '../app/cli/commands/sourcesReportCommand.js';
import { createSourcesPlanCommand } from '../app/cli/commands/sourcesPlanCommand.js';
import { createRebuildIndexCommand } from '../app/cli/commands/rebuildIndexCommand.js';
import { createBenchmarkCommand } from '../app/cli/commands/benchmarkCommand.js';
import { createIntelGraphApiCommand } from '../app/cli/commands/intelGraphApiCommand.js';
import { createBillingReportCommand } from '../app/cli/commands/billingReportCommand.js';
import { createLearningReportCommand } from '../app/cli/commands/learningReportCommand.js';
import { createExplainUnkCommand } from '../app/cli/commands/explainUnkCommand.js';
import { createLlmHealthCommand } from '../app/cli/commands/llmHealthCommand.js';
import { createReviewCommand } from '../app/cli/commands/reviewCommand.js';
import { runProduct } from '../pipeline/runProduct.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { discoverCandidateSources } from '../features/indexing/discovery/index.js';
import { rebuildCategoryIndex } from '../indexer/rebuildIndex.js';
import { buildRunId } from '../utils/common.js';
import { EventLogger } from '../logger.js';
import { runS3Integration } from './s3Integration.js';
import {
  generateSourceExpansionPlans,
  loadSourceIntel,
  promotionSuggestionsKey
} from '../intel/sourceIntel.js';
import { startIntelGraphApi } from '../api/intelGraphApi.js';
import { runGoldenBenchmark } from '../benchmark/goldenBenchmark.js';
import { rankBatchWithBandit } from '../features/indexing/learning/index.js';
import { ingestCsvFile } from '../ingest/csvIngestor.js';
import { compileCategoryFieldStudio } from '../ingest/categoryCompile.js';
import { runWatchImports, runDaemon } from '../daemon/daemon.js';
import { runUntilComplete } from '../runner/runUntilComplete.js';
import {
  clearQueueByStatus,
  listQueueProducts,
  loadQueueState,
  syncQueueFromInputs,
  upsertQueueProduct
} from '../queue/queueState.js';
import {
  buildReviewLayout,
  buildReviewQueue,
  buildProductReviewPayload,
  writeCategoryReviewArtifacts,
  writeProductReviewArtifacts
} from '../review/reviewGridData.js';
import {
  approveGreenOverrides,
  buildReviewMetrics,
  finalizeOverrides,
  setManualOverride,
  setOverrideFromCandidate
} from '../review/overrideWorkflow.js';
import { appendReviewSuggestion } from '../review/suggestions.js';
import { buildBillingReport } from '../billing/costLedger.js';
import { buildLearningReport } from '../features/indexing/learning/index.js';
import { runLlmHealthCheck } from '../core/llm/client/healthCheck.js';
import { CortexLifecycle } from '../core/llm/cortex/cortexLifecycle.js';
import { buildCortexTaskPlan } from '../core/llm/cortex/cortexRouter.js';
import { CortexClient } from '../core/llm/cortex/cortexClient.js';
import {
  bootstrapExpansionCategories,
  parseExpansionCategories,
  runFailureInjectionHarness,
  runFuzzSourceHealthHarness,
  runProductionHardeningReport,
  runQueueLoadHarness
} from '../features/expansion-hardening/index.js';
import {
  buildAccuracyTrend,
  buildLlmMetrics,
  buildSourceHealth,
  publishProducts,
  readPublishedChangelog,
  readPublishedProvenance,
  runAccuracyBenchmarkReport
} from '../publish/publishingPipeline.js';
import {
  reconcileDriftedProduct,
  scanAndEnqueueDriftedProducts
} from '../publish/driftScheduler.js';
import { startReviewQueueWebSocket } from '../review/queueWebSocket.js';
import { verifyGeneratedFieldRules } from '../ingest/fieldRulesVerify.js';
import {
  compileRules,
  compileRulesAll,
  fieldReport,
  initCategory,
  listFields,
  readCompileReport,
  rulesDiff,
  watchCompileRules,
  validateRules
} from '../field-rules/compiler.js';
import {
  buildAccuracyReport,
  createGoldenFixture,
  createGoldenFromCatalog,
  renderAccuracyReportMarkdown,
  validateGoldenFixtures
} from '../testing/goldenFiles.js';
import { generateTypesForCategory } from '../build/generate-types.js';
import { runQaJudge } from '../review/qaJudge.js';
import { computeCalibrationReport } from '../calibration/confidenceCalibrator.js';
import { reconcileOrphans } from '../features/catalog/products/reconciler.js';
import { IndexLabRuntimeBridge } from '../indexlab/runtimeBridge.js';
import fsNode from 'node:fs/promises';
import pathNode from 'node:path';
import { pathToFileURL } from 'node:url';

async function openSpecDbForCategory(config, category) {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return null;
  try {
    const { SpecDb } = await import('../db/specDb.js');
    const dbDir = pathNode.join(config.specDbDir || '.specfactory_tmp', normalizedCategory);
    await fsNode.mkdir(dbDir, { recursive: true });
    const dbPath = pathNode.join(dbDir, 'spec.sqlite');
    return new SpecDb({ dbPath, category: normalizedCategory });
  } catch {
    return null;
  }
}

function usage() {
  return [
    'Usage: node src/cli/spec.js <command> [options]',
    '',
    'Commands:',
    '  run-one --s3key <key> [--local] [--dry-run]',
    '  indexlab --category <category> --seed <product_id|s3key|url|title> [--product-id <id>] [--s3key <key>] [--brand <brand>] [--model <model>] [--variant <variant>] [--sku <sku>] [--fields <csv>] [--providers <csv>] [--out <dir>] [--run-id <run_id>] [--local]',
    '  run-ad-hoc <category> <brand> <model> [<variant>] [--seed-urls <csv>] [--until-complete] [--max-rounds <n>] [--local]',
    '  run-ad-hoc --category <category> --brand <brand> --model <model> [--variant <variant>] [--seed-urls <csv>] [--until-complete] [--max-rounds <n>] [--local]',
    '  run-batch --category <category> [--brand <brand>] [--strategy <explore|exploit|mixed|bandit>] [--local] [--dry-run]',
    '  run-until-complete --s3key <key> [--max-rounds <n>] [--local]',
    '  category-compile --category <category> [--field-studio-source <path>] [--map <path>] [--local]',
    '  compile-rules --category <category> [--field-studio-source <path>] [--map <path>] [--dry-run] [--watch] [--watch-seconds <n>] [--max-events <n>] [--local]',
    '  compile-rules --all [--dry-run] [--local]',
    '  compile-report --category <category> [--local]',
    '  rules-diff --category <category> [--local]',
    '  validate-rules --category <category> [--local]',
    '  init-category --category <category> [--template electronics] [--local]',
    '  list-fields --category <category> [--group <group>] [--required-level <level>] [--local]',
    '  field-report --category <category> [--format md|json] [--local]',
    '  field-rules-verify --category <category> [--fixture <path>] [--strict-bytes] [--local]',
    '  create-golden --category <category> --product-id <id> [--fields-json <json>] [--identity-json <json>] [--unknowns-json <json>] [--notes <text>] [--local]',
    '  create-golden --category <category> --from-catalog [--count <n>] [--product-id <id>] [--local]',
    '  test-golden --category <category> [--local]',
    '  calibrate-confidence --category <category> [--product-id <id>] [--local]',
    '  accuracy-report --category <category> [--format md|json] [--max-cases <n>] [--local]',
    '  accuracy-benchmark --category <category> [--period weekly|daily] [--max-cases <n>] [--golden-files] [--local]',
    '  accuracy-trend --category <category> --field <field> [--period <n>d|week|month] [--local]',
    '  generate-types --category <category> [--out-dir <path>] [--local]',
    '  publish --category <category> [--product-id <id>] [--all-approved] [--format all|csv|sqlite] [--local]',
    '  provenance --category <category> --product-id <id> [--field <field>|--full] [--local]',
    '  changelog --category <category> --product-id <id> [--local]',
    '  source-health --category <category> [--source <host_or_source_id>] [--period <n>d|week|month] [--local]',
    '  llm-metrics [--period <n>d|week|month] [--model <model>] [--local]',
    '  expansion-bootstrap [--categories monitor,keyboard] [--template electronics] [--helper-root <path>] [--categories-root <path>] [--golden-root <path>] [--local]',
    '  hardening-harness --category <category> [--products <n>] [--cycles <n>] [--fuzz-iterations <n>] [--seed <n>] [--failure-attempts <n>] [--local]',
    '  hardening-report [--root-dir <path>] [--local]',
    '  drift-scan --category <category> [--max-products <n>] [--enqueue true|false] [--local]',
    '  drift-reconcile --category <category> --product-id <id> [--auto-republish true|false] [--local]',
    '  discover --category <category> [--brand <brand>] [--local]',
    '  ingest-csv --category <category> --path <csv> [--imports-root <path>] [--local]',
    '  watch-imports [--imports-root <path>] [--category <category>|--all] [--once] [--local]',
    '  daemon [--imports-root <path>] [--category <category>|--all] [--once] [--local]',
    '  queue add --category <category> --brand <brand> --model <model> [--variant <variant>] [--priority <1-5>] [--local]',
    '  queue add --category <category> --product-id <id> [--s3key <key>] [--priority <1-5>] [--local]',
    '  queue add-batch --category <category> --file <csv> [--imports-root <path>] [--local]',
    '  queue list --category <category> [--status <status>] [--limit <n>] [--local]',
    '  queue stats --category <category> [--local]',
    '  queue retry --category <category> --product-id <id> [--local]',
    '  queue pause --category <category> --product-id <id> [--local]',
    '  queue clear --category <category> --status <status> [--local]',
    '  review layout --category <category> [--local]',
    '  review queue --category <category> [--status needs_review|queued|...] [--limit <n>] [--local]',
    '  review product --category <category> --product-id <id> [--without-candidates] [--local]',
    '  review build --category <category> [--product-id <id>] [--status <status>] [--local]',
    '  review ws-queue --category <category> [--status <status>] [--limit <n>] [--host <host>] [--port <port>] [--poll-seconds <n>] [--duration-seconds <n>] [--local]',
    '  review override --category <category> --product-id <id> --field <field> --candidate-id <id> [--reason <text>] [--reviewer <id>] [--local]',
    '  review approve-greens --category <category> --product-id <id> [--reason <text>] [--reviewer <id>] [--local]',
    '  review manual-override --category <category> --product-id <id> --field <field> --value <value> --evidence-url <url> --evidence-quote <quote> [--reason <text>] [--reviewer <id>] [--local]',
    '  review finalize --category <category> --product-id <id> [--apply] [--draft] [--reviewer <id>] [--local]',
    '  review metrics --category <category> [--window-hours <n>] [--local]',
    '  review suggest --category <category> --type enum|component|alias --field <field> --value <value> --evidence-url <url> --evidence-quote <quote> [--canonical <value>] [--reason <text>] [--reviewer <id>] [--product-id <id>] [--local]',
    '  billing-report [--month YYYY-MM] [--local]',
    '  learning-report --category <category> [--local]',
    '  explain-unk --category <category> --brand <brand> --model <model> [--variant <variant>] [--product-id <id>] [--local]',
    '  llm-health [--provider deepseek|openai|gemini] [--model <name>] [--local]',
    '  cortex-start [--local]',
    '  cortex-stop [--local]',
    '  cortex-restart [--local]',
    '  cortex-status [--local]',
    '  cortex-ensure [--local]',
    '  cortex-route-plan [--tasks-json <json>] [--context-json <json>] [--local]',
    '  cortex-run-pass [--tasks-json <json>] [--context-json <json>] [--local]',
    '  test-s3 [--fixture <path>] [--s3key <key>] [--dry-run]',
    '  sources-plan --category <category> [--local]',
    '  sources-report --category <category> [--top <n>] [--top-paths <n>] [--local]',
    '  benchmark --category <category> [--fixture <path>] [--max-cases <n>] [--local]',
    '  benchmark-golden --category <category> [--fixture <path>] [--max-cases <n>] [--local]',
    '  rebuild-index --category <category> [--local]',
    '  intel-graph-api --category <category> [--host <host>] [--port <port>] [--local]',
    '  product-reconcile --category <category> [--dry-run] [--local]',
    '  seed-db --category <category> [--local]',
    '  migrate-to-sqlite --category <category> [--phase <1-9>] [--local]',
    '',
    'Global options:',
    '  --env <path>   Path to dotenv file (default: .env)',
    '  --profile <standard|thorough|fast>   Runtime crawl profile (default: standard)',
    '  --thorough    Shortcut for --profile thorough'
  ].join('\n');
}

const CLI_DOTENV_OVERRIDE_KEYS = [
  'CONCURRENCY',
  'PER_HOST_MIN_DELAY_MS',
  'SERP_TRIAGE_MIN_SCORE',
  'SERP_TRIAGE_MAX_URLS',
  'LLM_FORCE_ROLE_MODEL_PROVIDER',
  'LLM_MAX_CALLS_PER_PRODUCT_TOTAL',
  'LLM_MAX_CALLS_PER_ROUND',
  'LLM_MAX_BATCHES_PER_PRODUCT',
  'LLM_VERIFY_MODE'
];

function applyEnvOverrides(env) {
  const previous = new Map();
  for (const [key, value] of Object.entries(env || {})) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      previous.set(key, process.env[key]);
    } else {
      previous.set(key, undefined);
    }
    if (value === undefined || value === null || value === '') {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function buildConfig(args) {
  const overrides = {
    writeMarkdownSummary: asBool(args['write-md'], true),
    localInputRoot: args['local-input-root'] || undefined,
    localOutputRoot: args['local-output-root'] || undefined,
    outputMode: args['output-mode'] || undefined,
    batchStrategy: args.strategy || undefined
  };
  if (args.local !== undefined) overrides.localMode = asBool(args.local);
  if (args['dry-run'] !== undefined) overrides.dryRun = asBool(args['dry-run']);
  if (args['mirror-to-s3'] !== undefined) overrides.mirrorToS3 = asBool(args['mirror-to-s3']);
  if (args['mirror-to-s3-input'] !== undefined) overrides.mirrorToS3Input = asBool(args['mirror-to-s3-input']);
  if (args['discovery-enabled'] !== undefined) overrides.discoveryEnabled = asBool(args['discovery-enabled']);
  if (args['search-provider']) overrides.searchProvider = args['search-provider'];
  if (args['fetch-candidate-sources'] !== undefined) overrides.fetchCandidateSources = asBool(args['fetch-candidate-sources']);
  return loadConfig(overrides);
}

async function filterKeysByBrand(storage, keys, brand) {
  if (!brand) {
    return keys;
  }

  const expected = String(brand).trim().toLowerCase();
  const selected = [];
  for (const key of keys) {
    const job = await storage.readJsonOrNull(key);
    if (!job) {
      continue;
    }
    const currentBrand = String(job.identityLock?.brand || '').trim().toLowerCase();
    if (currentBrand === expected) {
      selected.push(key);
    }
  }
  return selected;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current], current);
    }
  }

  const count = Math.max(1, concurrency);
  await Promise.all(Array.from({ length: count }, () => runWorker()));
  return results;
}

function normalizeBatchStrategy(value) {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'explore' || token === 'exploit' || token === 'mixed' || token === 'bandit') {
    return token;
  }
  return 'mixed';
}

async function collectBatchMetadata({ storage, config, category, key }) {
  const job = await storage.readJsonOrNull(key);
  const productId = job?.productId;
  const brand = String(job?.identityLock?.brand || '').trim().toLowerCase();

  if (!productId) {
    return {
      key,
      productId: '',
      brand,
      brandKey: slug(brand),
      hasHistory: false,
      validated: false,
      confidence: 0,
      missingCriticalCount: 0,
      fieldsBelowPassCount: 0,
      contradictionCount: 0,
      hypothesisQueueCount: 0
    };
  }

  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  const summary = await storage.readJsonOrNull(`${latestBase}/summary.json`);
  return {
    key,
    productId,
    brand,
    brandKey: slug(brand),
    hasHistory: Boolean(summary),
    validated: Boolean(summary?.validated),
    confidence: Number.parseFloat(String(summary?.confidence || 0)) || 0,
    missingCriticalCount: (summary?.critical_fields_below_pass_target || []).length,
    fieldsBelowPassCount: (summary?.fields_below_pass_target || []).length,
    contradictionCount: summary?.constraint_analysis?.contradiction_count || 0,
    hypothesisQueueCount: (summary?.hypothesis_queue || []).length
  };
}

function buildBrandRewardIndex(domains) {
  const buckets = new Map();

  for (const domain of Object.values(domains || {})) {
    for (const [brandKey, brandEntry] of Object.entries(domain?.per_brand || {})) {
      if (!buckets.has(brandKey)) {
        buckets.set(brandKey, {
          weighted: 0,
          weight: 0
        });
      }
      const bucket = buckets.get(brandKey);
      const attempts = Math.max(1, Number.parseFloat(String(brandEntry?.attempts || 0)) || 1);
      const fieldRewardStrength = Number.parseFloat(String(brandEntry?.field_reward_strength || 0)) || 0;
      const plannerScore = Number.parseFloat(String(brandEntry?.planner_score || 0)) || 0;
      const blended = (fieldRewardStrength * 0.7) + ((plannerScore - 0.5) * 0.3);
      bucket.weighted += blended * attempts;
      bucket.weight += attempts;
    }
  }

  const index = {};
  for (const [brandKey, bucket] of buckets.entries()) {
    index[brandKey] = bucket.weight > 0
      ? Number.parseFloat((bucket.weighted / bucket.weight).toFixed(6))
      : 0;
  }
  return index;
}

function scoreForExploit(meta) {
  let score = 0;
  score += meta.validated ? 2 : 0;
  score += meta.confidence || 0;
  score += meta.hasHistory ? 0.5 : 0;
  score -= (meta.missingCriticalCount || 0) * 0.25;
  return score;
}

function scoreForExplore(meta) {
  let score = 0;
  score += meta.hasHistory ? 0 : 2;
  score += (meta.missingCriticalCount || 0) * 0.6;
  score += meta.validated ? 0 : 0.8;
  score += Math.max(0, 1 - (meta.confidence || 0));
  return score;
}

function interleaveLists(left, right) {
  const output = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (i < left.length) {
      output.push(left[i]);
    }
    if (i < right.length) {
      output.push(right[i]);
    }
  }
  return output;
}

function orderBatchKeysByStrategy(keys, metadata, strategy, options = {}) {
  const rows = keys.map((key) => metadata.get(key)).filter(Boolean);
  if (strategy === 'bandit') {
    const ranked = rankBatchWithBandit({
      metadataRows: rows,
      brandRewardIndex: options.brandRewardIndex || {},
      seed: options.seed || new Date().toISOString().slice(0, 10),
      mode: 'balanced'
    });
    return {
      orderedKeys: ranked.orderedKeys,
      diagnostics: ranked.scored
    };
  }

  if (strategy === 'exploit') {
    return {
      orderedKeys: rows
      .sort((a, b) => scoreForExploit(b) - scoreForExploit(a) || a.key.localeCompare(b.key))
      .map((row) => row.key),
      diagnostics: []
    };
  }

  if (strategy === 'explore') {
    return {
      orderedKeys: rows
      .sort((a, b) => scoreForExplore(b) - scoreForExplore(a) || a.key.localeCompare(b.key))
      .map((row) => row.key),
      diagnostics: []
    };
  }

  const exploit = rows
    .slice()
    .sort((a, b) => scoreForExploit(b) - scoreForExploit(a) || a.key.localeCompare(b.key));
  const explore = rows
    .slice()
    .sort((a, b) => scoreForExplore(b) - scoreForExplore(a) || a.key.localeCompare(b.key));

  const seen = new Set();
  const mixed = [];
  for (const row of interleaveLists(exploit, explore)) {
    if (seen.has(row.key)) {
      continue;
    }
    seen.add(row.key);
    mixed.push(row.key);
  }
  return {
    orderedKeys: mixed,
    diagnostics: []
  };
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseJsonArg(name, value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error.message}`);
  }
}

async function assertCategorySchemaReady({ category, storage, config }) {
  let categoryConfig;
  try {
    categoryConfig = await loadCategoryConfig(category, { storage, config });
  } catch (error) {
    throw new Error(
      `Category '${category}' is not configured. Generate category_authority/${category}/_generated/field_rules.json first. (${error.message})`
    );
  }

  if (!Array.isArray(categoryConfig.fieldOrder) || categoryConfig.fieldOrder.length === 0) {
    throw new Error(`Category '${category}' has no field order in generated field rules.`);
  }
}

async function commandRunOne(config, storage, args) {
  const s3Key =
    args.s3key || `${config.s3InputPrefix}/mouse/products/mouse-razer-viper-v3-pro.json`;

  const result = await runProduct({ storage, config, s3Key });
  return {
    command: 'run-one',
    productId: result.productId,
    runId: result.runId,
    validated: result.summary.validated,
    validated_reason: result.summary.validated_reason,
    confidence: result.summary.confidence,
    completeness_required_percent: result.summary.completeness_required_percent,
    coverage_overall_percent: result.summary.coverage_overall_percent,
    runBase: result.exportInfo.runBase,
    latestBase: result.exportInfo.latestBase,
    finalBase: result.finalExport?.final_base || null
  };
}

async function commandIndexLab(config, storage, args) {
  const category = String(args.category || 'mouse').trim();
  const seed = String(args.seed || '').trim();
  const outRoot = String(args.out || defaultIndexLabRoot()).trim();
  const requestedRunIdRaw = String(args['run-id'] || '').trim();
  const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(requestedRunIdRaw)
    ? requestedRunIdRaw
    : '';
  const productIdArg = String(args['product-id'] || '').trim();
  const fields = parseCsvList(args.fields);
  const providerTokens = parseCsvList(args.providers).map((entry) => entry.toLowerCase());

  const buildInputKey = (pid) => {
    const normalized = String(pid || '').trim().replace(/\.json$/i, '');
    if (!normalized) return '';
    return toPosixKey(config.s3InputPrefix, category, 'products', `${normalized}.json`);
  };

  let s3Key = String(args.s3key || '').trim();
  if (!s3Key && productIdArg) {
    s3Key = buildInputKey(productIdArg);
  }

  if (!s3Key && seed) {
    if (seed.endsWith('.json') || seed.includes('/')) {
      s3Key = seed;
    } else if (!seed.includes(' ') && !looksHttpUrl(seed)) {
      s3Key = buildInputKey(seed);
    }
  }

  if (!s3Key) {
    const seedIsUrl = looksHttpUrl(seed);
    const brand = String(args.brand || 'unknown').trim() || 'unknown';
    const model = String(args.model || args.sku || '').trim() || 'unknown-model';
    const variant = String(args.variant || '').trim();
    const sku = String(args.sku || '').trim();
    const title = String(args.title || (!seedIsUrl ? seed : '')).trim();
    const generatedProductId = productIdArg
      || [category, slug(brand), slug(model), slug(variant), `indexlab-${Date.now()}`]
        .filter(Boolean)
        .join('-');
    const job = {
      productId: generatedProductId,
      category,
      identityLock: {
        brand,
        model,
        variant,
        sku,
        title
      },
      seedUrls: seedIsUrl ? [seed] : parseCsvList(args['seed-urls'])
    };
    if (fields.length > 0) {
      job.requirements = {
        requiredFields: fields
      };
    }
    s3Key = buildInputKey(generatedProductId);
    await storage.writeObject(
      s3Key,
      Buffer.from(JSON.stringify(job, null, 2), 'utf8'),
      { contentType: 'application/json' }
    );
  }

  const bridge = new IndexLabRuntimeBridge({
    outRoot,
    context: {
      category,
      s3Key
    }
  });
  if (typeof process.send === 'function') {
    bridge.onEvent = (row) => {
      if (row && row.__screencast) {
        try { process.send(row); } catch { /* ignore IPC errors */ }
      }
    };
    process.on('message', (msg) => {
      if (msg && msg.type === 'screencast_subscribe') {
        bridge.screencastTarget = String(msg.worker_id || '');
      }
      if (msg && msg.type === 'screencast_unsubscribe') {
        bridge.screencastTarget = '';
      }
    });
  }

  const onScreencastFrame = config.runtimeScreencastEnabled
    ? (frame) => bridge.broadcastScreencastFrame(frame)
    : undefined;

  const runConfig = {
    ...config,
    onRuntimeEvent: (row) => bridge.onRuntimeEvent(row),
    onScreencastFrame
  };
  const maxRunSecondsArg = Number.parseInt(String(args['max-run-seconds'] || '').trim(), 10);
  if (Number.isFinite(maxRunSecondsArg) && maxRunSecondsArg > 0) {
    runConfig.maxRunSeconds = maxRunSecondsArg;
    const runBudgetMs = maxRunSecondsArg * 1000;
    const boundedFetchTimeoutMs = Math.max(
      1_000,
      Math.min(
        Number(runConfig.pageGotoTimeoutMs || config.pageGotoTimeoutMs || 15_000),
        Math.floor(runBudgetMs / 3)
      )
    );
    runConfig.pageGotoTimeoutMs = boundedFetchTimeoutMs;
    runConfig.pageNetworkIdleTimeoutMs = Math.max(
      500,
      Math.min(
        Number(runConfig.pageNetworkIdleTimeoutMs || config.pageNetworkIdleTimeoutMs || 2_000),
        Math.floor(boundedFetchTimeoutMs / 2)
      )
    );
    runConfig.robotsTxtTimeoutMs = Math.max(
      500,
      Math.min(
        Number(runConfig.robotsTxtTimeoutMs || config.robotsTxtTimeoutMs || 6_000),
        boundedFetchTimeoutMs
      )
    );
    runConfig.dynamicFetchRetryBudget = 0;
    runConfig.dynamicFetchRetryBackoffMs = 0;
    runConfig.fetchSchedulerMaxRetries = 0;
    runConfig.fetchSchedulerDefaultMaxRetries = 0;
    runConfig.sourceFetchWrapperAttempts = 1;
    runConfig.sourceFetchWrapperBackoffMs = 0;
  }
  const discoveryEnabledArg = asBool(args['discovery-enabled'], undefined);
  const searchProviderArg = String(args['search-provider'] || '').trim().toLowerCase();
  if (providerTokens.length === 1) {
    runConfig.searchProvider = providerTokens[0];
  } else if (providerTokens.length > 1) {
    runConfig.searchProvider = 'dual';
  }
  if (searchProviderArg) {
    runConfig.searchProvider = searchProviderArg;
  }
  if (typeof discoveryEnabledArg === 'boolean') {
    runConfig.discoveryEnabled = discoveryEnabledArg;
  } else if (String(runConfig.searchProvider || '').trim().toLowerCase() !== 'none') {
    runConfig.discoveryEnabled = true;
  }
  if (
    Number.isFinite(maxRunSecondsArg) && maxRunSecondsArg > 0
    && discoveryEnabledArg === false
    && String(runConfig.searchProvider || '').trim().toLowerCase() === 'none'
  ) {
    runConfig.preferHttpFetcher = true;
    runConfig.concurrency = 1;
    runConfig.fetchPerHostConcurrencyCap = 1;
    runConfig.maxUrlsPerProduct = Math.min(
      Number(runConfig.maxUrlsPerProduct || config.maxUrlsPerProduct || 12),
      4
    );
    runConfig.maxPagesPerDomain = Math.min(
      Number(runConfig.maxPagesPerDomain || config.maxPagesPerDomain || 4),
      2
    );
  }

  const result = await runProduct({
    storage,
    config: runConfig,
    s3Key,
    runIdOverride: requestedRunId || undefined,
  });

  bridge.setContext({
    category,
    productId: result.productId,
    s3Key
  });
  await bridge.finalize({
    status: 'completed',
    run_id: result.runId,
    run_base: result.exportInfo?.runBase || '',
    latest_base: result.exportInfo?.latestBase || ''
  });

  return {
    command: 'indexlab',
    category,
    productId: result.productId,
    runId: result.runId,
    s3Key,
    validated: result.summary.validated,
    confidence: result.summary.confidence,
    completeness_required_percent: result.summary.completeness_required_percent,
    coverage_overall_percent: result.summary.coverage_overall_percent,
    runBase: result.exportInfo.runBase,
    latestBase: result.exportInfo.latestBase,
    indexlab: {
      out_root: pathNode.resolve(outRoot),
      run_dir: pathNode.resolve(outRoot, result.runId),
      events_path: pathNode.resolve(outRoot, result.runId, 'run_events.ndjson'),
      run_meta_path: pathNode.resolve(outRoot, result.runId, 'run.json')
    }
  };
}

async function commandRunAdHoc(config, storage, args) {
  const positional = args._ || [];
  const category = String(args.category || positional[0] || 'mouse').trim();
  const brand = String(args.brand || positional[1] || '').trim();
  const model = String(args.model || positional[2] || '').trim();
  const variant = String(args.variant || positional.slice(3).join(' ') || '').trim();

  if (!brand || !model) {
    throw new Error('run-ad-hoc requires <category> <brand> <model> or --brand/--model');
  }

  await assertCategorySchemaReady({ category, storage, config });

  const autoProductId = [category, slug(brand), slug(model), slug(variant)]
    .filter(Boolean)
    .join('-');
  const productId = String(args['product-id'] || autoProductId || `${category}-${Date.now()}`).trim();

  const identityLock = {
    brand,
    model,
    variant,
    sku: String(args.sku || '').trim(),
    mpn: String(args.mpn || '').trim(),
    gtin: String(args.gtin || '').trim()
  };

  const seedUrls = parseCsvList(args['seed-urls']);
  const anchors = parseJsonArg('anchors-json', args['anchors-json'], {});
  const requirements = parseJsonArg('requirements-json', args['requirements-json'], null);

  const job = {
    productId,
    category,
    identityLock,
    seedUrls,
    anchors
  };
  if (requirements) {
    job.requirements = requirements;
  }

  const s3Key =
    args.s3key || toPosixKey(config.s3InputPrefix, category, 'products', `${productId}.json`);

  await storage.writeObject(
    s3Key,
    Buffer.from(JSON.stringify(job, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );

  if (asBool(args['until-complete'], false)) {
    const maxRounds = Math.max(1, Number.parseInt(String(args['max-rounds'] || '0'), 10) || 0);
    const completed = await runUntilComplete({
      storage,
      config,
      s3key: s3Key,
      maxRounds: maxRounds || undefined,
    });
    return {
      command: 'run-ad-hoc',
      until_complete: true,
      s3Key,
      productId: completed.productId,
      ...completed
    };
  }

  const result = await runProduct({ storage, config, s3Key });
  return {
    command: 'run-ad-hoc',
    s3Key,
    productId: result.productId,
    runId: result.runId,
    validated: result.summary.validated,
    validated_reason: result.summary.validated_reason,
    confidence: result.summary.confidence,
    completeness_required_percent: result.summary.completeness_required_percent,
    coverage_overall_percent: result.summary.coverage_overall_percent,
    runBase: result.exportInfo.runBase,
    latestBase: result.exportInfo.latestBase,
    finalBase: result.finalExport?.final_base || null
  };
}

async function commandRunUntilComplete(config, storage, args) {
  const s3key = String(args.s3key || '').trim();
  if (!s3key) {
    throw new Error('run-until-complete requires --s3key <key>');
  }
  const maxRounds = Math.max(1, Number.parseInt(String(args['max-rounds'] || '0'), 10) || 0);
  const result = await runUntilComplete({
    storage,
    config,
    s3key,
    maxRounds: maxRounds || undefined,
  });
  return {
    command: 'run-until-complete',
    ...result
  };
}

async function commandCategoryCompile(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('category-compile requires --category <category>');
  }
  const fieldStudioSourcePath = String(args['field-studio-source'] || '').trim();
  const mapPath = String(args.map || '').trim();
  const result = await compileCategoryFieldStudio({
    category,
    fieldStudioSourcePath,
    config,
    mapPath: mapPath || null
  });
  return {
    command: 'category-compile',
    ...result
  };
}

async function commandCompileRules(config, _storage, args) {
  const all = asBool(args.all, false);
  const watch = asBool(args.watch, false);
  const fieldStudioSourcePath = String(args['field-studio-source'] || '').trim();
  const mapPath = String(args.map || '').trim();
  const dryRun = asBool(args['dry-run'], false);
  if (all) {
    if (watch) {
      throw new Error('compile-rules --all does not support --watch');
    }
    const result = await compileRulesAll({
      dryRun,
      config
    });
    return {
      command: 'compile-rules',
      mode: 'all',
      ...result
    };
  }

  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('compile-rules requires --category <category> or --all');
  }
  if (watch) {
    const watchSeconds = Math.max(0, Number.parseInt(String(args['watch-seconds'] || '0'), 10) || 0);
    const maxEvents = Math.max(0, Number.parseInt(String(args['max-events'] || '0'), 10) || 0);
    const debounceMs = Math.max(50, Number.parseInt(String(args['debounce-ms'] || '500'), 10) || 500);
    const watchResult = await watchCompileRules({
      category,
      config,
      fieldStudioSourcePath,
      mapPath: mapPath || null,
      watchSeconds,
      maxEvents,
      debounceMs
    });
    return {
      command: 'compile-rules',
      mode: 'watch',
      ...watchResult
    };
  }
  const result = await compileRules({
    category,
    fieldStudioSourcePath,
    dryRun,
    config,
    mapPath: mapPath || null
  });
  return {
    command: 'compile-rules',
    ...result
  };
}

async function commandCompileReport(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('compile-report requires --category <category>');
  }
  const result = await readCompileReport({
    category,
    config
  });
  return {
    command: 'compile-report',
    ...result
  };
}

async function commandRulesDiff(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('rules-diff requires --category <category>');
  }
  const result = await rulesDiff({
    category,
    config
  });
  return {
    command: 'rules-diff',
    ...result
  };
}

async function commandCreateGolden(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('create-golden requires --category <category>');
  }
  const fromCatalog = asBool(args['from-catalog'], false);
  if (fromCatalog) {
    const count = Math.max(1, Number.parseInt(String(args.count || '50'), 10) || 50);
    const productId = String(args['product-id'] || '').trim();
    const result = await createGoldenFromCatalog({
      category,
      count,
      productId,
      config
    });
    return {
      command: 'create-golden',
      mode: 'from-catalog',
      ...result
    };
  }

  const productId = String(args['product-id'] || '').trim();
  if (!productId) {
    throw new Error('create-golden requires --product-id <id> when --from-catalog is not set');
  }
  const identity = parseJsonArg('identity-json', args['identity-json'], {});
  const fields = parseJsonArg('fields-json', args['fields-json'], {});
  const expectedUnknowns = parseJsonArg('unknowns-json', args['unknowns-json'], {});
  const notes = String(args.notes || '').trim();

  const result = await createGoldenFixture({
    category,
    productId,
    identity,
    fields,
    expectedUnknowns,
    notes,
    config
  });
  return {
    command: 'create-golden',
    mode: 'single',
    ...result
  };
}

async function commandTestGolden(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('test-golden requires --category <category>');
  }
  const result = await validateGoldenFixtures({
    category,
    config
  });
  return {
    command: 'test-golden',
    ...result
  };
}

async function commandQaJudge(config, storage, args) {
  const category = String(args.category || '').trim();
  const productId = String(args['product-id'] || args.product || '').trim();
  if (!category || !productId) {
    throw new Error('qa-judge requires --category <category> --product-id <id>');
  }
  return runQaJudge({
    storage,
    config,
    category,
    productId
  });
}

async function commandCalibrateConfidence(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('calibrate-confidence requires --category <category>');
  }
  const productId = String(args['product-id'] || '').trim();

  // Collect predictions from latest run summaries
  const predictions = [];
  const productIds = [];

  if (productId) {
    productIds.push(productId);
  } else {
    const allKeys = await storage.listInputKeys(category);
    for (const key of allKeys) {
      const job = await storage.readJsonOrNull(key);
      if (job?.productId) productIds.push(job.productId);
    }
  }

  for (const pid of productIds) {
    const latestBase = storage.resolveOutputKey(category, pid, 'latest');
    const summary = await storage.readJsonOrNull(`${latestBase}/summary.json`);
    const normalized = await storage.readJsonOrNull(`${latestBase}/normalized.json`);
    if (!normalized?.fields) continue;

    for (const [field, value] of Object.entries(normalized.fields)) {
      const token = String(value ?? '').trim().toLowerCase();
      if (token === 'unk' || token === '') continue;
      const confidence = Number.parseFloat(
        String(summary?.field_confidence?.[field] ?? summary?.confidence ?? 0.5)
      ) || 0.5;
      predictions.push({ field, value, confidence, product_id: pid });
    }
  }

  // Load ground truth from golden files
  const goldenDir = `fixtures/golden/${category}`;
  const goldenKeys = await storage.listKeys?.(goldenDir) || [];
  const groundTruth = {};
  for (const gk of goldenKeys) {
    if (!gk.endsWith('.json')) continue;
    const golden = await storage.readJsonOrNull(gk);
    if (!golden?.expected_fields) continue;
    for (const [field, value] of Object.entries(golden.expected_fields)) {
      if (!groundTruth[field]) groundTruth[field] = value;
    }
  }

  const report = computeCalibrationReport({ predictions, groundTruth });
  return {
    command: 'calibrate-confidence',
    category,
    product_count: productIds.length,
    ...report
  };
}

async function commandAccuracyReport(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('accuracy-report requires --category <category>');
  }
  const format = String(args.format || 'json').trim().toLowerCase();
  const maxCases = Math.max(0, Number.parseInt(String(args['max-cases'] || '0'), 10) || 0);
  const report = await buildAccuracyReport({
    category,
    storage,
    config,
    maxCases
  });
  if (format === 'md') {
    return {
      command: 'accuracy-report',
      format: 'md',
      category: report.category,
      report_markdown: renderAccuracyReportMarkdown(report),
      report
    };
  }
  return {
    command: 'accuracy-report',
    format: 'json',
    ...report
  };
}

async function commandAccuracyBenchmark(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('accuracy-benchmark requires --category <category>');
  }
  const maxCases = Math.max(0, Number.parseInt(String(args['max-cases'] || '0'), 10) || 0);
  const period = String(args.period || 'weekly').trim().toLowerCase();
  const report = await runAccuracyBenchmarkReport({
    storage,
    config,
    category,
    period,
    maxCases
  });
  return {
    command: 'accuracy-benchmark',
    ...report
  };
}

async function commandAccuracyTrend(_config, storage, args) {
  const category = String(args.category || '').trim();
  const field = String(args.field || '').trim();
  if (!category || !field) {
    throw new Error('accuracy-trend requires --category <category> and --field <field>');
  }
  const period = String(args.period || '90d').trim();
  const result = await buildAccuracyTrend({
    storage,
    category,
    field,
    periodDays: period
  });
  return {
    command: 'accuracy-trend',
    ...result
  };
}

async function commandPublish(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('publish requires --category <category>');
  }
  const productIds = [];
  const singleProductId = String(args['product-id'] || '').trim();
  if (singleProductId) {
    productIds.push(singleProductId);
  }
  for (const productId of parseCsvList(args['product-ids'])) {
    productIds.push(productId);
  }
  const result = await publishProducts({
    storage,
    config,
    category,
    productIds,
    allApproved: asBool(args['all-approved'], false),
    format: String(args.format || 'all').trim().toLowerCase()
  });
  return {
    command: 'publish',
    ...result
  };
}

async function commandProvenance(_config, storage, args) {
  const category = String(args.category || '').trim();
  const productId = String(args['product-id'] || '').trim();
  if (!category || !productId) {
    throw new Error('provenance requires --category <category> and --product-id <id>');
  }
  const field = String(args.field || '').trim();
  const full = asBool(args.full, false);
  const result = await readPublishedProvenance({
    storage,
    category,
    productId,
    field,
    full
  });
  return {
    command: 'provenance',
    ...result
  };
}

async function commandChangelog(_config, storage, args) {
  const category = String(args.category || '').trim();
  const productId = String(args['product-id'] || '').trim();
  if (!category || !productId) {
    throw new Error('changelog requires --category <category> and --product-id <id>');
  }
  const result = await readPublishedChangelog({
    storage,
    category,
    productId
  });
  return {
    command: 'changelog',
    ...result
  };
}

async function commandSourceHealth(_config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('source-health requires --category <category>');
  }
  const result = await buildSourceHealth({
    storage,
    category,
    source: String(args.source || '').trim(),
    periodDays: String(args.period || '30d').trim()
  });
  return {
    command: 'source-health',
    ...result
  };
}

async function commandLlmMetrics(config, storage, args) {
  const result = await buildLlmMetrics({
    storage,
    config,
    period: String(args.period || 'week').trim(),
    model: String(args.model || '').trim()
  });
  return {
    command: 'llm-metrics',
    ...result
  };
}

async function commandExpansionBootstrap(config, _storage, args, commandName = 'expansion-bootstrap') {
  const categories = parseExpansionCategories(args.categories, ['monitor', 'keyboard']);
  const template = String(args.template || 'electronics').trim() || 'electronics';
  const helperRoot = String(
    args['helper-root'] || config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority'
  ).trim();
  const categoriesRoot = String(args['categories-root'] || 'categories').trim();
  const goldenRoot = String(args['golden-root'] || 'fixtures/golden').trim();
  const result = await bootstrapExpansionCategories({
    config: {
      ...config,
      categoryAuthorityRoot: helperRoot,
      ['helper' + 'FilesRoot']: helperRoot,
      categoriesRoot
    },
    categories,
    template,
    goldenRoot
  });
  return {
    command: commandName,
    ...result
  };
}

async function commandHardeningHarness(config, storage, args) {
  const category = String(args.category || 'mouse').trim() || 'mouse';
  const products = Math.max(1, Number.parseInt(String(args.products || '200'), 10) || 200);
  const cycles = Math.max(1, Number.parseInt(String(args.cycles || '100'), 10) || 100);
  const fuzzIterations = Math.max(1, Number.parseInt(String(args['fuzz-iterations'] || '200'), 10) || 200);
  const seed = Math.max(1, Number.parseInt(String(args.seed || '1337'), 10) || 1337);
  const failureAttempts = Math.max(1, Number.parseInt(String(args['failure-attempts'] || '3'), 10) || 3);

  const queueLoad = await runQueueLoadHarness({
    storage,
    category,
    productCount: products,
    selectCycles: cycles
  });
  const failureInjection = await runFailureInjectionHarness({
    storage,
    category,
    maxAttempts: failureAttempts
  });
  const fuzzSourceHealth = await runFuzzSourceHealthHarness({
    storage,
    category,
    iterations: fuzzIterations,
    seed
  });
  return {
    command: 'hardening-harness',
    category,
    queue_load: queueLoad,
    failure_injection: failureInjection,
    fuzz_source_health: fuzzSourceHealth,
    passed: Boolean(queueLoad.select_cycles_completed > 0 && failureInjection.passed && fuzzSourceHealth.passed)
  };
}

async function commandHardeningReport(_config, _storage, args) {
  const rootDir = String(args['root-dir'] || process.cwd()).trim() || process.cwd();
  const report = await runProductionHardeningReport({
    rootDir
  });
  return {
    command: 'hardening-report',
    ...report
  };
}

async function commandDriftScan(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('drift-scan requires --category <category>');
  }
  const maxProducts = Math.max(1, Number.parseInt(String(args['max-products'] || '250'), 10) || 250);
  const result = await scanAndEnqueueDriftedProducts({
    storage,
    config,
    category,
    maxProducts,
    queueOnChange: asBool(args.enqueue, true)
  });
  return {
    command: 'drift-scan',
    ...result
  };
}

async function commandDriftReconcile(config, storage, args) {
  const category = String(args.category || '').trim();
  const productId = String(args['product-id'] || '').trim();
  if (!category || !productId) {
    throw new Error('drift-reconcile requires --category <category> and --product-id <id>');
  }
  const result = await reconcileDriftedProduct({
    storage,
    config,
    category,
    productId,
    autoRepublish: asBool(args['auto-republish'], true)
  });
  return {
    command: 'drift-reconcile',
    ...result
  };
}

async function commandProductReconcile(config, storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('product-reconcile requires --category <category>');
  }
  const dryRun = asBool(args['dry-run'], true);
  const result = await reconcileOrphans({
    storage,
    category,
    config,
    dryRun
  });
  return result;
}

async function commandGenerateTypes(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('generate-types requires --category <category>');
  }
  const outDir = String(args['out-dir'] || '').trim();
  const result = await generateTypesForCategory({
    category,
    config,
    outDir
  });
  return {
    command: 'generate-types',
    ...result
  };
}

async function commandValidateRules(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('validate-rules requires --category <category>');
  }
  const result = await validateRules({
    category,
    config
  });
  return {
    command: 'validate-rules',
    ...result
  };
}

async function commandInitCategory(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('init-category requires --category <category>');
  }
  const template = String(args.template || 'electronics').trim() || 'electronics';
  const result = await initCategory({
    category,
    template,
    config
  });
  return {
    command: 'init-category',
    ...result
  };
}

async function commandListFields(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('list-fields requires --category <category>');
  }
  const result = await listFields({
    category,
    config,
    group: String(args.group || ''),
    requiredLevel: String(args['required-level'] || '')
  });
  return {
    command: 'list-fields',
    ...result
  };
}

async function commandFieldReport(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('field-report requires --category <category>');
  }
  const format = String(args.format || 'md').trim().toLowerCase();
  const result = await fieldReport({
    category,
    config,
    format
  });
  return {
    command: 'field-report',
    ...result
  };
}

async function commandFieldRulesVerify(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) {
    throw new Error('field-rules-verify requires --category <category>');
  }
  const fixturePath = String(args.fixture || '').trim();
  const strictBytes = asBool(args['strict-bytes'], false);
  const result = await verifyGeneratedFieldRules({
    category,
    config,
    fixturePath,
    strictBytes
  });
  return {
    command: 'field-rules-verify',
    ...result
  };
}

async function commandIngestCsv(config, storage, args) {
  const category = String(args.category || '').trim();
  const csvPath = String(args.path || '').trim();
  if (!category) {
    throw new Error('ingest-csv requires --category <category>');
  }
  if (!csvPath) {
    throw new Error('ingest-csv requires --path <csv>');
  }
  await assertCategorySchemaReady({ category, storage, config });
  const result = await ingestCsvFile({
    storage,
    config,
    category,
    csvPath,
    importsRoot: args['imports-root'] || config.importsRoot
  });
  return {
    command: 'ingest-csv',
    ...result
  };
}

async function commandWatchImports(config, storage, args) {
  const importsRoot = args['imports-root'] || config.importsRoot;
  const category = args.category || null;
  const all = asBool(args.all, !category);
  const once = asBool(args.once, false);
  const logger = new EventLogger({
    storage,
    runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
    context: {
      category
    }
  });
  const result = await runWatchImports({
    storage,
    config,
    importsRoot,
    category,
    all,
    once,
    logger
  });
  await logger.flush();
  return {
    command: 'watch-imports',
    ...result,
    events: logger.events.slice(-100)
  };
}

async function commandDaemon(config, storage, args) {
  const importsRoot = args['imports-root'] || config.importsRoot;
  const category = args.category || null;
  const all = asBool(args.all, !category);
  const once = asBool(args.once, false);
  const logger = new EventLogger({
    storage,
    runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
    context: {
      category: category || 'all'
    }
  });

  const result = await runDaemon({
    storage,
    config,
    importsRoot,
    category,
    all,
    once,
    logger
  });
  await logger.flush();
  return {
    command: 'daemon',
    ...result,
    events: logger.events.slice(-200)
  };
}

function parseQueuePriority(value, fallback = 3) {
  const parsed = Number.parseInt(String(value || ''), 10);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(5, resolved));
}

const commandQueue = createQueueCommand({
  slug,
  toPosixKey,
  parseCsvList,
  parseJsonArg,
  parseQueuePriority,
  asBool,
  ingestCsvFile,
  upsertQueueProduct,
  syncQueueFromInputs,
  listQueueProducts,
  loadQueueState,
  clearQueueByStatus,
});

const commandReview = createReviewCommand({
  asBool,
  parseJsonArg,
  openSpecDbForCategory,
  buildReviewLayout,
  buildReviewQueue,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  writeCategoryReviewArtifacts,
  startReviewQueueWebSocket,
  setOverrideFromCandidate,
  approveGreenOverrides,
  setManualOverride,
  finalizeOverrides,
  buildReviewMetrics,
  appendReviewSuggestion,
});

async function commandRunBatch(config, storage, args) {
  const category = args.category || 'mouse';
  const categoryConfig = await loadCategoryConfig(category, { storage, config });
  const allKeys = await storage.listInputKeys(category);
  const keys = await filterKeysByBrand(storage, allKeys, args.brand);
  const strategy = normalizeBatchStrategy(args.strategy || config.batchStrategy || 'mixed');
  const metadataRows = await runWithConcurrency(keys, config.concurrency, async (key) =>
    collectBatchMetadata({ storage, config, category, key })
  );
  const metadataByKey = new Map(metadataRows.map((row) => [row.key, row]));
  const intel = await loadSourceIntel({ storage, config, category });
  const brandRewardIndex = buildBrandRewardIndex(intel.data.domains || {});
  const schedule = orderBatchKeysByStrategy(keys, metadataByKey, strategy, {
    brandRewardIndex,
    seed: `${category}:${new Date().toISOString().slice(0, 10)}`
  });
  const orderedKeys = schedule.orderedKeys;

  const runs = await runWithConcurrency(orderedKeys, config.concurrency, async (key) => {
    try {
      const result = await runProduct({ storage, config, s3Key: key });
      return {
        key,
        productId: result.productId,
        runId: result.runId,
        validated: result.summary.validated,
        validated_reason: result.summary.validated_reason
      };
    } catch (error) {
      return {
        key,
        error: error.message
      };
    }
  });

  return {
    command: 'run-batch',
    category,
    brand: args.brand || null,
    strategy,
    total_inputs: allKeys.length,
    selected_inputs: keys.length,
    concurrency: config.concurrency,
    scheduled_order: orderedKeys,
    bandit_preview: strategy === 'bandit'
      ? (schedule.diagnostics || []).slice(0, 25).map((row) => ({
        key: row.key,
        productId: row.productId,
        bandit_score: row.bandit_score,
        thompson: row.thompson,
        ucb: row.ucb,
        info_need: row.info_need,
        mean_reward: row.mean_reward,
        brand_reward: row.brandReward
      }))
      : [],
    runs
  };
}

const commandDiscover = createDiscoverCommand({
  loadCategoryConfig,
  discoverCandidateSources,
  EventLogger,
  buildRunId,
});

const commandSourcesReport = createSourcesReportCommand({
  loadSourceIntel,
  promotionSuggestionsKey,
});

const commandSourcesPlan = createSourcesPlanCommand({
  loadCategoryConfig,
  generateSourceExpansionPlans,
});

const commandRebuildIndex = createRebuildIndexCommand({
  rebuildCategoryIndex,
});

const commandBenchmark = createBenchmarkCommand({
  runGoldenBenchmark,
});

const commandIntelGraphApi = createIntelGraphApiCommand({
  startIntelGraphApi,
});

const commandBillingReport = createBillingReportCommand({
  buildBillingReport,
});

const commandLearningReport = createLearningReportCommand({
  buildLearningReport,
});

const commandExplainUnk = createExplainUnkCommand({
  slug,
});

const commandLlmHealth = createLlmHealthCommand({
  runLlmHealthCheck,
});

function parseJsonArgSafe(name, value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error.message}`);
  }
}

function createCortexLifecycle(config) {
  return new CortexLifecycle({
    CHATMOCK_DIR: config.chatmockDir,
    CHATMOCK_COMPOSE_FILE: config.chatmockComposeFile,
    CORTEX_BASE_URL: config.cortexBaseUrl,
    CORTEX_AUTO_START: String(config.cortexAutoStart),
    CORTEX_ENSURE_READY_TIMEOUT_MS: config.cortexEnsureReadyTimeoutMs,
    CORTEX_START_READY_TIMEOUT_MS: config.cortexStartReadyTimeoutMs
  });
}

async function commandCortexLifecycle(config, _storage, action) {
  const lifecycle = createCortexLifecycle(config);
  if (action === 'start') {
    const result = await lifecycle.start();
    return { command: 'cortex-start', ...result };
  }
  if (action === 'stop') {
    const result = await lifecycle.stop();
    return { command: 'cortex-stop', ...result };
  }
  if (action === 'restart') {
    const result = await lifecycle.restart();
    return { command: 'cortex-restart', ...result };
  }
  if (action === 'ensure') {
    const result = await lifecycle.ensureRunning();
    return { command: 'cortex-ensure', ...result };
  }
  const result = await lifecycle.status();
  return { command: 'cortex-status', ...result };
}

async function commandCortexRoutePlan(config, _storage, args) {
  const tasks = parseJsonArgSafe('tasks-json', args['tasks-json'], [
    { id: 'audit-default', type: 'evidence_audit', critical: true },
    { id: 'triage-default', type: 'conflict_resolution', critical: true }
  ]);
  const context = parseJsonArgSafe('context-json', args['context-json'], {
    confidence: 0.9,
    critical_conflicts_remain: false,
    critical_gaps_remain: false,
    evidence_audit_failed_on_critical: false
  });
  const plan = buildCortexTaskPlan({
    tasks: Array.isArray(tasks) ? tasks : [],
    context: (context && typeof context === 'object') ? context : {},
    config
  });
  return {
    command: 'cortex-route-plan',
    ...plan
  };
}

async function commandCortexRunPass(config, _storage, args) {
  const tasks = parseJsonArgSafe('tasks-json', args['tasks-json'], [
    { id: 'audit-default', type: 'evidence_audit', critical: true }
  ]);
  const context = parseJsonArgSafe('context-json', args['context-json'], {
    confidence: 0.9,
    critical_conflicts_remain: false,
    critical_gaps_remain: false,
    evidence_audit_failed_on_critical: false
  });
  const client = new CortexClient({ config });
  const result = await client.runPass({
    tasks: Array.isArray(tasks) ? tasks : [],
    context: (context && typeof context === 'object') ? context : {}
  });
  return {
    command: 'cortex-run-pass',
    ...result
  };
}

async function commandTestS3() {
  const output = await runS3Integration(process.argv.slice(3));
  return {
    command: 'test-s3',
    ...output
  };
}

async function commandSeedDb(config, _storage, args) {
  const category = String(args.category || '').trim();
  if (!category) throw new Error('seed-db requires --category');

  const { SpecDb } = await import('../db/specDb.js');
  const { syncSpecDbForCategory } = await import('../api/services/specDbSyncService.js');

  const dbDir = pathNode.join(config.specDbDir || '.specfactory_tmp', category);
  await fsNode.mkdir(dbDir, { recursive: true });
  const dbPath = pathNode.join(dbDir, 'spec.sqlite');
  const db = new SpecDb({ dbPath, category });

  try {
    const result = await syncSpecDbForCategory({
      category,
      config,
      getSpecDbReady: async () => db,
    });
    return { command: 'seed-db', category, db_path: dbPath, ...result };
  } finally {
    db.close();
  }
}

const commandMigrateToSqlite = createMigrateToSqliteCommand({
  openSpecDbForCategory,
  toPosixKey,
  fsNode,
  pathNode,
  now: () => Date.now(),
});

const dispatchCliCommand = createCliCommandDispatcher({
  handlers: {
    'run-one': ({ config, storage, args }) => commandRunOne(config, storage, args),
    indexlab: ({ config, storage, args }) => commandIndexLab(config, storage, args),
    'run-ad-hoc': ({ config, storage, args }) => commandRunAdHoc(config, storage, args),
    'run-until-complete': ({ config, storage, args }) => commandRunUntilComplete(config, storage, args),
    'category-compile': ({ config, storage, args }) => commandCategoryCompile(config, storage, args),
    'compile-rules': ({ config, storage, args }) => commandCompileRules(config, storage, args),
    'compile-report': ({ config, storage, args }) => commandCompileReport(config, storage, args),
    'rules-diff': ({ config, storage, args }) => commandRulesDiff(config, storage, args),
    'validate-rules': ({ config, storage, args }) => commandValidateRules(config, storage, args),
    'init-category': ({ config, storage, args }) => commandInitCategory(config, storage, args),
    'list-fields': ({ config, storage, args }) => commandListFields(config, storage, args),
    'field-report': ({ config, storage, args }) => commandFieldReport(config, storage, args),
    'field-rules-verify': ({ config, storage, args }) => commandFieldRulesVerify(config, storage, args),
    'create-golden': ({ config, storage, args }) => commandCreateGolden(config, storage, args),
    'test-golden': ({ config, storage, args }) => commandTestGolden(config, storage, args),
    'qa-judge': ({ config, storage, args }) => commandQaJudge(config, storage, args),
    'calibrate-confidence': ({ config, storage, args }) => commandCalibrateConfidence(config, storage, args),
    'accuracy-report': ({ config, storage, args }) => commandAccuracyReport(config, storage, args),
    'accuracy-benchmark': ({ config, storage, args }) => commandAccuracyBenchmark(config, storage, args),
    'accuracy-trend': ({ config, storage, args }) => commandAccuracyTrend(config, storage, args),
    'generate-types': ({ config, storage, args }) => commandGenerateTypes(config, storage, args),
    publish: ({ config, storage, args }) => commandPublish(config, storage, args),
    provenance: ({ config, storage, args }) => commandProvenance(config, storage, args),
    changelog: ({ config, storage, args }) => commandChangelog(config, storage, args),
    'source-health': ({ config, storage, args }) => commandSourceHealth(config, storage, args),
    'llm-metrics': ({ config, storage, args }) => commandLlmMetrics(config, storage, args),
    'expansion-bootstrap': ({ config, storage, args }) => (
      commandExpansionBootstrap(config, storage, args, 'expansion-bootstrap')
    ),
    'hardening-harness': ({ config, storage, args }) => commandHardeningHarness(config, storage, args),
    'hardening-report': ({ config, storage, args }) => commandHardeningReport(config, storage, args),
    'drift-scan': ({ config, storage, args }) => commandDriftScan(config, storage, args),
    'drift-reconcile': ({ config, storage, args }) => commandDriftReconcile(config, storage, args),
    'run-batch': ({ config, storage, args }) => commandRunBatch(config, storage, args),
    discover: ({ config, storage, args }) => commandDiscover(config, storage, args),
    'ingest-csv': ({ config, storage, args }) => commandIngestCsv(config, storage, args),
    'watch-imports': ({ config, storage, args }) => commandWatchImports(config, storage, args),
    daemon: ({ config, storage, args }) => commandDaemon(config, storage, args),
    queue: ({ config, storage, args }) => commandQueue(config, storage, args),
    review: ({ config, storage, args }) => commandReview(config, storage, args),
    'billing-report': ({ config, storage, args }) => commandBillingReport(config, storage, args),
    'learning-report': ({ config, storage, args }) => commandLearningReport(config, storage, args),
    'explain-unk': ({ config, storage, args }) => commandExplainUnk(config, storage, args),
    'llm-health': ({ config, storage, args }) => commandLlmHealth(config, storage, args),
    'cortex-start': ({ config, storage }) => commandCortexLifecycle(config, storage, 'start'),
    'cortex-stop': ({ config, storage }) => commandCortexLifecycle(config, storage, 'stop'),
    'cortex-restart': ({ config, storage }) => commandCortexLifecycle(config, storage, 'restart'),
    'cortex-status': ({ config, storage }) => commandCortexLifecycle(config, storage, 'status'),
    'cortex-ensure': ({ config, storage }) => commandCortexLifecycle(config, storage, 'ensure'),
    'cortex-route-plan': ({ config, storage, args }) => commandCortexRoutePlan(config, storage, args),
    'cortex-run-pass': ({ config, storage, args }) => commandCortexRunPass(config, storage, args),
    'test-s3': () => commandTestS3(),
    'sources-plan': ({ config, storage, args }) => commandSourcesPlan(config, storage, args),
    'sources-report': ({ config, storage, args }) => commandSourcesReport(config, storage, args),
    'rebuild-index': ({ config, storage, args }) => commandRebuildIndex(config, storage, args),
    benchmark: ({ config, storage, args }) => commandBenchmark(config, storage, args, 'benchmark'),
    'benchmark-golden': ({ config, storage, args }) =>
      commandBenchmark(config, storage, args, 'benchmark-golden'),
    'intel-graph-api': ({ config, storage, args }) => commandIntelGraphApi(config, storage, args),
    'product-reconcile': ({ config, storage, args }) => commandProductReconcile(config, storage, args),
    'seed-db': ({ config, storage, args }) => commandSeedDb(config, storage, args),
    'migrate-to-sqlite': ({ config, storage, args }) => commandMigrateToSqlite(config, storage, args)
  }
});

export async function executeCli(argv, { env = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  const restoreEnv = applyEnvOverrides(env);
  try {
    const [command, ...rest] = Array.isArray(argv) ? argv : [];
    if (!command) {
      stdout.write(`${usage()}\n`);
      return { exitCode: 1, output: undefined };
    }

    const args = parseArgs(rest);
    loadDotEnvFile(args.env || '.env', {
      overrideExistingKeys: CLI_DOTENV_OVERRIDE_KEYS
    });
    const config = buildConfig(args);
    const validation = validateConfig(config);
    for (const warning of validation.warnings) {
      stderr.write(`[config-warning] ${warning.code}: ${warning.message}\n`);
    }
    if (!validation.valid) {
      for (const error of validation.errors) {
        stderr.write(`[config-error] ${error.code}: ${error.message}\n`);
      }
      return { exitCode: 1, output: undefined };
    }
    const storage = createStorage(config);

    const output = await dispatchCliCommand({ command, config, storage, args });

    if (output && typeof output === 'object') {
      output.run_profile = 'standard';
    }

    return { exitCode: 0, output };
  } finally {
    restoreEnv();
    if (typeof process.disconnect === 'function' && process.connected) {
      try { process.disconnect(); } catch { /* best effort */ }
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const { exitCode, output } = await executeCli(argv);
  if (output !== undefined) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
  process.exitCode = exitCode;
}

function isDirectCliExecution() {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(pathNode.resolve(entryPath)).href;
  } catch {
    return false;
  }
}

if (isDirectCliExecution()) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}













