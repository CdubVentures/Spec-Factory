#!/usr/bin/env node
import { loadConfigWithUserSettings, loadDotEnvFile, validateConfig } from '../config.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { createStorage, toPosixKey } from '../s3/storage.js';
import { parseArgs, asBool } from './args.js';
import {
  slug,
  parseCsvList,
  parseJsonArg,
  parseQueuePriority,
  openSpecDbForCategory
} from '../app/cli/cliHelpers.js';
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
    '  seed-checkpoint --category <category> [--out <path>] [--local]',
    '  migrate-product-ids --category <category> [--dry-run] [--local]',
    '  backfill-brand-identifiers --category <category> [--dry-run] [--local]',
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
  'SERP_SELECTOR_MIN_SCORE',
  'LLM_FORCE_ROLE_MODEL_PROVIDER',
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
    localInputRoot: args['local-input-root'] || undefined,
    localOutputRoot: args['local-output-root'] || undefined,
    outputMode: args['output-mode'] || undefined
  };
  if (args['search-engines']) overrides.searchEngines = args['search-engines'];
  if (args['search-provider']) overrides.searchEngines = args['search-provider'];
  return loadConfigWithUserSettings(overrides);
}

function createLazyLoader(factory) {
  let cachedPromise = null;
  return async () => {
    if (!cachedPromise) {
      cachedPromise = factory();
    }
    return cachedPromise;
  };
}

const loadQueueCommandHandler = createLazyLoader(async () => {
  const [{ createQueueCommand }, { ingestCsvFile }, queueState] = await Promise.all([
    import('../app/cli/commands/queueCommand.js'),
    import('../ingest/csvIngestor.js'),
    import('../queue/queueState.js'),
  ]);
  return createQueueCommand({
    toPosixKey,
    parseCsvList,
    parseJsonArg,
    parseQueuePriority,
    asBool,
    ingestCsvFile,
    upsertQueueProduct: queueState.upsertQueueProduct,
    syncQueueFromInputs: queueState.syncQueueFromInputs,
    listQueueProducts: queueState.listQueueProducts,
    loadQueueState: queueState.loadQueueState,
    clearQueueByStatus: queueState.clearQueueByStatus,
  });
});

const loadReviewCommandHandler = createLazyLoader(async () => {
  const [{ createReviewCommand }, reviewDomain] = await Promise.all([
    import('../app/cli/commands/reviewCommand.js'),
    import('../features/review/domain/index.js'),
  ]);
  return createReviewCommand({
    asBool,
    parseJsonArg,
    openSpecDbForCategory,
    buildReviewLayout: reviewDomain.buildReviewLayout,
    buildReviewQueue: reviewDomain.buildReviewQueue,
    buildProductReviewPayload: reviewDomain.buildProductReviewPayload,
    writeProductReviewArtifacts: reviewDomain.writeProductReviewArtifacts,
    writeCategoryReviewArtifacts: reviewDomain.writeCategoryReviewArtifacts,
    startReviewQueueWebSocket: reviewDomain.startReviewQueueWebSocket,
    setOverrideFromCandidate: reviewDomain.setOverrideFromCandidate,
    approveGreenOverrides: reviewDomain.approveGreenOverrides,
    setManualOverride: reviewDomain.setManualOverride,
    finalizeOverrides: reviewDomain.finalizeOverrides,
    buildReviewMetrics: reviewDomain.buildReviewMetrics,
    appendReviewSuggestion: reviewDomain.appendReviewSuggestion,
  });
});

const loadExportOverridesCommandHandler = createLazyLoader(async () => {
  const { createExportOverridesCommand } = await import('../app/cli/commands/exportOverridesCommand.js');
  return createExportOverridesCommand({ openSpecDbForCategory });
});

const loadDiscoverCommandHandler = createLazyLoader(async () => {
  const [
    { createDiscoverCommand },
    { loadCategoryConfig },
    { runDiscoverySeedPlan },
    { EventLogger },
    { buildRunId },
  ] = await Promise.all([
    import('../app/cli/commands/discoverCommand.js'),
    import('../categories/loader.js'),
    import('../features/indexing/pipeline/orchestration/index.js'),
    import('../logger.js'),
    import('../shared/primitives.js'),
  ]);
  return createDiscoverCommand({
    loadCategoryConfig,
    runDiscoverySeedPlan,
    EventLogger,
    buildRunId,
  });
});

