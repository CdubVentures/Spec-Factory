import fs from 'node:fs/promises';
import path from 'node:path';
import { emitDataChange } from '../events/dataChangeContract.js';
import {
  defaultRunDataLocalDirectory,
  listLocalStorageDirectories,
  normalizeRunDataStorageSettings,
  sanitizeRunDataStorageSettingsForResponse,
  validateRunDataStorageSettings,
} from '../services/runDataRelocationService.js';
import {
  loadUserSettingsSync,
  persistUserSettingsSections,
  snapshotConvergenceSettings,
  snapshotRuntimeSettings,
  snapshotStorageSettings,
  snapshotUiSettings,
} from '../services/userSettingsService.js';

export function registerConfigRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    toInt,
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
    getSpecDb,
    storage,
    OUTPUT_ROOT,
    broadcastWs,
    HELPER_ROOT,
    runDataStorageState: providedRunDataStorageState,
  } = ctx;
  const runDataStorageState = providedRunDataStorageState && typeof providedRunDataStorageState === 'object'
    ? providedRunDataStorageState
    : {};
  Object.assign(
    runDataStorageState,
    normalizeRunDataStorageSettings(runDataStorageState, runDataStorageState),
  );
  const helperFilesRoot = HELPER_ROOT || config?.helperFilesRoot || 'helper_files';
  const initialUserSettings = loadUserSettingsSync({ helperFilesRoot });
  const uiSettingsState = snapshotUiSettings(initialUserSettings?.ui || {});

  async function persistSettingsFile(filename, snapshot) {
    const dir = path.join(HELPER_ROOT || 'helper_files', '_runtime');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, filename),
      JSON.stringify(snapshot, null, 2) + '\n',
      'utf8',
    );
  }

  return async function handleConfigRoutes(parts, params, method, req, res) {
    if (parts[0] === 'ui-settings' && method === 'GET') {
      return jsonRes(res, 200, snapshotUiSettings(uiSettingsState));
    }

    if (parts[0] === 'ui-settings' && method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const KEY_SET = new Set([
        'studioAutoSaveAllEnabled',
        'studioAutoSaveEnabled',
        'studioAutoSaveMapEnabled',
        'runtimeAutoSaveEnabled',
        'storageAutoSaveEnabled',
        'llmSettingsAutoSaveEnabled',
      ]);
      const applied = {};
      for (const [key, value] of Object.entries(body || {})) {
        if (!KEY_SET.has(key)) continue;
        const enabled = value === true || value === 'true' || value === 1;
        uiSettingsState[key] = enabled;
        applied[key] = enabled;
      }
      const snapshot = snapshotUiSettings(uiSettingsState);
      Object.assign(uiSettingsState, snapshot);
      try {
        await persistUserSettingsSections({
          helperFilesRoot,
          ui: snapshot,
        });
      } catch {
        return jsonRes(res, 500, { error: 'ui_settings_persist_failed' });
      }
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'ui',
          applied,
        },
      });
      return jsonRes(res, 200, { ok: true, ...snapshot, applied });
    }

    if (
      parts[0] === 'storage-settings'
      && parts[1] === 'local'
      && (parts[2] === 'browse' || !parts[2])
      && method === 'GET'
    ) {
      const requestedPath = String(params.get('path') || '').trim();
      const maxEntries = Math.max(1, toInt(params.get('limit'), 500));
      const resolvedBrowseCwd = requestedPath
        ? process.cwd()
        : (runDataStorageState.localDirectory || defaultRunDataLocalDirectory());
      try {
        if (!requestedPath) {
          await fs.mkdir(resolvedBrowseCwd, { recursive: true });
        }
        const listing = await listLocalStorageDirectories({
          requestedPath,
          cwd: resolvedBrowseCwd,
          maxEntries,
        });
        return jsonRes(res, 200, listing);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'storage_browse_failed';
        return jsonRes(res, 400, { error: message });
      }
    }

    if (parts[0] === 'storage-settings' && method === 'GET') {
      return jsonRes(res, 200, sanitizeRunDataStorageSettingsForResponse(runDataStorageState));
    }

    if (parts[0] === 'storage-settings' && method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const normalized = normalizeRunDataStorageSettings(body, runDataStorageState);
      const validationError = validateRunDataStorageSettings(normalized);
      if (validationError) {
        return jsonRes(res, 400, { error: validationError });
      }
      if (normalized.destinationType === 'local') {
        try {
          await fs.mkdir(normalized.localDirectory || defaultRunDataLocalDirectory(), { recursive: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'local_directory_create_failed';
          return jsonRes(res, 400, { error: message });
        }
      }
      Object.assign(runDataStorageState, normalized, { updatedAt: new Date().toISOString() });
      const storageSnapshot = snapshotStorageSettings(runDataStorageState);
      persistUserSettingsSections({
        helperFilesRoot,
        storage: storageSnapshot,
      }).catch(() => {});
      emitDataChange({
        broadcastWs,
        event: 'storage-settings-updated',
        domains: ['storage', 'settings'],
        meta: {
          enabled: runDataStorageState.enabled,
          destinationType: runDataStorageState.destinationType,
        },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'storage',
          enabled: runDataStorageState.enabled,
          destinationType: runDataStorageState.destinationType,
        },
      });
      persistSettingsFile('storage-settings.json', sanitizeRunDataStorageSettingsForResponse(runDataStorageState)).catch(() => {});
      return jsonRes(res, 200, {
        ok: true,
        ...sanitizeRunDataStorageSettingsForResponse(storageSnapshot),
      });
    }

    if (parts[0] === 'indexing' && parts[1] === 'llm-config' && method === 'GET') {
      const models = collectLlmModels(config);
      const modelPricing = models.map((modelName) => ({
        model: modelName,
        provider: llmProviderFromModel(modelName),
        ...resolvePricingForModel(config, modelName)
      }));
      const modelTokenProfiles = models.map((modelName) => ({
        model: modelName,
        ...resolveTokenProfileForModel(config, modelName)
      }));
      const roleDefaults = resolveLlmRoleDefaults(config);
      const knobDefaults = resolveLlmKnobDefaults(config);
      const roleTokenDefaults = {
        plan: toInt(knobDefaults.phase_02_planner?.token_cap, 1200),
        fast: toInt(knobDefaults.fast_pass?.token_cap, 1200),
        triage: toInt(knobDefaults.phase_03_triage?.token_cap, 1200),
        reasoning: toInt(knobDefaults.reasoning_pass?.token_cap, 4096),
        extract: toInt(knobDefaults.extract_role?.token_cap, 1200),
        validate: toInt(knobDefaults.validate_role?.token_cap, 1200),
        write: toInt(knobDefaults.write_role?.token_cap, 1200)
      };
      const fallbackDefaults = {
        enabled: Boolean(
          String(config.llmPlanFallbackModel || '').trim()
          || String(config.llmExtractFallbackModel || '').trim()
          || String(config.llmValidateFallbackModel || '').trim()
          || String(config.llmWriteFallbackModel || '').trim()
        ),
        plan: String(config.llmPlanFallbackModel || '').trim(),
        extract: String(config.llmExtractFallbackModel || '').trim(),
        validate: String(config.llmValidateFallbackModel || '').trim(),
        write: String(config.llmWriteFallbackModel || '').trim(),
        plan_tokens: toInt(config.llmMaxOutputTokensPlanFallback, roleTokenDefaults.plan),
        extract_tokens: toInt(config.llmMaxOutputTokensExtractFallback, roleTokenDefaults.extract),
        validate_tokens: toInt(config.llmMaxOutputTokensValidateFallback, roleTokenDefaults.validate),
        write_tokens: toInt(config.llmMaxOutputTokensWriteFallback, roleTokenDefaults.write)
      };
      return jsonRes(res, 200, {
        generated_at: new Date().toISOString(),
        phase2: {
          enabled_default: Boolean(config.llmEnabled && config.llmPlanDiscoveryQueries),
          model_default: roleDefaults.plan
        },
        phase3: {
          enabled_default: Boolean(config.llmEnabled && config.llmSerpRerankEnabled),
          model_default: roleDefaults.triage
        },
        model_defaults: roleDefaults,
        token_defaults: roleTokenDefaults,
        fallback_defaults: fallbackDefaults,
        routing_snapshot: llmRoutingSnapshot(config),
        model_options: models,
        token_presets: Array.isArray(config.llmOutputTokenPresets)
          ? config.llmOutputTokenPresets.map((value) => toInt(value, 0)).filter((value) => value > 0)
          : [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192],
        pricing_defaults: resolvePricingForModel(config, ''),
        model_pricing: modelPricing,
        model_token_profiles: modelTokenProfiles,
        knob_defaults: knobDefaults,
        pricing_meta: {
          as_of: String(config.llmPricingAsOf || '').trim() || null,
          sources: config.llmPricingSources && typeof config.llmPricingSources === 'object'
            ? config.llmPricingSources
            : {}
        }
      });
    }

    // Indexing metrics: LLM usage rollup
    if (parts[0] === 'indexing' && parts[1] === 'llm-metrics' && method === 'GET') {
      try {
        const period = String(params.get('period') || 'week').trim() || 'week';
        const model = String(params.get('model') || '').trim();
        const category = String(params.get('category') || '').trim();
        const runLimit = Math.max(10, toInt(params.get('runLimit'), 120));
        const result = await buildLlmMetrics({
          storage,
          config,
          period,
          model,
          category,
          runLimit
        });
        return jsonRes(res, 200, {
          command: 'llm-metrics',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'llm_metrics_failed' });
      }
    }

    // Indexing metrics: domain checklist + manufacturer milestones + yield
    if (parts[0] === 'indexing' && parts[1] === 'domain-checklist' && parts[2] && method === 'GET') {
      try {
        const category = String(parts[2] || '').trim();
        if (!category) return jsonRes(res, 400, { error: 'category_required' });
        const productId = String(params.get('productId') || '').trim();
        const runId = String(params.get('runId') || '').trim();
        const windowMinutes = Math.max(5, toInt(params.get('windowMinutes'), 120));
        const includeUrls = String(params.get('includeUrls') || '').trim().toLowerCase() === 'true';
        const result = await buildIndexingDomainChecklist({
          storage,
          config,
          outputRoot: OUTPUT_ROOT,
          category,
          productId,
          runId,
          windowMinutes,
          includeUrls
        });
        return jsonRes(res, 200, {
          command: 'indexing',
          action: 'domain-checklist',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'indexing_domain_checklist_failed' });
      }
    }

    // Indexing metrics: human review velocity/throughput
    if (parts[0] === 'indexing' && parts[1] === 'review-metrics' && parts[2] && method === 'GET') {
      try {
        const category = String(parts[2] || '').trim();
        const windowHours = Math.max(1, toInt(params.get('windowHours'), 24));
        if (!category) return jsonRes(res, 400, { error: 'category_required' });
        const result = await buildReviewMetrics({
          config,
          category,
          windowHours
        });
        return jsonRes(res, 200, {
          command: 'review',
          action: 'metrics',
          ...result
        });
      } catch (err) {
        return jsonRes(res, 500, { error: err?.message || 'review_metrics_failed' });
      }
    }

    // LLM settings routes (SQLite-backed matrix by category)
    if (parts[0] === 'llm-settings' && parts[1] && parts[2] === 'routes' && method === 'GET') {
      const category = parts[1];
      const scope = (params.get('scope') || '').trim().toLowerCase();
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const rows = specDb.getLlmRouteMatrix(scope || undefined);
      return jsonRes(res, 200, { category, scope: scope || null, rows });
    }

    if (parts[0] === 'llm-settings' && parts[1] && parts[2] === 'routes' && method === 'PUT') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const saved = specDb.saveLlmRouteMatrix(rows);
      emitDataChange({
        broadcastWs,
        event: 'llm-settings-updated',
        category,
      });
      return jsonRes(res, 200, { ok: true, category, rows: saved });
    }

    if (parts[0] === 'llm-settings' && parts[1] && parts[2] === 'routes' && parts[3] === 'reset' && method === 'POST') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 500, { error: 'specdb_unavailable' });
      const rows = specDb.resetLlmRouteMatrixToDefaults();
      emitDataChange({
        broadcastWs,
        event: 'llm-settings-reset',
        category,
      });
      return jsonRes(res, 200, { ok: true, category, rows });
    }

    // GET /api/v1/convergence-settings
    if (parts[0] === 'convergence-settings' && method === 'GET') {
      return jsonRes(res, 200, snapshotConvergenceSettings(config));
    }

    // PUT /api/v1/convergence-settings
    if (parts[0] === 'convergence-settings' && method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const INT_KEYS = new Set([
        'convergenceMaxRounds', 'convergenceNoProgressLimit', 'convergenceMaxLowQualityRounds',
        'convergenceMaxDispatchQueries', 'convergenceMaxTargetFields',
        'needsetEvidenceDecayDays',
        'serpTriageMinScore', 'serpTriageMaxUrls',
        'retrievalMaxHitsPerField', 'retrievalMaxPrimeSources',
        'laneConcurrencySearch', 'laneConcurrencyFetch', 'laneConcurrencyParse', 'laneConcurrencyLlm'
      ]);
      const FLOAT_KEYS = new Set([
        'convergenceLowQualityConfidence', 'needsetEvidenceDecayFloor',
        'needsetCapIdentityLocked', 'needsetCapIdentityProvisional', 'needsetCapIdentityConflict',
        'needsetCapIdentityUnlocked',
        'consensusLlmWeightTier1', 'consensusLlmWeightTier2', 'consensusLlmWeightTier3', 'consensusLlmWeightTier4',
        'consensusTier1Weight', 'consensusTier2Weight', 'consensusTier3Weight', 'consensusTier4Weight'
      ]);
      const BOOL_KEYS = new Set([
        'serpTriageEnabled', 'retrievalIdentityFilterEnabled'
      ]);
      const ALL_KEYS = new Set([...INT_KEYS, ...FLOAT_KEYS, ...BOOL_KEYS]);
      const applied = {};
      const rejected = {};
      for (const [key, value] of Object.entries(body || {})) {
        if (!ALL_KEYS.has(key)) continue;
        if (INT_KEYS.has(key)) {
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(0, n);
          config[key] = clamped;
          applied[key] = clamped;
        } else if (FLOAT_KEYS.has(key)) {
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(0, Math.min(1, n));
          config[key] = clamped;
          applied[key] = clamped;
        } else if (BOOL_KEYS.has(key)) {
          const b = value === true || value === 'true' || value === 1;
          config[key] = b;
          applied[key] = b;
        }
      }
      emitDataChange({
        broadcastWs,
        event: 'convergence-settings-updated',
        meta: { applied },
      });
      const convergenceSnapshot = snapshotConvergenceSettings(config);
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'convergence',
          applied,
        },
      });
      persistSettingsFile('convergence-settings.json', convergenceSnapshot).catch(() => {});
      persistUserSettingsSections({
        helperFilesRoot,
        convergence: convergenceSnapshot,
      }).catch(() => {});
      return jsonRes(res, 200, { ok: true, applied, ...(Object.keys(rejected).length > 0 ? { rejected } : {}) });
    }

    // GET /api/v1/runtime-settings
    if (parts[0] === 'runtime-settings' && method === 'GET') {
      const STRING_MAP = {
        profile: 'runProfile',
        searchProvider: 'searchProvider',
        phase2LlmModel: 'llmModelPlan',
        phase3LlmModel: 'llmModelTriage',
        llmModelFast: 'llmModelFast',
        llmModelReasoning: 'llmModelReasoning',
        llmModelExtract: 'llmModelExtract',
        llmModelValidate: 'llmModelValidate',
        llmModelWrite: 'llmModelWrite',
        llmFallbackPlanModel: 'llmPlanFallbackModel',
        llmFallbackExtractModel: 'llmExtractFallbackModel',
        llmFallbackValidateModel: 'llmValidateFallbackModel',
        llmFallbackWriteModel: 'llmWriteFallbackModel',
        resumeMode: 'indexingResumeMode',
        scannedPdfOcrBackend: 'scannedPdfOcrBackend',
        dynamicFetchPolicyMapJson: 'dynamicFetchPolicyMapJson',
      };
      const INT_MAP = {
        fetchConcurrency: 'concurrency',
        perHostMinDelayMs: 'perHostMinDelayMs',
        llmTokensPlan: 'llmMaxOutputTokensPlan',
        llmTokensTriage: 'llmMaxOutputTokensTriage',
        llmTokensFast: 'llmMaxOutputTokensFast',
        llmTokensReasoning: 'llmMaxOutputTokensReasoning',
        llmTokensExtract: 'llmMaxOutputTokensExtract',
        llmTokensValidate: 'llmMaxOutputTokensValidate',
        llmTokensWrite: 'llmMaxOutputTokensWrite',
        llmTokensPlanFallback: 'llmMaxOutputTokensPlanFallback',
        llmTokensExtractFallback: 'llmMaxOutputTokensExtractFallback',
        llmTokensValidateFallback: 'llmMaxOutputTokensValidateFallback',
        llmTokensWriteFallback: 'llmMaxOutputTokensWriteFallback',
        resumeWindowHours: 'indexingResumeMaxAgeHours',
        reextractAfterHours: 'indexingReextractAfterHours',
        scannedPdfOcrMaxPages: 'scannedPdfOcrMaxPages',
        scannedPdfOcrMaxPairs: 'scannedPdfOcrMaxPairs',
        scannedPdfOcrMinCharsPerPage: 'scannedPdfOcrMinCharsPerPage',
        scannedPdfOcrMinLinesPerPage: 'scannedPdfOcrMinLinesPerPage',
        crawleeRequestHandlerTimeoutSecs: 'crawleeRequestHandlerTimeoutSecs',
        dynamicFetchRetryBudget: 'dynamicFetchRetryBudget',
        dynamicFetchRetryBackoffMs: 'dynamicFetchRetryBackoffMs',
      };
      const FLOAT_MAP = {
        scannedPdfOcrMinConfidence: 'scannedPdfOcrMinConfidence',
      };
      const BOOL_MAP = {
        discoveryEnabled: 'discoveryEnabled',
        phase2LlmEnabled: 'llmPlanDiscoveryQueries',
        phase3LlmTriageEnabled: 'llmSerpRerankEnabled',
        llmFallbackEnabled: 'llmFallbackEnabled',
        reextractIndexed: 'indexingReextractEnabled',
        scannedPdfOcrEnabled: 'scannedPdfOcrEnabled',
        scannedPdfOcrPromoteCandidates: 'scannedPdfOcrPromoteCandidates',
        dynamicCrawleeEnabled: 'dynamicCrawleeEnabled',
        crawleeHeadless: 'crawleeHeadless',
      };
      const settings = {};
      for (const [feKey, cfgKey] of Object.entries(STRING_MAP)) {
        settings[feKey] = String(config[cfgKey] ?? '');
      }
      for (const [feKey, cfgKey] of Object.entries(INT_MAP)) {
        settings[feKey] = toInt(config[cfgKey], 0);
      }
      for (const [feKey, cfgKey] of Object.entries(FLOAT_MAP)) {
        const v = Number.parseFloat(String(config[cfgKey] ?? 0));
        settings[feKey] = Number.isFinite(v) ? v : 0;
      }
      if (typeof config.dynamicFetchPolicyMapJson === 'string') {
        settings.dynamicFetchPolicyMapJson = config.dynamicFetchPolicyMapJson;
      } else if (config.dynamicFetchPolicyMap && typeof config.dynamicFetchPolicyMap === 'object') {
        settings.dynamicFetchPolicyMapJson = JSON.stringify(config.dynamicFetchPolicyMap);
      } else {
        settings.dynamicFetchPolicyMapJson = '';
      }
      for (const [feKey, cfgKey] of Object.entries(BOOL_MAP)) {
        settings[feKey] = Boolean(config[cfgKey]);
      }
      return jsonRes(res, 200, settings);
    }

    // PUT /api/v1/runtime-settings
    if (parts[0] === 'runtime-settings' && method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const STRING_ENUM_MAP = {
        profile: { cfgKey: 'runProfile', allowed: ['fast', 'standard', 'thorough'] },
        resumeMode: { cfgKey: 'indexingResumeMode', allowed: ['auto', 'force_resume', 'start_over'] },
        scannedPdfOcrBackend: { cfgKey: 'scannedPdfOcrBackend', allowed: ['auto', 'tesseract', 'none'] },
        searchProvider: { cfgKey: 'searchProvider', allowed: ['none', 'google', 'bing', 'searxng', 'duckduckgo', 'dual'] },
      };
      const STRING_FREE_MAP = {
        phase2LlmModel: 'llmModelPlan',
        phase3LlmModel: 'llmModelTriage',
        llmModelFast: 'llmModelFast',
        llmModelReasoning: 'llmModelReasoning',
        llmModelExtract: 'llmModelExtract',
        llmModelValidate: 'llmModelValidate',
        llmModelWrite: 'llmModelWrite',
        llmFallbackPlanModel: 'llmPlanFallbackModel',
        llmFallbackExtractModel: 'llmExtractFallbackModel',
        llmFallbackValidateModel: 'llmValidateFallbackModel',
        llmFallbackWriteModel: 'llmWriteFallbackModel',
      };
      const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = 'dynamicFetchPolicyMapJson';
      const INT_RANGE_MAP = {
        fetchConcurrency: { cfgKey: 'concurrency', min: 1, max: 64 },
        perHostMinDelayMs: { cfgKey: 'perHostMinDelayMs', min: 0, max: 120000 },
        llmTokensPlan: { cfgKey: 'llmMaxOutputTokensPlan', min: 128, max: 262144 },
        llmTokensTriage: { cfgKey: 'llmMaxOutputTokensTriage', min: 128, max: 262144 },
        llmTokensFast: { cfgKey: 'llmMaxOutputTokensFast', min: 128, max: 262144 },
        llmTokensReasoning: { cfgKey: 'llmMaxOutputTokensReasoning', min: 128, max: 262144 },
        llmTokensExtract: { cfgKey: 'llmMaxOutputTokensExtract', min: 128, max: 262144 },
        llmTokensValidate: { cfgKey: 'llmMaxOutputTokensValidate', min: 128, max: 262144 },
        llmTokensWrite: { cfgKey: 'llmMaxOutputTokensWrite', min: 128, max: 262144 },
        llmTokensPlanFallback: { cfgKey: 'llmMaxOutputTokensPlanFallback', min: 128, max: 262144 },
        llmTokensExtractFallback: { cfgKey: 'llmMaxOutputTokensExtractFallback', min: 128, max: 262144 },
        llmTokensValidateFallback: { cfgKey: 'llmMaxOutputTokensValidateFallback', min: 128, max: 262144 },
        llmTokensWriteFallback: { cfgKey: 'llmMaxOutputTokensWriteFallback', min: 128, max: 262144 },
        resumeWindowHours: { cfgKey: 'indexingResumeMaxAgeHours', min: 1, max: 8760 },
        reextractAfterHours: { cfgKey: 'indexingReextractAfterHours', min: 1, max: 8760 },
        scannedPdfOcrMaxPages: { cfgKey: 'scannedPdfOcrMaxPages', min: 1, max: 100 },
        scannedPdfOcrMaxPairs: { cfgKey: 'scannedPdfOcrMaxPairs', min: 50, max: 20000 },
        scannedPdfOcrMinCharsPerPage: { cfgKey: 'scannedPdfOcrMinCharsPerPage', min: 1, max: 500 },
        scannedPdfOcrMinLinesPerPage: { cfgKey: 'scannedPdfOcrMinLinesPerPage', min: 1, max: 100 },
        crawleeRequestHandlerTimeoutSecs: { cfgKey: 'crawleeRequestHandlerTimeoutSecs', min: 0, max: 300 },
        dynamicFetchRetryBudget: { cfgKey: 'dynamicFetchRetryBudget', min: 0, max: 5 },
        dynamicFetchRetryBackoffMs: { cfgKey: 'dynamicFetchRetryBackoffMs', min: 0, max: 30000 },
      };
      const FLOAT_RANGE_MAP = {
        scannedPdfOcrMinConfidence: { cfgKey: 'scannedPdfOcrMinConfidence', min: 0, max: 1 },
      };
      const BOOL_MAP = {
        discoveryEnabled: 'discoveryEnabled',
        phase2LlmEnabled: 'llmPlanDiscoveryQueries',
        phase3LlmTriageEnabled: 'llmSerpRerankEnabled',
        llmFallbackEnabled: 'llmFallbackEnabled',
        reextractIndexed: 'indexingReextractEnabled',
        scannedPdfOcrEnabled: 'scannedPdfOcrEnabled',
        scannedPdfOcrPromoteCandidates: 'scannedPdfOcrPromoteCandidates',
        dynamicCrawleeEnabled: 'dynamicCrawleeEnabled',
        crawleeHeadless: 'crawleeHeadless',
      };

      const applied = {};
      const rejected = {};

      for (const [key, value] of Object.entries(body || {})) {
        if (key in STRING_ENUM_MAP) {
          const { cfgKey, allowed } = STRING_ENUM_MAP[key];
          const str = String(value ?? '').trim().toLowerCase();
          if (!allowed.includes(str)) { rejected[key] = 'invalid_enum'; continue; }
          config[cfgKey] = str;
          applied[key] = str;
        } else if (key === DYNAMIC_FETCH_POLICY_MAP_JSON_KEY) {
          const normalized = String(value ?? '').trim();
          if (!normalized) {
            config.dynamicFetchPolicyMapJson = '';
            config.dynamicFetchPolicyMap = {};
            applied[key] = '';
            continue;
          }
          try {
            const parsed = JSON.parse(normalized);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
              rejected[key] = 'invalid_json_object';
              continue;
            }
            config.dynamicFetchPolicyMap = parsed;
            config.dynamicFetchPolicyMapJson = JSON.stringify(parsed);
            applied[key] = config.dynamicFetchPolicyMapJson;
          } catch {
            rejected[key] = 'invalid_json_object';
          }
        } else if (key in STRING_FREE_MAP) {
          const cfgKey = STRING_FREE_MAP[key];
          const str = String(value ?? '').trim();
          config[cfgKey] = str;
          applied[key] = str;
        } else if (key in INT_RANGE_MAP) {
          const { cfgKey, min, max } = INT_RANGE_MAP[key];
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          config[cfgKey] = clamped;
          applied[key] = clamped;
        } else if (key in FLOAT_RANGE_MAP) {
          const { cfgKey, min, max } = FLOAT_RANGE_MAP[key];
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          config[cfgKey] = clamped;
          applied[key] = clamped;
        } else if (key in BOOL_MAP) {
          const cfgKey = BOOL_MAP[key];
          const b = value === true || value === 'true' || value === 1;
          config[cfgKey] = b;
          applied[key] = b;
        }
      }

      emitDataChange({
        broadcastWs,
        event: 'runtime-settings-updated',
        meta: { applied },
      });
      const runtimeSnapshot = snapshotRuntimeSettings(config);
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'runtime',
          applied,
        },
      });
      persistUserSettingsSections({
        helperFilesRoot,
        runtime: runtimeSnapshot,
      }).catch(() => {});
      persistSettingsFile('settings.json', runtimeSnapshot).catch(() => {});
      return jsonRes(res, 200, { ok: true, applied, ...(Object.keys(rejected).length > 0 ? { rejected } : {}) });
    }

    return false;
  };
}
