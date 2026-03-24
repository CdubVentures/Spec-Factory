#!/usr/bin/env node
import { loadConfigWithUserSettings, loadDotEnvFile, validateConfig } from '../config.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { createStorage, toPosixKey } from '../s3/storage.js';
import { parseArgs, asBool } from './args.js';
import { createCliCommandDispatcher } from '../app/cli/commandDispatch.js';
import {
  slug,
  parseCsvList,
  parseJsonArg,
  parseQueuePriority,
  openSpecDbForCategory
} from '../app/cli/cliHelpers.js';
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
import { createFieldRulesCommands } from '../app/cli/commands/fieldRulesCommands.js';
import { createTestingQualityCommands } from '../app/cli/commands/testingQualityCommands.js';
import { createPublishingCommands } from '../app/cli/commands/publishingCommands.js';
import { createDataUtilityCommands } from '../app/cli/commands/dataUtilityCommands.js';
import { createBatchCommand } from '../app/cli/commands/batchCommand.js';
import { createPipelineCommands } from '../app/cli/commands/pipelineCommands.js';
import { runProduct } from '../pipeline/runProduct.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { discoverCandidateSources } from '../features/indexing/discovery/searchDiscovery.js';
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
} from '../review/index.js';
import {
  approveGreenOverrides,
  buildReviewMetrics,
  finalizeOverrides,
  setManualOverride,
  setOverrideFromCandidate
} from '../review/index.js';
import { appendReviewSuggestion } from '../review/index.js';
import { buildBillingReport } from '../billing/costLedger.js';
import { buildLearningReport } from '../features/indexing/learning/index.js';
import { runLlmHealthCheck } from '../core/llm/client/healthCheck.js';
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
import { startReviewQueueWebSocket } from '../review/index.js';
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
import { runQaJudge } from '../review/index.js';
import { computeCalibrationReport } from '../calibration/confidenceCalibrator.js';
import { reconcileOrphans } from '../features/catalog/products/reconciler.js';
import { IndexLabRuntimeBridge } from '../indexlab/runtimeBridge.js';
import fsNode from 'node:fs/promises';
import pathNode from 'node:path';
import { pathToFileURL } from 'node:url';

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
  'LLM_FORCE_ROLE_MODEL_PROVIDER',
  'LLM_MAX_CALLS_PER_PRODUCT_TOTAL',
  'LLM_MAX_CALLS_PER_ROUND'
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
    outputMode: args['output-mode'] || undefined
  };
  if (args.local !== undefined) overrides.localMode = asBool(args.local);
  if (args['dry-run'] !== undefined) overrides.dryRun = asBool(args['dry-run']);
  if (args['discovery-enabled'] !== undefined) overrides.discoveryEnabled = asBool(args['discovery-enabled']);
  if (args['search-engines']) overrides.searchEngines = args['search-engines'];
  if (args['search-provider']) overrides.searchEngines = args['search-provider'];
  return loadConfigWithUserSettings(overrides);
}

// --- Factory instantiations: existing commands ---

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

const commandMigrateToSqlite = createMigrateToSqliteCommand({
  openSpecDbForCategory,
  toPosixKey,
  fsNode,
  pathNode,
  now: () => Date.now(),
});

// --- Factory instantiations: new command groups ---

const fieldRules = createFieldRulesCommands({
  asBool,
  compileCategoryFieldStudio,
  compileRules,
  compileRulesAll,
  readCompileReport,
  rulesDiff,
  watchCompileRules,
  validateRules,
  initCategory,
  listFields,
  fieldReport,
  verifyGeneratedFieldRules,
});

const testingQuality = createTestingQualityCommands({
  asBool,
  createGoldenFixture,
  createGoldenFromCatalog,
  validateGoldenFixtures,
  runQaJudge,
  computeCalibrationReport,
  buildAccuracyReport,
  renderAccuracyReportMarkdown,
  runAccuracyBenchmarkReport,
  buildAccuracyTrend,
});

const publishing = createPublishingCommands({
  asBool,
  publishProducts,
  readPublishedProvenance,
  readPublishedChangelog,
  buildSourceHealth,
  buildLlmMetrics,
  parseExpansionCategories,
  bootstrapExpansionCategories,
  runQueueLoadHarness,
  runFailureInjectionHarness,
  runFuzzSourceHealthHarness,
  runProductionHardeningReport,
  scanAndEnqueueDriftedProducts,
  reconcileDriftedProduct,
  reconcileOrphans,
});

const dataUtility = createDataUtilityCommands({
  asBool,
  ingestCsvFile,
  EventLogger,
  runS3Integration,
  generateTypesForCategory,
});

const batch = createBatchCommand({
  loadCategoryConfig,
  loadSourceIntel,
  rankBatchWithBandit,
  runProduct,
});

const pipeline = createPipelineCommands({
  asBool,
  toPosixKey,
  runProduct,
  runUntilComplete,
  IndexLabRuntimeBridge,
  defaultIndexLabRoot,
});

// --- Handler registration ---