const loadSourcesReportCommandHandler = createLazyLoader(async () => {
  const [{ createSourcesReportCommand }, intel] = await Promise.all([
    import('../app/cli/commands/sourcesReportCommand.js'),
    import('../intel/sourceIntel.js'),
  ]);
  return createSourcesReportCommand({
    loadSourceIntel: intel.loadSourceIntel,
    promotionSuggestionsKey: intel.promotionSuggestionsKey,
  });
});

const loadSourcesPlanCommandHandler = createLazyLoader(async () => {
  const [
    { createSourcesPlanCommand },
    { loadCategoryConfig },
    { generateSourceExpansionPlans },
  ] = await Promise.all([
    import('../app/cli/commands/sourcesPlanCommand.js'),
    import('../categories/loader.js'),
    import('../intel/sourceIntel.js'),
  ]);
  return createSourcesPlanCommand({
    loadCategoryConfig,
    generateSourceExpansionPlans,
  });
});

const loadRebuildIndexCommandHandler = createLazyLoader(async () => {
  const [{ createRebuildIndexCommand }, { rebuildCategoryIndex }] = await Promise.all([
    import('../app/cli/commands/rebuildIndexCommand.js'),
    import('../indexer/rebuildIndex.js'),
  ]);
  return createRebuildIndexCommand({
    rebuildCategoryIndex,
    openSpecDbForCategory,
  });
});

const loadBenchmarkCommandHandler = createLazyLoader(async () => {
  const [{ createBenchmarkCommand }, { runGoldenBenchmark }] = await Promise.all([
    import('../app/cli/commands/benchmarkCommand.js'),
    import('../benchmark/goldenBenchmark.js'),
  ]);
  return createBenchmarkCommand({
    runGoldenBenchmark,
    openSpecDbForCategory,
  });
});

const loadIntelGraphApiCommandHandler = createLazyLoader(async () => {
  const [{ createIntelGraphApiCommand }, { startIntelGraphApi }] = await Promise.all([
    import('../app/cli/commands/intelGraphApiCommand.js'),
    import('../api/intelGraphApi.js'),
  ]);
  return createIntelGraphApiCommand({
    startIntelGraphApi,
  });
});

const loadBillingReportCommandHandler = createLazyLoader(async () => {
  const [{ createBillingReportCommand }, { buildBillingReport }] = await Promise.all([
    import('../app/cli/commands/billingReportCommand.js'),
    import('../billing/costLedger.js'),
  ]);
  return createBillingReportCommand({
    buildBillingReport,
  });
});

const loadLearningReportCommandHandler = createLazyLoader(async () => {
  const [{ createLearningReportCommand }, { buildLearningReport }] = await Promise.all([
    import('../app/cli/commands/learningReportCommand.js'),
    import('../features/indexing/learning/index.js'),
  ]);
  return createLearningReportCommand({
    buildLearningReport,
  });
});

const loadExplainUnkCommandHandler = createLazyLoader(async () => {
  const { createExplainUnkCommand } = await import('../app/cli/commands/explainUnkCommand.js');
  return createExplainUnkCommand({ openSpecDbForCategory });
});

const loadLlmHealthCommandHandler = createLazyLoader(async () => {
  const [{ createLlmHealthCommand }, { runLlmHealthCheck }] = await Promise.all([
    import('../app/cli/commands/llmHealthCommand.js'),
    import('../core/llm/client/healthCheck.js'),
  ]);
  return createLlmHealthCommand({
    runLlmHealthCheck,
  });
});

const loadMigrateToSqliteCommandHandler = createLazyLoader(async () => {
  const { createMigrateToSqliteCommand } = await import('../app/cli/commands/migrateToSqliteCommand.js');
  return createMigrateToSqliteCommand({
    openSpecDbForCategory,
    toPosixKey,
    fsNode,
    pathNode,
    now: () => Date.now(),
  });
});

