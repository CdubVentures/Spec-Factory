import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { spawn, exec as execCb } from 'node:child_process';
import { loadConfig, loadDotEnvFile } from '../config.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../core/config/manifest.js';
import { createStorage } from '../s3/storage.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { loadQueueState, saveQueueState, listQueueProducts, upsertQueueProduct, clearQueueByStatus } from '../queue/queueState.js';
import {
  buildReviewLayout,
  buildProductReviewPayload,
  buildReviewQueue,
  readLatestArtifacts,
  buildFieldLabelsMap,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  setOverrideFromCandidate,
  setManualOverride,
  buildReviewMetrics,
  applySharedLaneState,
  findProductsReferencingComponent,
  cascadeComponentChange,
  cascadeEnumChange,
} from '../features/review-curation/index.js';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
  resolveComponentMutationContext,
  resolveEnumMutationContext,
} from './reviewMutationResolvers.js';
import { handleReviewItemMutationRoute } from './reviewItemRoutes.js';
import { handleReviewComponentMutationRoute } from './reviewComponentMutationRoutes.js';
import { handleReviewEnumMutationRoute } from './reviewEnumMutationRoutes.js';
import { buildLlmMetrics } from '../publish/publishingPipeline.js';
import { buildSearchHints, buildAnchorsSuggestions, buildKnownValuesSuggestions } from '../learning/learningSuggestionEmitter.js';
import { SpecDb } from '../db/specDb.js';
import { componentReviewPath } from '../engine/curationSuggestions.js';
import { runComponentReviewBatch } from '../pipeline/componentReviewBatch.js';
import { invalidateFieldRulesCache } from '../field-rules/loader.js';
import { createSessionCache } from '../field-rules/sessionCache.js';
import {
  loadFieldStudioMap,
  saveFieldStudioMap,
  validateFieldStudioMap
} from '../ingest/categoryCompile.js';
import { llmRoutingSnapshot } from '../llm/routing.js';
import { buildTrafficLight } from '../validator/trafficLight.js';
import { buildRoundSummaryFromEvents } from './roundSummary.js';
import { buildEvidenceSearchPayload } from './evidenceSearch.js';
import { slugify as canonicalSlugify } from '../catalog/slugify.js';
import { cleanVariant as canonicalCleanVariant } from '../catalog/identityDedup.js';
import { buildComponentIdentifier } from '../utils/componentIdentifier.js';
import {
  buildComponentReviewSyntheticCandidateId
} from '../utils/candidateIdentifier.js';
import { generateTestSourceResults, buildDeterministicSourceResults, buildSeedComponentDB, TEST_CASES, analyzeContract, buildTestProducts, getScenarioDefs, buildValidationChecks, loadComponentIdentityPools } from '../testing/testDataProvider.js';
import { runTestProduct } from '../testing/testRunner.js';
import { registerInfraRoutes } from './routes/infraRoutes.js';
import { registerConfigRoutes } from './routes/configRoutes.js';
import { registerIndexlabRoutes } from './routes/indexlabRoutes.js';
import { registerCatalogRoutes } from './routes/catalogRoutes.js';
import { registerBrandRoutes } from './routes/brandRoutes.js';
import { registerStudioRoutes } from './routes/studioRoutes.js';
import { registerDataAuthorityRoutes } from './routes/dataAuthorityRoutes.js';
import { registerReviewRoutes } from './routes/reviewRoutes.js';
import { registerTestModeRoutes } from './routes/testModeRoutes.js';
import { registerQueueBillingLearningRoutes } from './routes/queueBillingLearningRoutes.js';
import { registerSourceStrategyRoutes } from './routes/sourceStrategyRoutes.js';
import { registerRuntimeOpsRoutes } from './routes/runtimeOpsRoutes.js';
import { syncSpecDbForCategory as syncSpecDbForCategoryService } from './services/specDbSyncService.js';
import { handleCompileProcessCompletion } from './services/compileProcessCompletion.js';
import { handleIndexLabProcessCompletion } from './services/indexLabProcessCompletion.js';
import { dataChangeMatchesCategory } from './events/dataChangeContract.js';
import { normalizeRunDataStorageSettings } from './services/runDataRelocationService.js';
import {
  applyConvergenceSettingsToConfig,
  applyRuntimeSettingsToConfig,
  loadUserSettingsSync,
} from '../features/settings-authority/index.js';
import {
  loadBrandRegistry,
  saveBrandRegistry,
  addBrand,
  addBrandsBulk,
  updateBrand,
  removeBrand,
  getBrandsForCategory,
  seedBrandsFromActiveFiltering,
  renameBrand,
  getBrandImpactAnalysis
} from '../catalog/brandRegistry.js';
import {
  listProducts,
  loadProductCatalog,
  addProduct as catalogAddProduct,
  addProductsBulk as catalogAddProductsBulk,
  updateProduct as catalogUpdateProduct,
  removeProduct as catalogRemoveProduct,
  seedFromCatalog as catalogSeedFromCatalog
} from '../catalog/productCatalog.js';
import { reconcileOrphans } from '../catalog/reconciler.js';
import {
  toInt, toFloat, toUnitRatio, hasKnownValue, normalizeModelToken, parseCsvTokens,
  normalizePathToken, normalizeJsonText, jsonRes, corsHeaders, readJsonBody,
  safeReadJson, safeStat, listDirs, listFiles, normalizeDomainToken, domainFromUrl,
  urlPathToken, parseTsMs, percentileFromSorted, clampScore, readJsonlEvents,
  readGzipJsonlEvents, parseNdjson, safeJoin, incrementMapCounter, countMapValuesAbove,
  UNKNOWN_VALUE_TOKENS, isKnownValue, addTokensFromText,
  SITE_KIND_RANK, REVIEW_DOMAIN_HINTS, RETAILER_DOMAIN_HINTS, AGGREGATOR_DOMAIN_HINTS,
  FETCH_OUTCOME_KEYS, inferSiteKindByDomain, classifySiteKind, isHelperPseudoDomain,
  createFetchOutcomeCounters, normalizeFetchOutcome, classifyFetchOutcomeFromEvent,
  createDomainBucket, createUrlStat, ensureUrlStat, bumpUrlStatEvent,
  choosePreferredSiteKind, cooldownSecondsRemaining, resolveHostBudget,
  resolveDomainChecklistStatus, llmProviderFromModel, classifyLlmTracePhase,
  resolveLlmRoleDefaults, resolveLlmKnobDefaults, resolvePricingForModel,
  resolveTokenProfileForModel, collectLlmModels, deriveTrafficLightCounts,
  markEnumSuggestionStatus,
} from './helpers/requestHelpers.js';
import {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
  resolveRunProductId,
  resolveIndexLabRunContext,
  readIndexLabRunNeedSet,
  readIndexLabRunSearchProfile,
  readIndexLabRunPhase07Retrieval,
  readIndexLabRunPhase08Extraction,
  readIndexLabRunDynamicFetchDashboard,
  readIndexLabRunSourceIndexingPackets,
  readIndexLabRunItemIndexingPacket,
  readIndexLabRunRunMetaPacket,
  readIndexLabRunSerpExplorer,
  readIndexLabRunLlmTraces,
  readIndexLabRunEvidenceIndex,
  clampAutomationPriority,
  automationPriorityForRequiredLevel,
  automationPriorityForJobType,
  toStringList,
  addUniqueStrings,
  buildAutomationJobId,
  normalizeAutomationStatus,
  normalizeAutomationQuery,
  buildSearchProfileQueryMaps,
  readIndexLabRunAutomationQueue,
  listIndexLabRuns,
  buildIndexingDomainChecklist,
} from './routes/indexlabDataBuilders.js';
import {
  createApiPathParser,
  createApiRouteDispatcher,
  createApiHttpRequestHandler,
} from '../app/api/requestDispatch.js';
import { createGuiApiRouteRegistry } from '../app/api/routeRegistry.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../app/api/catalogHelpers.js';
import { createCategoryAliasResolver } from '../app/api/categoryAlias.js';
import { createSpecDbRuntime } from '../app/api/specDbRuntime.js';
import { createProcessRuntime } from '../app/api/processRuntime.js';
import { createRealtimeBridge } from '../app/api/realtimeBridge.js';

const GUI_SERVER_FILE_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(GUI_SERVER_FILE_PATH), '..', '..');

function resolveProjectPath(value, fallback = '') {
  const raw = String(value ?? '').trim();
  const token = raw || String(fallback ?? '').trim();
  if (!token) return PROJECT_ROOT;
  return path.isAbsolute(token) ? path.resolve(token) : path.resolve(PROJECT_ROOT, token);
}