const dispatchCliCommand = createCliCommandDispatcher({
  handlers: {
    'run-one': ({ config, storage, args }) => pipeline.commandRunOne(config, storage, args),
    indexlab: ({ config, storage, args }) => pipeline.commandIndexLab(config, storage, args),
    'run-ad-hoc': ({ config, storage, args }) => pipeline.commandRunAdHoc(config, storage, args),
    'run-until-complete': ({ config, storage, args }) => pipeline.commandRunUntilComplete(config, storage, args),
    'category-compile': ({ config, storage, args }) => fieldRules.commandCategoryCompile(config, storage, args),
    'compile-rules': ({ config, storage, args }) => fieldRules.commandCompileRules(config, storage, args),
    'compile-report': ({ config, storage, args }) => fieldRules.commandCompileReport(config, storage, args),
    'rules-diff': ({ config, storage, args }) => fieldRules.commandRulesDiff(config, storage, args),
    'validate-rules': ({ config, storage, args }) => fieldRules.commandValidateRules(config, storage, args),
    'init-category': ({ config, storage, args }) => fieldRules.commandInitCategory(config, storage, args),
    'list-fields': ({ config, storage, args }) => fieldRules.commandListFields(config, storage, args),
    'field-report': ({ config, storage, args }) => fieldRules.commandFieldReport(config, storage, args),
    'field-rules-verify': ({ config, storage, args }) => fieldRules.commandFieldRulesVerify(config, storage, args),
    'create-golden': ({ config, storage, args }) => testingQuality.commandCreateGolden(config, storage, args),
    'test-golden': ({ config, storage, args }) => testingQuality.commandTestGolden(config, storage, args),
    'qa-judge': ({ config, storage, args }) => testingQuality.commandQaJudge(config, storage, args),
    'calibrate-confidence': ({ config, storage, args }) => testingQuality.commandCalibrateConfidence(config, storage, args),
    'accuracy-report': ({ config, storage, args }) => testingQuality.commandAccuracyReport(config, storage, args),
    'accuracy-benchmark': ({ config, storage, args }) => testingQuality.commandAccuracyBenchmark(config, storage, args),
    'accuracy-trend': ({ config, storage, args }) => testingQuality.commandAccuracyTrend(config, storage, args),
    'generate-types': ({ config, storage, args }) => dataUtility.commandGenerateTypes(config, storage, args),
    publish: ({ config, storage, args }) => publishing.commandPublish(config, storage, args),
    provenance: ({ config, storage, args }) => publishing.commandProvenance(config, storage, args),
    changelog: ({ config, storage, args }) => publishing.commandChangelog(config, storage, args),
    'source-health': ({ config, storage, args }) => publishing.commandSourceHealth(config, storage, args),
    'llm-metrics': ({ config, storage, args }) => publishing.commandLlmMetrics(config, storage, args),
    'expansion-bootstrap': ({ config, storage, args }) => (
      publishing.commandExpansionBootstrap(config, storage, args, 'expansion-bootstrap')
    ),
    'hardening-harness': ({ config, storage, args }) => publishing.commandHardeningHarness(config, storage, args),
    'hardening-report': ({ config, storage, args }) => publishing.commandHardeningReport(config, storage, args),
    'drift-scan': ({ config, storage, args }) => publishing.commandDriftScan(config, storage, args),
    'drift-reconcile': ({ config, storage, args }) => publishing.commandDriftReconcile(config, storage, args),
    'run-batch': ({ config, storage, args }) => batch.commandRunBatch(config, storage, args),
    discover: ({ config, storage, args }) => commandDiscover(config, storage, args),
    'ingest-csv': ({ config, storage, args }) => dataUtility.commandIngestCsv(config, storage, args),
    queue: ({ config, storage, args }) => commandQueue(config, storage, args),
    review: ({ config, storage, args }) => commandReview(config, storage, args),
    'billing-report': ({ config, storage, args }) => commandBillingReport(config, storage, args),
    'learning-report': ({ config, storage, args }) => commandLearningReport(config, storage, args),
    'explain-unk': ({ config, storage, args }) => commandExplainUnk(config, storage, args),
    'llm-health': ({ config, storage, args }) => commandLlmHealth(config, storage, args),
    'test-s3': () => dataUtility.commandTestS3(),
    'sources-plan': ({ config, storage, args }) => commandSourcesPlan(config, storage, args),
    'sources-report': ({ config, storage, args }) => commandSourcesReport(config, storage, args),
    'rebuild-index': ({ config, storage, args }) => commandRebuildIndex(config, storage, args),
    benchmark: ({ config, storage, args }) => commandBenchmark(config, storage, args, 'benchmark'),
    'benchmark-golden': ({ config, storage, args }) =>
      commandBenchmark(config, storage, args, 'benchmark-golden'),
    'intel-graph-api': ({ config, storage, args }) => commandIntelGraphApi(config, storage, args),
    'product-reconcile': ({ config, storage, args }) => publishing.commandProductReconcile(config, storage, args),
    'seed-db': ({ config, storage, args }) => dataUtility.commandSeedDb(config, storage, args),
    'migrate-to-sqlite': ({ config, storage, args }) => commandMigrateToSqlite(config, storage, args)
  }
});

// --- Entry point ---

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