const loadFieldRulesCommands = createLazyLoader(async () => {
  const [
    { createFieldRulesCommands },
    { compileCategoryFieldStudio },
    compiler,
    { verifyGeneratedFieldRules },
  ] = await Promise.all([
    import('../app/cli/commands/fieldRulesCommands.js'),
    import('../ingest/categoryCompile.js'),
    import('../field-rules/compiler.js'),
    import('../ingest/fieldRulesVerify.js'),
  ]);
  return createFieldRulesCommands({
    asBool,
    compileCategoryFieldStudio,
    compileRules: compiler.compileRules,
    compileRulesAll: compiler.compileRulesAll,
    readCompileReport: compiler.readCompileReport,
    rulesDiff: compiler.rulesDiff,
    watchCompileRules: compiler.watchCompileRules,
    validateRules: compiler.validateRules,
    initCategory: compiler.initCategory,
    listFields: compiler.listFields,
    fieldReport: compiler.fieldReport,
    verifyGeneratedFieldRules,
  });
});

const loadTestingQualityCommands = createLazyLoader(async () => {
  const [
    { createTestingQualityCommands },
    goldenFiles,
    reviewDomain,
    { computeCalibrationReport },
  ] = await Promise.all([
    import('../app/cli/commands/testingQualityCommands.js'),
    import('../testing/goldenFiles.js'),
    import('../features/review/domain/index.js'),
    import('../calibration/confidenceCalibrator.js'),
  ]);
  return createTestingQualityCommands({
    asBool,
    createGoldenFixture: goldenFiles.createGoldenFixture,
    createGoldenFromCatalog: goldenFiles.createGoldenFromCatalog,
    validateGoldenFixtures: goldenFiles.validateGoldenFixtures,
    runQaJudge: reviewDomain.runQaJudge,
    computeCalibrationReport,
    buildAccuracyReport: goldenFiles.buildAccuracyReport,
    renderAccuracyReportMarkdown: goldenFiles.renderAccuracyReportMarkdown,
    runAccuracyBenchmarkReport: goldenFiles.runAccuracyBenchmarkReport,
    buildAccuracyTrend: goldenFiles.buildAccuracyTrend,
    openSpecDbForCategory,
  });
});

const loadPublishingCommands = createLazyLoader(async () => {
  const [
    { createPublishingCommands },
    publishingPipeline,
    expansionHardening,
    driftScheduler,
    { reconcileOrphans },
  ] = await Promise.all([
    import('../app/cli/commands/publishingCommands.js'),
    import('../publish/publishingPipeline.js'),
    import('../features/expansion-hardening/index.js'),
    import('../publish/driftScheduler.js'),
    import('../features/catalog/products/reconciler.js'),
  ]);
  return createPublishingCommands({
    asBool,
    publishProducts: publishingPipeline.publishProducts,
    readPublishedProvenance: publishingPipeline.readPublishedProvenance,
    readPublishedChangelog: publishingPipeline.readPublishedChangelog,
    buildSourceHealth: publishingPipeline.buildSourceHealth,
    buildLlmMetrics: publishingPipeline.buildLlmMetrics,
    parseExpansionCategories: expansionHardening.parseExpansionCategories,
    bootstrapExpansionCategories: expansionHardening.bootstrapExpansionCategories,
    runQueueLoadHarness: expansionHardening.runQueueLoadHarness,
    runFailureInjectionHarness: expansionHardening.runFailureInjectionHarness,
    runFuzzSourceHealthHarness: expansionHardening.runFuzzSourceHealthHarness,
    runProductionHardeningReport: expansionHardening.runProductionHardeningReport,
    scanAndEnqueueDriftedProducts: driftScheduler.scanAndEnqueueDriftedProducts,
    reconcileDriftedProduct: driftScheduler.reconcileDriftedProduct,
    reconcileOrphans,
  });
});