function parseBooleanToken(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  const token = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return fallback;
}

function assertNoShadowHelperRuntime({ helperRoot, launchCwd = process.cwd() } = {}) {
  const canonicalHelperRoot = path.resolve(String(helperRoot || 'helper_files'));
  const launchHelperRoot = path.resolve(String(launchCwd || process.cwd()), 'helper_files');
  if (canonicalHelperRoot === launchHelperRoot) return;
  const shadowRuntimeRoot = path.join(launchHelperRoot, '_runtime');
  if (!fsSync.existsSync(shadowRuntimeRoot)) return;
  throw new Error([
    'shadow_helper_runtime_detected',
    `launch_runtime=${shadowRuntimeRoot}`,
    `canonical_helper_root=${canonicalHelperRoot}`,
    'Remove the launch-cwd helper_files shadow path or set HELPER_FILES_ROOT to the canonical project location.',
  ].join(';'));
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// helpers: toInt, toFloat, toUnitRatio, hasKnownValue â†’ ./helpers/requestHelpers.js

// helper: deriveTrafficLightCounts â†’ ./helpers/requestHelpers.js

// helpers: normalizeModelToken..resolveLlmRoleDefaults â†’ ./helpers/requestHelpers.js

// helper: resolveLlmKnobDefaults â†’ ./helpers/requestHelpers.js

// helpers: resolvePricingForModel..collectLlmModels â†’ ./helpers/requestHelpers.js

// helpers: markEnumSuggestionStatus..safeJoin â†’ ./helpers/requestHelpers.js

// indexlab data builders: readIndexLabRunEvents..buildIndexingDomainChecklist â†’ ./routes/indexlabDataBuilders.js

function mimeType(ext) {
  const map = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  };
  return map[ext] || 'application/octet-stream';
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Catalog helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function cleanVariant(v) {
  return canonicalCleanVariant(v);
}

function normText(v) {
  return String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function catalogKey(brand, model, variant) {
  return `${normText(brand)}|${normText(model)}|${normText(cleanVariant(variant))}`;
}

function slugify(value) {
  return canonicalSlugify(value);
}

function buildProductIdFromParts(category, brand, model, variant) {
  return [slugify(category), slugify(brand), slugify(model), slugify(cleanVariant(variant))]
    .filter(Boolean)
    .join('-');
}


// Ã¢â€â‚¬Ã¢â€â‚¬ Args Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}
const PORT = toInt(
  argVal('port', process.env.PORT || CONFIG_MANIFEST_DEFAULTS.PORT || '8788'),
  Number.parseInt(String(CONFIG_MANIFEST_DEFAULTS.PORT || '8788'), 10) || 8788
);
const isLocal = args.includes('--local');

// Ã¢â€â‚¬Ã¢â€â‚¬ Config + Storage Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
if (!loadDotEnvFile()) {
  loadDotEnvFile(path.join(PROJECT_ROOT, '.env'));
}
const config = loadConfig({
  ...(isLocal ? { localMode: true } : {}),
  ...(argVal('local-input-root', '') ? { localInputRoot: argVal('local-input-root', '') } : {}),
  ...(argVal('local-output-root', '') ? { localOutputRoot: argVal('local-output-root', '') } : {}),
  ...(argVal('output-mode', '') ? { outputMode: argVal('output-mode', '') } : {}),
});
config.helperFilesRoot = resolveProjectPath(config.helperFilesRoot, 'helper_files');
config.localOutputRoot = resolveProjectPath(config.localOutputRoot, 'out');
config.localInputRoot = resolveProjectPath(config.localInputRoot, 'fixtures/s3');
const OUTPUT_ROOT = resolveProjectPath(config.localOutputRoot, 'out');
const HELPER_ROOT = resolveProjectPath(config.helperFilesRoot, 'helper_files');
const INDEXLAB_ROOT = resolveProjectPath(argVal('indexlab-root', ''), 'artifacts/indexlab');
const LAUNCH_CWD = path.resolve(process.cwd());
assertNoShadowHelperRuntime({ helperRoot: HELPER_ROOT, launchCwd: LAUNCH_CWD });
const userSettings = loadUserSettingsSync({ helperFilesRoot: HELPER_ROOT });
applyRuntimeSettingsToConfig(config, userSettings.runtime);
applyConvergenceSettingsToConfig(config, userSettings.convergence);

function envToken(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function envBool(name, fallback = false) {
  return parseBooleanToken(process.env[name], fallback);
}

config.settingsCanonicalOnlyWrites = envBool('SETTINGS_CANONICAL_ONLY_WRITES', false);
const storage = createStorage(config);

function resolveRunDataDestinationType() {
  const explicit = envToken('RUN_DATA_STORAGE_DESTINATION_TYPE', '').toLowerCase();
  if (explicit === 's3' || explicit === 'local') return explicit;
  return envToken('S3_BUCKET', '') ? 's3' : 'local';
}

const runDataStorageState = normalizeRunDataStorageSettings({
  enabled: envBool('RUN_DATA_STORAGE_ENABLED', envToken('S3_BUCKET', '') !== ''),
  destinationType: resolveRunDataDestinationType(),
  localDirectory: envToken('RUN_DATA_STORAGE_LOCAL_DIRECTORY', ''),
  s3Region: envToken('RUN_DATA_STORAGE_S3_REGION', config.awsRegion || 'us-east-2'),
  s3Bucket: envToken('RUN_DATA_STORAGE_S3_BUCKET', config.s3Bucket || ''),
  s3Prefix: envToken('RUN_DATA_STORAGE_S3_PREFIX', 'spec-factory-runs'),
  s3AccessKeyId: envToken('RUN_DATA_STORAGE_S3_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID || ''),
  s3SecretAccessKey: envToken('RUN_DATA_STORAGE_S3_SECRET_ACCESS_KEY', process.env.AWS_SECRET_ACCESS_KEY || ''),
  s3SessionToken: envToken('RUN_DATA_STORAGE_S3_SESSION_TOKEN', process.env.AWS_SESSION_TOKEN || ''),
  updatedAt: null,
  ...userSettings.storage,
});

const markEnumSuggestionStatusBound = (category, field, value, status = 'accepted') =>
  markEnumSuggestionStatus(category, field, value, status, HELPER_ROOT);

const sessionCache = createSessionCache({
  loadCategoryConfig: (category) => loadCategoryConfig(category, { storage, config }),
  readJsonIfExists: safeReadJson,
  writeFile: (filePath, data) => fs.writeFile(filePath, data),
  mkdir: (dirPath, opts) => fs.mkdir(dirPath, opts),
  statFile: (filePath) => fs.stat(filePath),
  helperRoot: HELPER_ROOT,
});

const resolveCategoryAlias = createCategoryAliasResolver({
  helperRoot: HELPER_ROOT,
  path,
  existsSync: (targetPath) => fsSync.existsSync(targetPath),
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Lazy SpecDb Cache Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const {
  specDbCache,
  reviewLayoutByCategory,
  getSpecDb,
  getSpecDbReady,
} = createSpecDbRuntime({
  resolveCategoryAlias,
  specDbClass: SpecDb,
  path,
  fsSync,
  syncSpecDbForCategory: syncSpecDbForCategoryService,
  config,
  logger: console,
});

let processStatusProvider = () => ({ running: false });
let forwardScreencastControlProvider = () => false;

const {
  broadcastWs,
  setupWatchers,
  attachWebSocketUpgrade,
} = createRealtimeBridge({
  path,
  fs,
  outputRoot: OUTPUT_ROOT,
  indexLabRoot: INDEXLAB_ROOT,
  parseNdjson,
  dataChangeMatchesCategory,
  processStatus: () => processStatusProvider(),
  forwardScreencastControl: (options) => forwardScreencastControlProvider(options),
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Process Manager Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const {
  getSearxngStatus,
  startSearxngStack,
  startProcess,
  stopProcess,
  processStatus,
  isProcessRunning,
  waitForProcessExit,
  forwardScreencastControl,
} = createProcessRuntime({
  resolveProjectPath,
  path,
  fsSync,
  config,
  spawn,
  execCb,
  broadcastWs,
  sessionCache,
  invalidateFieldRulesCache,
  reviewLayoutByCategory,
  syncSpecDbForCategory: ({ category }) =>
    syncSpecDbForCategoryService({
      category,
      config,
      resolveCategoryAlias,
      getSpecDbReady,
    }),
  handleCompileProcessCompletion,
  handleIndexLabProcessCompletion,
  runDataStorageState,
  indexLabRoot: INDEXLAB_ROOT,
  outputRoot: OUTPUT_ROOT,
  outputPrefix: config.s3OutputPrefix || 'specs/outputs',
  getSpecDbReady,
  resolveCategoryAlias,
  logger: console,
});

processStatusProvider = processStatus;
forwardScreencastControlProvider = forwardScreencastControl;

initIndexLabDataBuilders({
  indexLabRoot: INDEXLAB_ROOT,
  outputRoot: OUTPUT_ROOT,
  storage,
  config,
  getSpecDbReady,
  isProcessRunning,
});

function ensureGridKeyReviewState(specDb, category, productId, fieldKey, itemFieldStateId = null) {
  if (!specDb || !productId || !fieldKey) return null;
  try {
    const existing = specDb.getKeyReviewState({
      category,
      targetKind: 'grid_key',
      itemIdentifier: productId,
      fieldKey,
      itemFieldStateId,
    });
    if (existing) return existing;

    const ifs = itemFieldStateId
      ? specDb.getItemFieldStateById(itemFieldStateId)
      : specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
      ).get(category, productId, fieldKey);
    if (!ifs) return null;

    let aiConfirmPrimaryStatus = null;
    if (ifs.needs_ai_review && !ifs.ai_review_complete) aiConfirmPrimaryStatus = 'pending';
    else if (ifs.ai_review_complete) aiConfirmPrimaryStatus = 'confirmed';

    const userAcceptPrimaryStatus = ifs.overridden ? 'accepted' : null;

    const id = specDb.upsertKeyReviewState({
      category,
      targetKind: 'grid_key',
      itemIdentifier: productId,
      fieldKey,
      itemFieldStateId: ifs.id ?? itemFieldStateId ?? null,
      selectedValue: ifs.value ?? null,
      selectedCandidateId: ifs.accepted_candidate_id ?? null,
      confidenceScore: ifs.confidence ?? 0,
      aiConfirmPrimaryStatus,
      userAcceptPrimaryStatus,
    });
    return specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(id) || null;
  } catch {
    return null;
  }
}

function resolveKeyReviewForLaneMutation(specDb, category, body) {
  if (!specDb) {
    return {
      stateRow: null,
      error: 'specdb_not_ready',
      errorMessage: 'SpecDb is not available for this category.',
    };
  }
  const idReq = resolveExplicitPositiveId(body, ['id']);
  if (idReq.provided) {
    const byId = idReq.id ? specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(idReq.id) : null;
    if (byId) return { stateRow: byId, error: null };
    return {
      stateRow: null,
      error: 'key_review_state_id_not_found',
      errorMessage: `key_review_state id '${idReq.raw}' was not found.`,
    };
  }
  const fieldStateCtx = resolveGridFieldStateForMutation(specDb, category, body);
  if (fieldStateCtx?.error) {
    if (fieldStateCtx.error === 'item_field_state_id_required') {
      return {
        stateRow: null,
        error: 'id_or_item_field_state_id_required',
        errorMessage: 'Provide key_review_state id or itemFieldStateId for this lane mutation.',
      };
    }
    return {
      stateRow: null,
      error: fieldStateCtx.error,
      errorMessage: fieldStateCtx.errorMessage,
    };
  }
  const fieldStateRow = fieldStateCtx?.row;
  if (!fieldStateRow) return { stateRow: null, error: null };
  const productId = String(fieldStateRow.product_id || '').trim();
  const fieldKey = String(fieldStateRow.field_key || '').trim();
  if (!productId || !fieldKey) return { stateRow: null, error: null };
  return {
    stateRow: ensureGridKeyReviewState(specDb, category, productId, fieldKey, fieldStateRow.id),
    error: null,
  };
}

function markPrimaryLaneReviewedInItemState(specDb, category, keyReviewState) {
  if (!specDb || !keyReviewState) return;
  if (keyReviewState.target_kind !== 'grid_key') return;
  if (!keyReviewState.item_identifier || !keyReviewState.field_key) return;
  try {
    specDb.db.prepare(
      `UPDATE item_field_state
       SET needs_ai_review = 0,
           ai_review_complete = 1,
           updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ?`
    ).run(category, keyReviewState.item_identifier, keyReviewState.field_key);
  } catch { /* best-effort sync */ }
}

function syncItemFieldStateFromPrimaryLaneAccept(specDb, category, keyReviewState) {
  if (!specDb || !keyReviewState) return;
  if (keyReviewState.target_kind !== 'grid_key') return;
  const productId = String(keyReviewState.item_identifier || '').trim();
  const fieldKey = String(keyReviewState.field_key || '').trim();
  if (!productId || !fieldKey) return;

  const current = specDb.db.prepare(
    'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
  ).get(category, productId, fieldKey) || null;
  const selectedCandidateId = String(keyReviewState.selected_candidate_id || '').trim() || null;
  const candidateRow = selectedCandidateId ? specDb.getCandidateById(selectedCandidateId) : null;
  const selectedValue = candidateRow?.value ?? keyReviewState.selected_value ?? current?.value ?? null;
  if (!isMeaningfulValue(selectedValue) && !current) return;

  const confidenceScore = Number.isFinite(Number(candidateRow?.score))
    ? Number(candidateRow.score)
    : (Number.isFinite(Number(keyReviewState.confidence_score))
      ? Number(keyReviewState.confidence_score)
      : Number(current?.confidence || 0));
  const aiStatus = String(keyReviewState?.ai_confirm_primary_status || '').trim().toLowerCase();
  const aiConfirmed = aiStatus === 'confirmed';
  const source = candidateRow
    ? 'pipeline'
    : (String(current?.source || '').trim() || 'pipeline');

  specDb.upsertItemFieldState({
    productId,
    fieldKey,
    value: selectedValue,
    confidence: confidenceScore,
    source,
    acceptedCandidateId: selectedCandidateId || current?.accepted_candidate_id || null,
    overridden: false,
    needsAiReview: !aiConfirmed,
    aiReviewComplete: aiConfirmed,
  });
  try {
    specDb.syncItemListLinkForFieldValue({
      productId,
      fieldKey,
      value: selectedValue,
    });
  } catch { /* best-effort list-link sync */ }
}

function syncPrimaryLaneAcceptFromItemSelection({
  specDb,
  category,
  productId,
  fieldKey,
  selectedCandidateId = null,
  selectedValue = null,
  confidenceScore = null,
  reason = null,
}) {
  if (!specDb) return null;
  const state = ensureGridKeyReviewState(specDb, category, productId, fieldKey);
  if (!state) return null;

  const scoreValue = Number.isFinite(Number(confidenceScore))
    ? Number(confidenceScore)
    : null;
  specDb.db.prepare(`
    UPDATE key_review_state
    SET selected_candidate_id = ?,
        selected_value = ?,
        confidence_score = COALESCE(?, confidence_score),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    selectedCandidateId,
    selectedValue,
    scoreValue,
    state.id
  );

  const at = new Date().toISOString();
  specDb.updateKeyReviewUserAccept({ id: state.id, lane: 'primary', status: 'accepted', at });
  specDb.insertKeyReviewAudit({
    keyReviewStateId: state.id,
    eventType: 'user_accept',
    actorType: 'user',
    actorId: null,
    oldValue: state.user_accept_primary_status || null,
    newValue: 'accepted',
    reason: reason || 'User accepted item value via override',
  });

  return specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(state.id) || null;
}

function deleteKeyReviewStateRows(specDb, stateIds = []) {
  if (!specDb || !Array.isArray(stateIds) || stateIds.length === 0) return 0;
  const ids = stateIds
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (ids.length === 0) return 0;

  const tx = specDb.db.transaction((rows) => {
    for (const id of rows) {
      specDb.db.prepare(`
        DELETE FROM key_review_run_sources
        WHERE key_review_run_id IN (
          SELECT run_id FROM key_review_runs WHERE key_review_state_id = ?
        )
      `).run(id);
      specDb.db.prepare('DELETE FROM key_review_runs WHERE key_review_state_id = ?').run(id);
      specDb.db.prepare('DELETE FROM key_review_audit WHERE key_review_state_id = ?').run(id);
      specDb.db.prepare('DELETE FROM key_review_state WHERE id = ?').run(id);
    }
  });
  tx(ids);
  return ids.length;
}

function resetTestModeSharedReviewState(specDb, category) {
  if (!specDb || !category) return 0;
  const ids = specDb.db.prepare(`
    SELECT id
    FROM key_review_state
    WHERE category = ?
      AND target_kind IN ('component_key', 'enum_key')
  `).all(category).map((row) => row.id);
  return deleteKeyReviewStateRows(specDb, ids);
}

function purgeTestModeCategoryState(specDb, category) {
  const cat = String(category || '').trim();
  if (!specDb || !cat || !cat.startsWith('_test_')) {
    return {
      clearedKeyReview: 0,
      clearedSources: 0,
      clearedCandidates: 0,
      clearedFieldState: 0,
      clearedComponentData: 0,
      clearedEnumData: 0,
      clearedCatalogState: 0,
      clearedArtifacts: 0,
    };
  }

  let clearedKeyReview = 0;
  let clearedSources = 0;
  let clearedCandidates = 0;
  let clearedFieldState = 0;
  let clearedComponentData = 0;
  let clearedEnumData = 0;
  let clearedCatalogState = 0;
  let clearedArtifacts = 0;

  const tx = specDb.db.transaction(() => {
    const keyReviewIds = specDb.db.prepare(`
      SELECT id
      FROM key_review_state
      WHERE category = ?
    `).all(cat).map((row) => row.id);
    clearedKeyReview = deleteKeyReviewStateRows(specDb, keyReviewIds);

    const sourceIds = specDb.db.prepare(`
      SELECT source_id
      FROM source_registry
      WHERE category = ?
    `).all(cat).map((row) => String(row.source_id || '').trim()).filter(Boolean);

    if (sourceIds.length > 0) {
      const placeholders = sourceIds.map(() => '?').join(',');
      specDb.db.prepare(`
        DELETE FROM key_review_run_sources
        WHERE assertion_id IN (
          SELECT assertion_id
          FROM source_assertions
          WHERE source_id IN (${placeholders})
        )
      `).run(...sourceIds);
      specDb.db.prepare(`
        DELETE FROM source_evidence_refs
        WHERE assertion_id IN (
          SELECT assertion_id
          FROM source_assertions
          WHERE source_id IN (${placeholders})
        )
      `).run(...sourceIds);
      clearedSources += specDb.db.prepare(`
        DELETE FROM source_assertions
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds).changes;
      specDb.db.prepare(`
        DELETE FROM source_artifacts
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds);
      clearedSources += specDb.db.prepare(`
        DELETE FROM source_registry
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds).changes;
    }

    specDb.db.prepare(`
      DELETE FROM candidate_reviews
      WHERE candidate_id IN (
        SELECT candidate_id
        FROM candidates
        WHERE category = ?
      )
    `).run(cat);

    specDb.db.prepare('DELETE FROM item_list_links WHERE category = ?').run(cat);
    specDb.db.prepare('DELETE FROM item_component_links WHERE category = ?').run(cat);
    clearedCandidates = specDb.db.prepare('DELETE FROM candidates WHERE category = ?').run(cat).changes;
    clearedFieldState = specDb.db.prepare('DELETE FROM item_field_state WHERE category = ?').run(cat).changes;

    specDb.db.prepare(`
      DELETE FROM component_aliases
      WHERE component_id IN (
        SELECT id
        FROM component_identity
        WHERE category = ?
      )
    `).run(cat);
    clearedComponentData += specDb.db.prepare('DELETE FROM component_values WHERE category = ?').run(cat).changes;
    clearedComponentData += specDb.db.prepare('DELETE FROM component_identity WHERE category = ?').run(cat).changes;
    clearedEnumData += specDb.db.prepare('DELETE FROM list_values WHERE category = ?').run(cat).changes;
    clearedEnumData += specDb.db.prepare('DELETE FROM enum_lists WHERE category = ?').run(cat).changes;

    clearedCatalogState += specDb.db.prepare('DELETE FROM products WHERE category = ?').run(cat).changes;
    clearedCatalogState += specDb.db.prepare('DELETE FROM product_queue WHERE category = ?').run(cat).changes;
    clearedCatalogState += specDb.db.prepare('DELETE FROM product_runs WHERE category = ?').run(cat).changes;
    clearedCatalogState += specDb.db.prepare('DELETE FROM curation_suggestions WHERE category = ?').run(cat).changes;
    clearedCatalogState += specDb.db.prepare('DELETE FROM component_review_queue WHERE category = ?').run(cat).changes;
    clearedCatalogState += specDb.db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(cat).changes;

    clearedArtifacts += specDb.db.prepare('DELETE FROM artifacts WHERE category = ?').run(cat).changes;
    clearedArtifacts += specDb.db.prepare('DELETE FROM audit_log WHERE category = ?').run(cat).changes;
    // Phase 12+ auxiliary tables may not exist in every DB build.
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM category_brain WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_corpus WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM runtime_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_domains WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_field_rewards WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_brands WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_paths WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
  });
  tx();

  return {
    clearedKeyReview,
    clearedSources,
    clearedCandidates,
    clearedFieldState,
    clearedComponentData,
    clearedEnumData,
    clearedCatalogState,
    clearedArtifacts,
  };
}

function resetTestModeProductReviewState(specDb, category, productId) {
  const pid = String(productId || '').trim();
  if (!specDb || !category || !pid) return {
    clearedCandidates: 0,
    clearedKeyReview: 0,
    clearedFieldState: 0,
    clearedLinks: 0,
    clearedSources: 0,
  };

  const stateIds = specDb.db.prepare(`
    SELECT id
    FROM key_review_state
    WHERE category = ?
      AND target_kind = 'grid_key'
      AND item_identifier = ?
  `).all(category, pid).map((row) => row.id);
  const clearedKeyReview = deleteKeyReviewStateRows(specDb, stateIds);

  let deletedCandidates = 0;
  let deletedFieldState = 0;
  let deletedLinks = 0;
  let deletedSources = 0;
  const tx = specDb.db.transaction(() => {
    const itemFieldStateIds = specDb.db.prepare(`
      SELECT id
      FROM item_field_state
      WHERE category = ? AND product_id = ?
    `).all(category, pid).map((row) => row.id);
    const sourceIds = specDb.db.prepare(`
      SELECT source_id
      FROM source_registry
      WHERE category = ? AND product_id = ?
    `).all(category, pid).map((row) => row.source_id);

    if (itemFieldStateIds.length > 0) {
      const placeholders = itemFieldStateIds.map(() => '?').join(',');
      specDb.db.prepare(`
        DELETE FROM source_evidence_refs
        WHERE assertion_id IN (
          SELECT assertion_id
          FROM source_assertions
          WHERE item_field_state_id IN (${placeholders})
        )
      `).run(...itemFieldStateIds);
      deletedSources += specDb.db.prepare(`
        DELETE FROM source_assertions
        WHERE item_field_state_id IN (${placeholders})
      `).run(...itemFieldStateIds).changes;
    }

    if (sourceIds.length > 0) {
      const placeholders = sourceIds.map(() => '?').join(',');
      specDb.db.prepare(`
        DELETE FROM source_evidence_refs
        WHERE assertion_id IN (
          SELECT assertion_id
          FROM source_assertions
          WHERE source_id IN (${placeholders})
        )
      `).run(...sourceIds);
      deletedSources += specDb.db.prepare(`
        DELETE FROM source_assertions
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds).changes;
      specDb.db.prepare(`
        DELETE FROM source_artifacts
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds);
      deletedSources += specDb.db.prepare(`
        DELETE FROM source_registry
        WHERE source_id IN (${placeholders})
      `).run(...sourceIds).changes;
    }

    specDb.db.prepare(`
      DELETE FROM candidate_reviews
      WHERE context_type = 'item'
        AND context_id = ?
    `).run(pid);
    specDb.db.prepare(`
      DELETE FROM candidate_reviews
      WHERE candidate_id IN (
        SELECT candidate_id
        FROM candidates
        WHERE category = ? AND product_id = ?
      )
    `).run(category, pid);

    deletedLinks += specDb.db.prepare(`
      DELETE FROM item_component_links
      WHERE category = ? AND product_id = ?
    `).run(category, pid).changes;
    deletedLinks += specDb.db.prepare(`
      DELETE FROM item_list_links
      WHERE category = ? AND product_id = ?
    `).run(category, pid).changes;
    deletedFieldState = specDb.db.prepare(`
      DELETE FROM item_field_state
      WHERE category = ? AND product_id = ?
    `).run(category, pid).changes;

    deletedCandidates = specDb.db
      .prepare('DELETE FROM candidates WHERE category = ? AND product_id = ?')
      .run(category, pid).changes;
  });
  tx();

  return {
    clearedCandidates: deletedCandidates,
    clearedKeyReview,
    clearedFieldState: deletedFieldState,
    clearedLinks: deletedLinks,
    clearedSources: deletedSources,
  };
}

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
  return !UNKNOWN_LIKE_TOKENS.has(normalizeLower(value));
}

function candidateLooksReference(candidateId, sourceToken = '') {
  const token = String(sourceToken || '').trim().toLowerCase();
  const cid = String(candidateId || '').trim();
  return cid.startsWith('ref_')
    || cid.startsWith('ref-')
    || cid.includes('::ref_')
    || cid.includes('::ref-')
    || token.includes('reference')
    || token.includes('component_db');
}

function extractComparableValueTokens(rawValue) {
  if (Array.isArray(rawValue)) {
    const nested = [];
    for (const entry of rawValue) {
      nested.push(...extractComparableValueTokens(entry));
    }
    return [...new Set(nested)];
  }
  const text = String(rawValue ?? '').trim();
  if (!text) return [];
  const parts = text.includes(',')
    ? text.split(',').map((part) => String(part ?? '').trim()).filter(Boolean)
    : [text];
  return [...new Set(parts.map((part) => normalizeLower(part)).filter(Boolean))];
}

function splitCandidateParts(rawValue) {
  if (Array.isArray(rawValue)) {
    const nested = rawValue.flatMap((entry) => splitCandidateParts(entry));
    return [...new Set(nested)];
  }
  const text = String(rawValue ?? '').trim();
  if (!text) return [];
  const parts = text.includes(',')
    ? text.split(',').map((part) => String(part ?? '').trim()).filter(Boolean)
    : [text];
  return [...new Set(parts)];
}

async function getReviewFieldRow(category, fieldKey) {
  const cached = reviewLayoutByCategory.get(category);
  if (cached?.rowsByKey && (Date.now() - (cached.loadedAt || 0) < 15_000)) {
    return cached.rowsByKey.get(fieldKey) || null;
  }
  try {
    const session = await sessionCache.getSessionRules(category);
    const layout = await buildReviewLayout({
      storage,
      config,
      category,
      fieldOrderOverride: session.mergedFieldOrder,
      fieldsOverride: session.mergedFields,
    });
    const rowsByKey = new Map((layout.rows || []).map((row) => [String(row.key || ''), row]));
    reviewLayoutByCategory.set(category, { rowsByKey, loadedAt: Date.now() });
    return rowsByKey.get(fieldKey) || null;
  } catch {
    return null;
  }
}

function candidateMatchesReviewItemValue(reviewItem, candidateNorm) {
  if (!candidateNorm) return false;
  const direct = normalizeLower(reviewItem?.matched_component || reviewItem?.raw_query || '');
  if (direct && direct === candidateNorm) return true;
  const attrs = parseReviewItemAttributes(reviewItem);
  return Object.values(attrs).some((attrValue) => (
    extractComparableValueTokens(attrValue).includes(candidateNorm)
  ));
}

function parseReviewItemAttributes(reviewItem) {
  const raw = reviewItem?.product_attributes;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function makerTokensFromReviewItem(reviewItem, componentType) {
  const attrs = parseReviewItemAttributes(reviewItem);
  const fieldKey = String(reviewItem?.field_key || '').trim();
  const keys = [
    `${componentType}_brand`,
    `${componentType}_maker`,
    fieldKey ? `${fieldKey}_brand` : '',
    fieldKey ? `${fieldKey}_maker` : '',
    'brand',
    'maker',
  ].filter(Boolean);
  const tokens = [];
  for (const key of keys) {
    for (const valuePart of splitCandidateParts(attrs[key])) {
      if (!isMeaningfulValue(valuePart)) continue;
      tokens.push(normalizeLower(valuePart));
    }
  }
  for (const valuePart of splitCandidateParts(reviewItem?.ai_suggested_maker)) {
    if (!isMeaningfulValue(valuePart)) continue;
    tokens.push(normalizeLower(valuePart));
  }
  return [...new Set(tokens)];
}

function reviewItemMatchesMakerLane(reviewItem, {
  componentType,
  componentMaker,
  allowMakerlessForNamedLane = false,
}) {
  const laneMaker = normalizeLower(componentMaker || '');
  const makerTokens = makerTokensFromReviewItem(reviewItem, componentType);
  if (!laneMaker) return makerTokens.length === 0;
  if (!makerTokens.length) return Boolean(allowMakerlessForNamedLane);
  return makerTokens.includes(laneMaker);
}

function isResolvedCandidateReview(
  reviewRow,
  {
    includeHumanAccepted = true,
    treatSharedAcceptAsPending = false,
  } = {},
) {
  if (!reviewRow) return false;
  const aiStatus = normalizeLower(reviewRow.ai_review_status || '');
  const aiReason = normalizeLower(reviewRow.ai_reason || '');
  if (aiStatus === 'rejected') return true;
  if (aiStatus === 'accepted') {
    if (treatSharedAcceptAsPending && aiReason === 'shared_accept') {
      return false;
    }
    return true;
  }
  if (includeHumanAccepted && Number(reviewRow.human_accepted) === 1) {
    return true;
  }
  return false;
}

function buildCandidateReviewLookup(reviewRows) {
  const exact = new Map();
  for (const row of Array.isArray(reviewRows) ? reviewRows : []) {
    const cid = String(row?.candidate_id || '').trim();
    if (!cid) continue;
    exact.set(cid, row);
  }
  return { exact };
}

function getReviewForCandidateId(lookup, candidateId) {
  if (!lookup) return null;
  const cid = String(candidateId || '').trim();
  if (!cid) return null;
  if (lookup.exact.has(cid)) return lookup.exact.get(cid) || null;
  return null;
}

function collectPendingCandidateIds({
  candidateRows,
  reviewLookup = null,
  includeHumanAccepted = true,
  treatSharedAcceptAsPending = false,
}) {
  const actionableIds = [];
  const seen = new Set();
  for (const row of Array.isArray(candidateRows) ? candidateRows : []) {
    const cid = String(row?.candidate_id || '').trim();
    if (!cid || seen.has(cid)) continue;
    const rowValue = row?.value;
    if (!isMeaningfulValue(rowValue)) continue;
    seen.add(cid);
    actionableIds.push(cid);
  }
  const pending = [];
  for (const cid of actionableIds) {
    const reviewRow = getReviewForCandidateId(reviewLookup, cid);
    if (!isResolvedCandidateReview(reviewRow, {
      includeHumanAccepted,
      treatSharedAcceptAsPending,
    })) {
      pending.push(cid);
    }
  }
  return pending;
}

async function collectComponentReviewPropertyCandidateRows({
  category,
  componentType,
  componentName,
  componentMaker,
  allowMakerlessForNamedLane = false,
  propertyKey,
}) {
  const normalizedComponentName = normalizeLower(componentName);
  const normalizedPropertyKey = String(propertyKey || '').trim();
  if (!category || !componentType || !normalizedComponentName || !normalizedPropertyKey) return [];
  if (normalizedPropertyKey.startsWith('__')) return [];
  const filePath = componentReviewPath({ config, category });
  const data = await safeReadJson(filePath);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return [];

  const rows = [];
  const seen = new Set();
  for (const item of items) {
    const status = normalizeLower(item?.status || '');
    if (status === 'dismissed' || status === 'ignored' || status === 'rejected') continue;
    if (String(item?.component_type || '').trim() !== String(componentType || '').trim()) continue;

    const matchedName = normalizeLower(item?.matched_component || '');
    const rawName = normalizeLower(item?.raw_query || '');
    const isSameComponent = matchedName
      ? matchedName === normalizedComponentName
      : rawName === normalizedComponentName;
    if (!isSameComponent) continue;
    if (!reviewItemMatchesMakerLane(item, { componentType, componentMaker, allowMakerlessForNamedLane })) continue;

    const attrs = parseReviewItemAttributes(item);
    const matchedEntry = Object.entries(attrs).find(([attrKey]) => (
      normalizeLower(attrKey) === normalizeLower(normalizedPropertyKey)
    ));
    if (!matchedEntry) continue;
    const [, attrValue] = matchedEntry;
    for (const valuePart of splitCandidateParts(attrValue)) {
      if (!isMeaningfulValue(valuePart)) continue;
      const candidateId = buildComponentReviewSyntheticCandidateId({
        productId: String(item?.product_id || '').trim(),
        fieldKey: normalizedPropertyKey,
        reviewId: String(item?.review_id || '').trim() || null,
        value: valuePart,
      });
      const cid = String(candidateId || '').trim();
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      rows.push({ candidate_id: cid, value: valuePart });
    }
  }
  return rows;
}

function normalizeCandidatePrimaryReviewStatus(candidate, reviewRow = null) {
  if (candidate?.is_synthetic_selected) return 'accepted';
  if (reviewRow) {
    if (Number(reviewRow.human_accepted) === 1) return 'accepted';
    const aiStatus = normalizeLower(reviewRow.ai_review_status || '');
    if (aiStatus === 'accepted') return 'accepted';
    if (aiStatus === 'rejected') return 'rejected';
    return 'pending';
  }
  const sourceToken = normalizeLower(candidate?.source_id || candidate?.source || '');
  const methodToken = normalizeLower(candidate?.method || candidate?.source_method || '');
  if (
    sourceToken === 'reference'
    || sourceToken === 'component_db'
    || sourceToken === 'known_values'
    || sourceToken === 'user'
    || sourceToken === 'manual'
    || methodToken.includes('reference_data')
    || methodToken.includes('manual')
  ) {
    return 'accepted';
  }
  return 'pending';
}

function annotateCandidatePrimaryReviews(candidates, reviewRows = []) {
  const lookup = buildCandidateReviewLookup(reviewRows);
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const candidateId = String(candidate?.candidate_id || '').trim();
    const reviewRow = candidateId ? getReviewForCandidateId(lookup, candidateId) : null;
    candidate.primary_review_status = normalizeCandidatePrimaryReviewStatus(candidate, reviewRow);
    candidate.human_accepted = Number(reviewRow?.human_accepted || 0) === 1;
  }
}

function getPendingItemPrimaryCandidateIds(specDb, {
  productId,
  fieldKey,
  itemFieldStateId,
}) {
  if (!specDb || !productId || !fieldKey || !itemFieldStateId) return [];
  const candidatesByField = specDb.getCandidatesForProduct(productId) || {};
  const candidateRows = candidatesByField[fieldKey] || [];
  const reviewRows = specDb.getReviewsForContext('item', String(itemFieldStateId)) || [];
  const reviewLookup = buildCandidateReviewLookup(reviewRows);
  return collectPendingCandidateIds({
    candidateRows,
    reviewLookup,
  });
}

function getPendingComponentSharedCandidateIds(specDb, {
  componentType,
  componentName,
  componentMaker,
  propertyKey,
  componentValueId,
}) {
  if (!specDb || !componentValueId || !propertyKey) return [];
  const candidateRows = specDb.getCandidatesForComponentProperty(
    componentType,
    componentName,
    componentMaker || '',
    propertyKey,
  ) || [];
  const reviewRows = specDb.getReviewsForContext('component', String(componentValueId)) || [];
  const reviewLookup = buildCandidateReviewLookup(reviewRows);
  // Include synthetic pipeline review candidates derived from component_review queue
  // so lane status remains pending until all candidate-level confirmations are resolved.
  return collectPendingCandidateIds({
    candidateRows: candidateRows,
    reviewLookup,
    includeHumanAccepted: false,
    treatSharedAcceptAsPending: true,
  });
}

async function getPendingComponentSharedCandidateIdsAsync(specDb, {
  category,
  componentType,
  componentName,
  componentMaker,
  propertyKey,
  componentValueId,
}) {
  if (!specDb || !componentValueId || !propertyKey) return [];
  const candidateRows = specDb.getCandidatesForComponentProperty(
    componentType,
    componentName,
    componentMaker || '',
    propertyKey,
  ) || [];
  const reviewRows = specDb.getReviewsForContext('component', String(componentValueId)) || [];
  const reviewLookup = buildCandidateReviewLookup(reviewRows);
  const ambiguousMakerRows = specDb.db.prepare(`
    SELECT COUNT(DISTINCT LOWER(TRIM(COALESCE(maker, '')))) AS maker_count
    FROM component_identity
    WHERE category = ?
      AND component_type = ?
      AND LOWER(TRIM(canonical_name)) = LOWER(TRIM(?))
  `).get(specDb.category, componentType, componentName);
  const allowMakerlessForNamedLane = Boolean(String(componentMaker || '').trim())
    && Number(ambiguousMakerRows?.maker_count || 0) <= 1;
  const syntheticRows = await collectComponentReviewPropertyCandidateRows({
    category,
    componentType,
    componentName,
    componentMaker,
    allowMakerlessForNamedLane,
    propertyKey,
  });
  return collectPendingCandidateIds({
    candidateRows: [...candidateRows, ...syntheticRows],
    reviewLookup,
    includeHumanAccepted: false,
    treatSharedAcceptAsPending: true,
  });
}

function getPendingEnumSharedCandidateIds(specDb, {
  fieldKey,
  listValueId,
}) {
  if (!specDb || !fieldKey || !listValueId) return [];
  const candidateRows = specDb.getCandidatesByListValue(fieldKey, listValueId) || [];
  const reviewRows = specDb.getReviewsForContext('list', String(listValueId)) || [];
  const reviewLookup = buildCandidateReviewLookup(reviewRows);
  return collectPendingCandidateIds({
    candidateRows,
    reviewLookup,
    includeHumanAccepted: false,
    treatSharedAcceptAsPending: true,
  });
}

async function syncSyntheticCandidatesFromComponentReview({ category, specDb }) {
  if (!specDb) return { upserted: 0 };
  const filePath = componentReviewPath({ config, category });
  const data = await safeReadJson(filePath);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return { upserted: 0 };

  let upserted = 0;
  let assertionsUpserted = 0;
  const sourceIds = new Set();
  const nowIso = new Date().toISOString();
  const categoryToken = String(specDb.category || category || '').trim();
  const selectItemFieldSlotId = specDb.db.prepare(
    'SELECT id FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
  );
  const selectEvidenceRef = specDb.db.prepare(
    'SELECT 1 FROM source_evidence_refs WHERE assertion_id = ? LIMIT 1'
  );
  for (const item of items) {
    const status = String(item?.status || '').trim().toLowerCase();
    if (status === 'dismissed') continue;
    const productId = String(item?.product_id || '').trim();
    const fieldKey = String(item?.field_key || '').trim();
    if (!productId || !fieldKey) continue;
    const runToken = normalizePathToken(item?.run_id || 'component-review', 'component-review');
    const reviewToken = normalizePathToken(item?.review_id || 'pending', 'pending');
    const sourceId = `${categoryToken}::${productId}::pipeline::${runToken}::${reviewToken}`;
    const sourceUrl = `pipeline://component-review/${reviewToken}`;
    specDb.upsertSourceRegistry({
      sourceId,
      category: categoryToken,
      itemIdentifier: productId,
      productId,
      runId: item?.run_id || null,
      sourceUrl,
      sourceHost: 'pipeline',
      sourceRootDomain: 'pipeline',
      sourceTier: null,
      sourceMethod: item?.match_type || 'component_review',
      crawlStatus: 'fetched',
      httpStatus: null,
      fetchedAt: item?.created_at || nowIso,
    });
    sourceIds.add(sourceId);

    const pushCandidate = (candidateId, value, score, method, quote, snippetText, candidateFieldKey = fieldKey) => {
      const text = String(value ?? '').trim();
      if (!text || !isMeaningfulValue(text)) return;
      const resolvedFieldKey = String(candidateFieldKey || '').trim();
      if (!resolvedFieldKey) return;
      const itemFieldStateId = selectItemFieldSlotId.get(categoryToken, productId, resolvedFieldKey)?.id ?? null;
      const normalizedText = normalizeLower(text);
      specDb.insertCandidate({
        candidate_id: candidateId,
        product_id: productId,
        field_key: resolvedFieldKey,
        value: text,
        normalized_value: normalizedText,
        score: Number.isFinite(Number(score)) ? Number(score) : 0.5,
        rank: 1,
        source_url: sourceUrl,
        source_host: 'pipeline',
        source_root_domain: 'pipeline',
        source_tier: null,
        source_method: method,
        approved_domain: 0,
        snippet_id: String(item.review_id || ''),
        snippet_hash: '',
        snippet_text: snippetText || '',
        quote: quote || '',
        quote_span_start: null,
        quote_span_end: null,
        evidence_url: '',
        evidence_retrieved_at: item.created_at || null,
        is_component_field: 1,
        component_type: item.component_type || null,
        is_list_field: 0,
        llm_extract_model: null,
        extracted_at: item.created_at || nowIso,
        run_id: item.run_id || null,
      });
      upserted += 1;
      const assertionId = String(candidateId || '').trim();
      if (!assertionId) return;
      specDb.upsertSourceAssertion({
        assertionId,
        sourceId,
        fieldKey: resolvedFieldKey,
        contextKind: 'scalar',
        contextRef: itemFieldStateId ? `item_field_state:${itemFieldStateId}` : `item_field:${productId}:${resolvedFieldKey}`,
        itemFieldStateId,
        componentValueId: null,
        listValueId: null,
        enumListId: null,
        valueRaw: text,
        valueNormalized: normalizedText,
        unit: null,
        candidateId: assertionId,
        extractionMethod: method || item?.match_type || 'component_review',
      });
      assertionsUpserted += 1;
      if (!selectEvidenceRef.get(assertionId)) {
        const quoteText = String(quote || snippetText || `Pipeline component review candidate for ${fieldKey}`).trim();
        specDb.insertSourceEvidenceRef({
          assertionId,
          evidenceUrl: sourceUrl,
          snippetId: String(item.review_id || '').trim() || null,
          quote: quoteText || null,
          method: method || item?.match_type || 'component_review',
          tier: null,
          retrievedAt: item.created_at || nowIso,
        });
      }
    };

    const primaryValue = String(item?.matched_component || item?.raw_query || '').trim();
    if (primaryValue) {
      const id = buildComponentReviewSyntheticCandidateId({
        productId,
        fieldKey,
        reviewId: String(item?.review_id || '').trim() || null,
        value: primaryValue,
      });
      pushCandidate(
        id,
        primaryValue,
        item?.combined_score ?? 0.5,
        item?.match_type || 'component_review',
        item?.raw_query ? `Raw query: "${item.raw_query}"` : '',
        item?.reasoning_note || 'Pipeline component review candidate',
      );
    }

    const attrs = item?.product_attributes && typeof item.product_attributes === 'object'
      ? item.product_attributes
      : {};
    for (const [attrKeyRaw, attrValue] of Object.entries(attrs)) {
      const attrKey = String(attrKeyRaw || '').trim();
      if (!attrKey) continue;
      for (const attrText of splitCandidateParts(attrValue)) {
        if (!isMeaningfulValue(attrText)) continue;
        const id = buildComponentReviewSyntheticCandidateId({
          productId,
          fieldKey: attrKey,
          reviewId: String(item?.review_id || '').trim() || attrKey,
          value: attrText,
        });
        pushCandidate(
          id,
          attrText,
          item?.property_score ?? 0.4,
          'product_extraction',
          `Extracted attribute "${attrKey}" from product run`,
          `${attrKey}: ${attrText}`,
          attrKey,
        );
      }
    }
  }
  return { upserted, assertionsUpserted, sourcesUpserted: sourceIds.size };
}

async function markSharedReviewItemsResolved({
  category,
  fieldKey,
  productId,
  selectedValue,
  laneAction = 'accept',
  specDb = null,
}) {
  const candidateNorm = normalizeLower(selectedValue);
  if (!candidateNorm) return { changed: 0 };
  const filePath = componentReviewPath({ config, category });
  const data = await safeReadJson(filePath);
  if (!data || !Array.isArray(data.items)) return { changed: 0 };

  const now = new Date().toISOString();
  const nextStatus = laneAction === 'accept' ? 'accepted_alias' : 'confirmed_ai';
  const changedReviewIds = [];
  let changed = 0;
  for (const item of data.items) {
    if (item?.status !== 'pending_ai') continue;
    if (String(item?.product_id || '').trim() !== String(productId || '').trim()) continue;
    if (String(item?.field_key || '').trim() !== String(fieldKey || '').trim()) continue;
    if (!candidateMatchesReviewItemValue(item, candidateNorm)) continue;
    item.status = nextStatus;
    if (laneAction === 'accept') {
      item.matched_component = String(selectedValue);
    }
    item.human_reviewed_at = now;
    changedReviewIds.push(String(item.review_id || '').trim());
    changed += 1;
  }
  if (!changed) return { changed: 0 };

  data.updated_at = now;
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const runtimeSpecDb = specDb || getSpecDb(category);
  if (runtimeSpecDb) {
    try {
      for (const reviewId of changedReviewIds) {
        if (!reviewId) continue;
        if (laneAction === 'accept') {
          runtimeSpecDb.db.prepare(
            `UPDATE component_review_queue
             SET status = ?, matched_component = ?, human_reviewed_at = ?, updated_at = datetime('now')
             WHERE category = ? AND review_id = ?`
          ).run('accepted_alias', String(selectedValue), now, category, reviewId);
        } else {
          runtimeSpecDb.db.prepare(
            `UPDATE component_review_queue
             SET status = ?, human_reviewed_at = ?, updated_at = datetime('now')
             WHERE category = ? AND review_id = ?`
          ).run('confirmed_ai', now, category, reviewId);
        }
      }
    } catch { /* best-effort */ }
  }
  return { changed };
}

async function remapPendingComponentReviewItemsForNameChange({
  category,
  componentType,
  oldName,
  newName,
  specDb = null,
}) {
  const oldNorm = normalizeLower(oldName);
  const newValue = String(newName || '').trim();
  if (!oldNorm || !newValue || oldNorm === normalizeLower(newValue)) return { changed: 0 };

  const filePath = componentReviewPath({ config, category });
  const data = await safeReadJson(filePath);
  let changed = 0;
  const changedReviewIds = [];

  if (data && Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item?.status !== 'pending_ai') continue;
      if (String(item?.component_type || '').trim() !== String(componentType || '').trim()) continue;
      const matchedNorm = normalizeLower(item?.matched_component || '');
      const rawNorm = normalizeLower(item?.raw_query || '');
      const shouldRebind = matchedNorm === oldNorm || (!matchedNorm && rawNorm === oldNorm);
      if (!shouldRebind) continue;
      item.matched_component = newValue;
      changed += 1;
      changedReviewIds.push(String(item.review_id || '').trim());
    }
    if (changed > 0) {
      data.updated_at = new Date().toISOString();
      await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    }
  }

  const runtimeSpecDb = specDb || getSpecDb(category);
  if (runtimeSpecDb) {
    try {
      if (changedReviewIds.length > 0) {
        const stmt = runtimeSpecDb.db.prepare(
          `UPDATE component_review_queue
           SET matched_component = ?, updated_at = datetime('now')
           WHERE category = ? AND review_id = ?`
        );
        for (const reviewId of changedReviewIds) {
          if (!reviewId) continue;
          stmt.run(newValue, category, reviewId);
        }
      } else {
        runtimeSpecDb.db.prepare(
          `UPDATE component_review_queue
           SET matched_component = ?, updated_at = datetime('now')
           WHERE category = ?
             AND component_type = ?
             AND status = 'pending_ai'
             AND (
               LOWER(TRIM(COALESCE(matched_component, ''))) = LOWER(TRIM(?))
               OR (
                 (matched_component IS NULL OR TRIM(matched_component) = '')
                 AND LOWER(TRIM(COALESCE(raw_query, ''))) = LOWER(TRIM(?))
               )
             )`
        ).run(newValue, category, componentType, oldName, oldName);
      }
    } catch {
      // best-effort sync
    }
  }

  return { changed };
}

async function propagateSharedLaneDecision({
  category,
  specDb,
  keyReviewState,
  laneAction,
  candidateValue = null,
}) {
  if (!specDb || !keyReviewState) return { propagated: false };
  if (String(keyReviewState.target_kind || '') !== 'grid_key') return { propagated: false };
  if (laneAction !== 'accept') return { propagated: false };

  const fieldKey = String(keyReviewState.field_key || '').trim();
  const selectedValue = String(
    candidateValue ?? keyReviewState.selected_value ?? ''
  ).trim();
  if (!fieldKey || !isMeaningfulValue(selectedValue)) return { propagated: false };

  // Grid shared accepts are strictly slot-scoped: one item field slot action must never
  // mutate peer item slots, component property slots, or enum value slots.
  return { propagated: false };
}


const parsePath = createApiPathParser({ resolveCategoryAlias });

// Ã¢â€â‚¬Ã¢â€â‚¬ Catalog builder Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Catalog builder
const buildCatalog = createCatalogBuilder({
  config,
  storage,
  getSpecDb,
  loadQueueState,
  loadProductCatalog,
  cleanVariant,
  catalogKey,
  path,
});

// Compiled component DB dual-write
const patchCompiledComponentDb = createCompiledComponentDbPatcher({
  helperRoot: HELPER_ROOT,
  listFiles,
  safeReadJson,
  fs,
  path,
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Static assets root (needed by route context) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const DIST_ROOT = process.env.__GUI_DIST_ROOT
  ? resolveProjectPath(process.env.__GUI_DIST_ROOT)
  : resolveProjectPath(path.join('tools', 'gui-react', 'dist'));

// Ã¢â€â‚¬Ã¢â€â‚¬ Route Handler Registration Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const routeCtx = {
  jsonRes,
  readJsonBody,
  toInt,
  toFloat,
  toUnitRatio,
  hasKnownValue,
  config,
  runDataStorageState,
  storage,
  fs,
  path,
  OUTPUT_ROOT,
  HELPER_ROOT,
  DIST_ROOT,
  INDEXLAB_ROOT,
  canonicalSlugify,
  listDirs,
  listFiles,
  safeReadJson,
  safeStat,
  safeJoin,
  getSearxngStatus,
  startSearxngStack,
  startProcess,
  stopProcess,
  processStatus,
  isProcessRunning,
  waitForProcessExit,
  getSpecDb,
  getSpecDbReady,
  broadcastWs,
  resolveCategoryAlias,
  sessionCache,
  reviewLayoutByCategory,
  specDbCache,
  invalidateFieldRulesCache,
  buildCatalog,
  reconcileOrphans,
  loadProductCatalog,
  listProducts,
  catalogAddProduct,
  catalogAddProductsBulk: catalogAddProductsBulk,
  catalogUpdateProduct,
  catalogRemoveProduct,
  catalogSeedFromCatalog: catalogSeedFromCatalog,
  upsertQueueProduct,
  readJsonlEvents,
  loadCategoryConfig,
  loadFieldStudioMap,
  saveFieldStudioMap,
  validateFieldStudioMap,
  buildFieldLabelsMap,
  cleanVariant,
  slugify,
  spawn,
  // LLM config helpers
  collectLlmModels,
  llmProviderFromModel,
  resolvePricingForModel,
  resolveTokenProfileForModel,
  resolveLlmRoleDefaults,
  resolveLlmKnobDefaults,
  llmRoutingSnapshot,
  buildLlmMetrics,
  buildIndexingDomainChecklist,
  buildReviewMetrics,
  // IndexLab data builders
  readIndexLabRunEvents,
  readIndexLabRunNeedSet,
  readIndexLabRunSearchProfile,
  readIndexLabRunPhase07Retrieval,
  readIndexLabRunPhase08Extraction,
  readIndexLabRunDynamicFetchDashboard,
  readIndexLabRunSourceIndexingPackets,
  readIndexLabRunItemIndexingPacket,
  readIndexLabRunRunMetaPacket,
  readIndexLabRunSerpExplorer,
  readIndexLabRunLlmTraces,
  readIndexLabRunAutomationQueue,
  readIndexLabRunEvidenceIndex,
  listIndexLabRuns,
  buildRoundSummaryFromEvents,
  buildSearchHints,
  buildAnchorsSuggestions,
  buildKnownValuesSuggestions,
  // Brand registry
  loadBrandRegistry,
  saveBrandRegistry,
  addBrand,
  addBrandsBulk,
  updateBrand,
  removeBrand,
  getBrandsForCategory,
  seedBrandsFromActiveFiltering,
  renameBrand,
  getBrandImpactAnalysis,
  // Review
  buildReviewLayout,
  buildProductReviewPayload,
  buildReviewQueue,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  readLatestArtifacts,
  findProductsReferencingComponent,
  componentReviewPath,
  runComponentReviewBatch,
  resolveGridFieldStateForMutation,
  setOverrideFromCandidate,
  setManualOverride,
  syncPrimaryLaneAcceptFromItemSelection,
  resolveKeyReviewForLaneMutation,
  getPendingItemPrimaryCandidateIds,
  markPrimaryLaneReviewedInItemState,
  syncItemFieldStateFromPrimaryLaneAccept,
  isMeaningfulValue,
  propagateSharedLaneDecision,
  syncSyntheticCandidatesFromComponentReview,
  resolveComponentMutationContext,
  candidateLooksReference,
  normalizeLower,
  buildComponentIdentifier,
  applySharedLaneState,
  cascadeComponentChange,
  loadQueueState,
  saveQueueState,
  remapPendingComponentReviewItemsForNameChange,
  getPendingComponentSharedCandidateIdsAsync,
  resolveEnumMutationContext,
  getPendingEnumSharedCandidateIds,
  cascadeEnumChange,
  markEnumSuggestionStatusBound,
  annotateCandidatePrimaryReviews,
  ensureGridKeyReviewState,
  patchCompiledComponentDb,
  // Test mode
  buildTrafficLight,
  deriveTrafficLightCounts,
  analyzeContract,
  buildTestProducts,
  generateTestSourceResults,
  buildDeterministicSourceResults,
  buildSeedComponentDB,
  buildValidationChecks,
  loadComponentIdentityPools,
  runTestProduct,
  purgeTestModeCategoryState,
  resetTestModeSharedReviewState,
  resetTestModeProductReviewState,
};

const { routeHandlers: registeredApiRouteHandlers } = createGuiApiRouteRegistry({
  routeCtx,
  registerInfraRoutes,
  registerConfigRoutes,
  registerIndexlabRoutes,
  registerRuntimeOpsRoutes,
  registerCatalogRoutes,
  registerBrandRoutes,
  registerStudioRoutes,
  registerDataAuthorityRoutes,
  registerQueueBillingLearningRoutes,
  registerReviewRoutes,
  registerTestModeRoutes,
  registerSourceStrategyRoutes,
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Route Handler Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const handleApi = createApiRouteDispatcher({
  parsePath,
  routeHandlers: registeredApiRouteHandlers,
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Static File Serving Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function serveStatic(req, res) {
  let filePath = path.join(DIST_ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  // For SPA, serve index.html for non-file paths
  const ext = path.extname(filePath);
  if (!ext) filePath = path.join(DIST_ROOT, 'index.html');

  const stream = createReadStream(filePath);
  stream.on('error', () => {
    // Fallback to index.html for SPA routing
    const indexStream = createReadStream(path.join(DIST_ROOT, 'index.html'));
    indexStream.on('error', () => {
      res.statusCode = 404;
      res.end('Not Found');
    });
    res.setHeader('Content-Type', 'text/html');
    indexStream.pipe(res);
  });
  const contentType = mimeType(path.extname(filePath) || '.html');
  res.setHeader('Content-Type', contentType);
  // Prevent caching of all static files so new builds are always picked up
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  stream.pipe(res);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ WebSocket Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬


// Ã¢â€â‚¬Ã¢â€â‚¬ HTTP Server Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const handleHttpRequest = createApiHttpRequestHandler({
  corsHeaders,
  handleApi,
  jsonRes,
  serveStatic,
});

const server = http.createServer(handleHttpRequest);
attachWebSocketUpgrade(server);

server.listen(PORT, '0.0.0.0', () => {
  const msg = `[gui-server] running on http://localhost:${PORT}`;
  console.log(msg);
  console.log(`[gui-server] API:     http://localhost:${PORT}/api/v1/health`);
  console.log(`[gui-server] WS:      ws://localhost:${PORT}/ws`);
  console.log(`[gui-server] Project: ${PROJECT_ROOT}`);
  console.log(`[gui-server] CWD:     ${LAUNCH_CWD}`);
  console.log(`[gui-server] Helper:  ${HELPER_ROOT}`);
  console.log(`[gui-server] Output:  ${OUTPUT_ROOT}`);
  console.log(`[gui-server] IndexLab:${INDEXLAB_ROOT}`);
  console.log(`[gui-server] Canonical settings writes only: ${config.settingsCanonicalOnlyWrites ? 'ON' : 'OFF'}`);
  console.log(`[gui-server] Static:  ${DIST_ROOT}`);
  try {
    const distFiles = fsSync.readdirSync(path.join(DIST_ROOT, 'assets'));
    console.log(`[gui-server] Assets:  ${distFiles.join(', ')}`);
  } catch { console.log('[gui-server] Assets:  (could not list)'); }
  setupWatchers();

  // Auto-open browser when --open flag is passed (used by SpecFactory.exe launcher)
  if (args.includes('--open')) {
    const url = `http://localhost:${PORT}?_=${Date.now()}`;
    console.log(`[gui-server] Opening browser -> ${url}`);
    // Windows: start, macOS: open, Linux: xdg-open
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
    execCb(cmd);
  }
});

