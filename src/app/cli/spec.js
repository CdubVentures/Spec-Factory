#!/usr/bin/env node
import { loadConfigWithUserSettings, loadDotEnvFile, validateConfig } from '../../config.js';
import { defaultIndexLabRoot } from '../../core/config/runtimeArtifactRoots.js';
import { createStorage, toPosixKey } from '../../core/storage/storage.js';
import { parseArgs, asBool } from './args.js';
import {
  parseJsonArg,
  openSpecDbForCategory,
  createWithSpecDb,
} from './cliHelpers.js';
import pathNode from 'node:path';
import { pathToFileURL } from 'node:url';

const withSpecDb = createWithSpecDb(openSpecDbForCategory);

function usage() {
  return [
    'Usage: node src/app/cli/spec.js <command> [options]',
    '',
    'Commands:',
    '  indexlab --category <category> --seed <product_id|s3key|url|title> [--product-id <id>] [--s3key <key>] [--brand <brand>] [--model <model>] [--variant <variant>] [--sku <sku>] [--fields <csv>] [--providers <csv>] [--out <dir>] [--run-id <run_id>] [--local]',
    '  compile-rules --category <category> [--field-studio-source <path>] [--map <path>] [--dry-run] [--watch] [--watch-seconds <n>] [--max-events <n>] [--local]',
    '  compile-rules --all [--dry-run] [--local]',
    '  validate-rules --category <category> [--local]',
    '  discover --category <category> [--brand <brand>] [--local]',
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
    '  export-overrides --category <category> [--local]',
    '  migrate-overrides --category <category> [--local]',
    '  migrate-to-sqlite --category <category> [--phase <1-9>] [--local]',
    '',
    'Global options:',
    '  --env <path>   Path to dotenv file (default: .env)'
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
  };
  if (args['search-engines']) overrides.searchEngines = args['search-engines'];
  if (args['search-provider']) overrides.searchEngines = args['search-provider'];
  // WHY: Env vars set via applyEnvOverrides must survive the user-settings merge.
  // buildRawConfig reads these, but applyRuntimeSettingsToConfig overwrites them.
  // Including them as explicit overrides ensures they are re-applied after merge.
  if (process.env.CATEGORY_AUTHORITY_ROOT) {
    overrides.categoryAuthorityRoot = process.env.CATEGORY_AUTHORITY_ROOT;
  }
  if (process.env.SPEC_DB_DIR) {
    overrides.specDbDir = process.env.SPEC_DB_DIR;
  }
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

const loadPipelineCommands = createLazyLoader(async () => {
  const [
    { createPipelineCommands },
    { runProduct },
    { IndexLabRuntimeBridge },
  ] = await Promise.all([
    import('./commands/pipelineCommands.js'),
    import('../../pipeline/runProduct.js'),
    import('../../indexlab/runtimeBridge.js'),
  ]);
  return createPipelineCommands({
    asBool,
    toPosixKey,
    runProduct,
    IndexLabRuntimeBridge,
    defaultIndexLabRoot,
    openSpecDbForCategory,
    withSpecDb,
  });
});

const loadFieldRulesCommands = createLazyLoader(async () => {
  const [
    { createFieldRulesCommands },
    compiler,
  ] = await Promise.all([
    import('./commands/fieldRulesCommands.js'),
    import('../../field-rules/compiler.js'),
  ]);
  return createFieldRulesCommands({
    asBool,
    compileRules: compiler.compileRules,
    compileRulesAll: compiler.compileRulesAll,
    watchCompileRules: compiler.watchCompileRules,
    validateRules: compiler.validateRules,
  });
});

const loadReviewCommandHandler = createLazyLoader(async () => {
  const [{ createReviewCommand }, reviewDomain] = await Promise.all([
    import('./commands/reviewCommand.js'),
    import('../../features/review/domain/index.js'),
  ]);
  return createReviewCommand({
    asBool,
    parseJsonArg,
    withSpecDb,
    buildReviewLayout: reviewDomain.buildReviewLayout,
    buildProductReviewPayload: reviewDomain.buildProductReviewPayload,
    writeProductReviewArtifacts: reviewDomain.writeProductReviewArtifacts,
    setOverrideFromCandidate: reviewDomain.setOverrideFromCandidate,
    approveGreenOverrides: reviewDomain.approveGreenOverrides,
    setManualOverride: reviewDomain.setManualOverride,
    finalizeOverrides: reviewDomain.finalizeOverrides,
    buildReviewMetrics: reviewDomain.buildReviewMetrics,
  });
});

const loadExportOverridesCommandHandler = createLazyLoader(async () => {
  const { createExportOverridesCommand } = await import('./commands/exportOverridesCommand.js');
  return createExportOverridesCommand({ withSpecDb });
});

const loadMigrateOverridesCommandHandler = createLazyLoader(async () => {
  const { createMigrateOverridesCommand } = await import('./commands/exportOverridesCommand.js');
  return createMigrateOverridesCommand({ withSpecDb });
});

const loadDiscoverCommandHandler = createLazyLoader(async () => {
  const [
    { createDiscoverCommand },
    { loadCategoryConfig },
    { runDiscoverySeedPlan },
    { EventLogger },
    { buildRunId },
  ] = await Promise.all([
    import('./commands/discoverCommand.js'),
    import('../../categories/loader.js'),
    import('../../features/indexing/pipeline/orchestration/index.js'),
    import('../../logger.js'),
    import('../../shared/primitives.js'),
  ]);
  return createDiscoverCommand({
    loadCategoryConfig,
    runDiscoverySeedPlan,
    EventLogger,
    buildRunId,
    withSpecDb,
  });
});

const loadBillingReportCommandHandler = createLazyLoader(async () => {
  const [{ createBillingReportCommand }, { buildBillingReport }] = await Promise.all([
    import('./commands/billingReportCommand.js'),
    import('../../billing/costLedger.js'),
  ]);
  return createBillingReportCommand({
    buildBillingReport,
  });
});

const loadMigrateToSqliteCommandHandler = createLazyLoader(async () => {
  const { createMigrateToSqliteCommand } = await import('./commands/migrateToSqliteCommand.js');
  return createMigrateToSqliteCommand({
    withSpecDb,
    toPosixKey,
  });
});

async function executeCommand({ command, config, storage, args }) {
  switch (command) {
    case 'indexlab':
      return (await loadPipelineCommands()).commandIndexLab(config, storage, args);
    case 'compile-rules':
      return (await loadFieldRulesCommands()).commandCompileRules(config, storage, args);
    case 'validate-rules':
      return (await loadFieldRulesCommands()).commandValidateRules(config, storage, args);
    case 'discover':
      return (await loadDiscoverCommandHandler())(config, storage, args);
    case 'review':
      return (await loadReviewCommandHandler())(config, storage, args);
    case 'export-overrides':
      return (await loadExportOverridesCommandHandler())(config, storage, args);
    case 'migrate-overrides':
      return (await loadMigrateOverridesCommandHandler())(config, storage, args);
    case 'billing-report':
      return (await loadBillingReportCommandHandler())(config, storage, args);
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

    const output = await executeCommand({ command, config, storage, args });

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