const loadDataUtilityCommands = createLazyLoader(async () => {
  const [
    { createDataUtilityCommands },
    { ingestCsvFile },
    { EventLogger },
    { runS3Integration },
    { generateTypesForCategory },
  ] = await Promise.all([
    import('../app/cli/commands/dataUtilityCommands.js'),
    import('../ingest/csvIngestor.js'),
    import('../logger.js'),
    import('./s3Integration.js'),
    import('../build/generate-types.js'),
  ]);
  return createDataUtilityCommands({
    asBool,
    ingestCsvFile,
    EventLogger,
    runS3Integration,
    generateTypesForCategory,
  });
});

const loadBatchCommandGroup = createLazyLoader(async () => {
  const [
    { createBatchCommand },
    { loadCategoryConfig },
    { loadSourceIntel },
    { rankBatchWithBandit },
    { runProduct },
  ] = await Promise.all([
    import('../app/cli/commands/batchCommand.js'),
    import('../categories/loader.js'),
    import('../intel/sourceIntel.js'),
    import('../features/indexing/learning/index.js'),
    import('../pipeline/runProduct.js'),
  ]);
  return createBatchCommand({
    loadCategoryConfig,
    loadSourceIntel,
    rankBatchWithBandit,
    runProduct,
    openSpecDbForCategory,
  });
});

const loadPipelineCommands = createLazyLoader(async () => {
  const [
    { createPipelineCommands },
    { runProduct },
    { runUntilComplete },
    { IndexLabRuntimeBridge },
  ] = await Promise.all([
    import('../app/cli/commands/pipelineCommands.js'),
    import('../pipeline/runProduct.js'),
    import('../runner/runUntilComplete.js'),
    import('../indexlab/runtimeBridge.js'),
  ]);
  return createPipelineCommands({
    asBool,
    toPosixKey,
    runProduct,
    runUntilComplete,
    IndexLabRuntimeBridge,
    defaultIndexLabRoot,
  });
});

async function executeCommand({ command, config, storage, args }) {
  switch (command) {
    case 'run-one':
      return (await loadPipelineCommands()).commandRunOne(config, storage, args);
    case 'indexlab':
      return (await loadPipelineCommands()).commandIndexLab(config, storage, args);
    case 'run-ad-hoc':
      return (await loadPipelineCommands()).commandRunAdHoc(config, storage, args);
    case 'run-until-complete':
      return (await loadPipelineCommands()).commandRunUntilComplete(config, storage, args);
    case 'category-compile':
      return (await loadFieldRulesCommands()).commandCategoryCompile(config, storage, args);
    case 'compile-rules':
      return (await loadFieldRulesCommands()).commandCompileRules(config, storage, args);
    case 'compile-report':
      return (await loadFieldRulesCommands()).commandCompileReport(config, storage, args);
    case 'rules-diff':
      return (await loadFieldRulesCommands()).commandRulesDiff(config, storage, args);
    case 'validate-rules':
      return (await loadFieldRulesCommands()).commandValidateRules(config, storage, args);
    case 'init-category':
      return (await loadFieldRulesCommands()).commandInitCategory(config, storage, args);
    case 'list-fields':
      return (await loadFieldRulesCommands()).commandListFields(config, storage, args);
    case 'field-report':
      return (await loadFieldRulesCommands()).commandFieldReport(config, storage, args);
    case 'field-rules-verify':
      return (await loadFieldRulesCommands()).commandFieldRulesVerify(config, storage, args);
    case 'create-golden':
      return (await loadTestingQualityCommands()).commandCreateGolden(config, storage, args);
    case 'test-golden':
      return (await loadTestingQualityCommands()).commandTestGolden(config, storage, args);
    case 'qa-judge':
      return (await loadTestingQualityCommands()).commandQaJudge(config, storage, args);
    case 'calibrate-confidence':
      return (await loadTestingQualityCommands()).commandCalibrateConfidence(config, storage, args);
    case 'accuracy-report':
      return (await loadTestingQualityCommands()).commandAccuracyReport(config, storage, args);
    case 'accuracy-benchmark':
      return (await loadTestingQualityCommands()).commandAccuracyBenchmark(config, storage, args);
    case 'accuracy-trend':
      return (await loadTestingQualityCommands()).commandAccuracyTrend(config, storage, args);
    case 'generate-types':
      return (await loadDataUtilityCommands()).commandGenerateTypes(config, storage, args);
    case 'publish':
      return (await loadPublishingCommands()).commandPublish(config, storage, args);
    case 'provenance':
      return (await loadPublishingCommands()).commandProvenance(config, storage, args);
    case 'changelog':
      return (await loadPublishingCommands()).commandChangelog(config, storage, args);
    case 'source-health':
      return (await loadPublishingCommands()).commandSourceHealth(config, storage, args);
    case 'llm-metrics':
      return (await loadPublishingCommands()).commandLlmMetrics(config, storage, args);
    case 'expansion-bootstrap':
      return (await loadPublishingCommands()).commandExpansionBootstrap(config, storage, args, 'expansion-bootstrap');
    case 'hardening-harness':
      return (await loadPublishingCommands()).commandHardeningHarness(config, storage, args);
    case 'hardening-report':
      return (await loadPublishingCommands()).commandHardeningReport(config, storage, args);
    case 'drift-scan':
      return (await loadPublishingCommands()).commandDriftScan(config, storage, args);
    case 'drift-reconcile':
      return (await loadPublishingCommands()).commandDriftReconcile(config, storage, args);
    case 'run-batch':
      return (await loadBatchCommandGroup()).commandRunBatch(config, storage, args);
    case 'discover':
      return (await loadDiscoverCommandHandler())(config, storage, args);
    case 'ingest-csv':
      return (await loadDataUtilityCommands()).commandIngestCsv(config, storage, args);
    case 'queue':
      return (await loadQueueCommandHandler())(config, storage, args);
    case 'review':
      return (await loadReviewCommandHandler())(config, storage, args);
    case 'export-overrides':
      return (await loadExportOverridesCommandHandler())(config, storage, args);
    case 'billing-report':
      return (await loadBillingReportCommandHandler())(config, storage, args);
    case 'learning-report':
      return (await loadLearningReportCommandHandler())(config, storage, args);
    case 'explain-unk':
      return (await loadExplainUnkCommandHandler())(config, storage, args);
    case 'llm-health':
      return (await loadLlmHealthCommandHandler())(config, storage, args);
    case 'test-s3':
      return (await loadDataUtilityCommands()).commandTestS3();
    case 'sources-plan':
      return (await loadSourcesPlanCommandHandler())(config, storage, args);
    case 'sources-report':
      return (await loadSourcesReportCommandHandler())(config, storage, args);
    case 'rebuild-index':
      return (await loadRebuildIndexCommandHandler())(config, storage, args);
    case 'benchmark':
      return (await loadBenchmarkCommandHandler())(config, storage, args, 'benchmark');
    case 'benchmark-golden':
      return (await loadBenchmarkCommandHandler())(config, storage, args, 'benchmark-golden');
    case 'intel-graph-api':
      return (await loadIntelGraphApiCommandHandler())(config, storage, args);
    case 'product-reconcile':
      return (await loadPublishingCommands()).commandProductReconcile(config, storage, args);
    case 'seed-db':
      return (await loadDataUtilityCommands()).commandSeedDb(config, storage, args);
    case 'seed-checkpoint':
      return (await loadDataUtilityCommands()).commandSeedCheckpoint(config, storage, args);
    case 'migrate-product-ids':
      return (await loadDataUtilityCommands()).commandMigrateProductIds(config, storage, args);
    case 'backfill-brand-identifiers':
      return (await loadDataUtilityCommands()).commandBackfillBrandIdentifiers(config, storage, args);
    case 'migrate-to-sqlite':
      return (await loadMigrateToSqliteCommandHandler())(config, storage, args);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

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

    // BUG: the lazy-loader refactor briefly left executeCli() calling the
    // removed dispatchCliCommand() symbol, breaking every top-level CLI command.
    const output = await executeCommand({ command, config, storage, args });

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
  // WHY: Force exit after all critical work is done. Without this, Node waits
  // for dangling handles (Playwright browser processes on Windows, keep-alive
  // sockets) which can delay exit by 30-60+ seconds after the run is complete.
  // All DB writes, checkpoint saves, and bridge finalize are done by this point.
  process.exit(exitCode);
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
