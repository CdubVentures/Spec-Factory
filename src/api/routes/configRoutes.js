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
  applyConvergenceSettingsToConfig,
  applyRuntimeSettingsToConfig,
  deriveSettingsArtifactsFromUserSettings,
  loadUserSettingsSync,
  persistUserSettingsSections,
  snapshotConvergenceSettings,
  snapshotRuntimeSettings,
  snapshotStorageSettings,
  snapshotUiSettings,
} from '../services/userSettingsService.js';
import {
  CONVERGENCE_SETTINGS_ROUTE_PUT,
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
} from '../services/settingsContract.js';
import {
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
} from '../../observability/settingsPersistenceCounters.js';

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
  const canonicalOnlySettingsWrites = (
    (typeof config?.settingsCanonicalOnlyWrites === 'boolean')
      ? config.settingsCanonicalOnlyWrites
      : (() => {
          const raw = process.env.SETTINGS_CANONICAL_ONLY_WRITES;
          if (raw === undefined || raw === null || raw === '') return false;
          const token = String(raw).trim().toLowerCase();
          if (['1', 'true', 'yes', 'on'].includes(token)) return true;
          if (['0', 'false', 'no', 'off'].includes(token)) return false;
          return false;
        })()
  );
  const initialUserSettings = loadUserSettingsSync({ helperFilesRoot });
  const initialSettingsArtifacts = deriveSettingsArtifactsFromUserSettings(initialUserSettings);
  const uiSettingsState = snapshotUiSettings(initialSettingsArtifacts.sections.ui || {});

  async function persistLegacySettingsFile(filename, snapshot) {
    if (canonicalOnlySettingsWrites) return;
    const dir = path.join(helperFilesRoot, '_runtime');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, filename),
      JSON.stringify(snapshot, null, 2) + '\n',
      'utf8',
    );
  }

  function applyDerivedSettingsArtifacts(artifacts) {
    if (!artifacts || typeof artifacts !== 'object') return;
    const sections = artifacts.sections && typeof artifacts.sections === 'object'
      ? artifacts.sections
      : {};
    applyRuntimeSettingsToConfig(config, sections.runtime || {});
    applyConvergenceSettingsToConfig(config, sections.convergence || {});
    Object.assign(runDataStorageState, snapshotStorageSettings(sections.storage || {}));
    Object.assign(uiSettingsState, snapshotUiSettings(sections.ui || {}));
  }

  async function persistCanonicalSections({
    runtime = null,
    convergence = null,
    storage: storageSection = null,
    ui = null,
    studio = null,
  } = {}) {
    const persisted = await persistUserSettingsSections({
      helperFilesRoot,
      runtime,
      convergence,
      storage: storageSection,
      ui,
      studio,
    });
    const artifacts = deriveSettingsArtifactsFromUserSettings(persisted);
    applyDerivedSettingsArtifacts(artifacts);
    return artifacts;
  }

  function recordRouteWriteAttempt(section, target) {
    recordSettingsWriteAttempt({
      sections: [section],
      target,
    });
  }

  function recordRouteWriteOutcome(section, target, success, reason = '') {
    recordSettingsWriteOutcome({
      sections: [section],
      target,
      success,
      reason,
    });
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
      const nextUiSettings = {
        ...snapshotUiSettings(uiSettingsState),
      };
      const appliedKeys = [];
      for (const [key, value] of Object.entries(body || {})) {
        if (!KEY_SET.has(key)) continue;
        const enabled = value === true || value === 'true' || value === 1;
        nextUiSettings[key] = enabled;
        appliedKeys.push(key);
      }
      const snapshot = snapshotUiSettings(nextUiSettings);
      recordRouteWriteAttempt('ui', 'ui-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistCanonicalSections({
          ui: snapshot,
        });
        recordRouteWriteOutcome('ui', 'ui-settings-route', true);
      } catch {
        recordRouteWriteOutcome('ui', 'ui-settings-route', false, 'ui_settings_persist_failed');
        return jsonRes(res, 500, { error: 'ui_settings_persist_failed' });
      }
      const persistedUiSnapshot = snapshotUiSettings(persistedArtifacts?.sections?.ui || {});
      const appliedSnapshot = {};
      for (const key of appliedKeys) {
        if (!Object.prototype.hasOwnProperty.call(persistedUiSnapshot, key)) continue;
        appliedSnapshot[key] = persistedUiSnapshot[key];
      }
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'ui',
          applied: appliedSnapshot,
        },
      });
      return jsonRes(res, 200, { ok: true, ...persistedUiSnapshot, applied: appliedSnapshot });
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
      const currentStorageSnapshot = snapshotStorageSettings(runDataStorageState);
      const normalized = normalizeRunDataStorageSettings(body, currentStorageSnapshot);
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
      const storageSnapshot = snapshotStorageSettings({
        ...currentStorageSnapshot,
        ...normalized,
        updatedAt: new Date().toISOString(),
      });
      recordRouteWriteAttempt('storage', 'storage-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistCanonicalSections({
          storage: storageSnapshot,
        });
        await persistLegacySettingsFile(
          'storage-settings.json',
          persistedArtifacts.legacy.storage,
        );
        recordRouteWriteOutcome('storage', 'storage-settings-route', true);
      } catch {
        recordRouteWriteOutcome('storage', 'storage-settings-route', false, 'storage_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'storage_settings_persist_failed' });
      }
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
      return jsonRes(res, 200, {
        ok: true,
        ...sanitizeRunDataStorageSettingsForResponse(runDataStorageState),
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
      const INT_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys);
      const FLOAT_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys);
      const BOOL_KEYS = new Set(CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys);
      const ALL_KEYS = new Set([...INT_KEYS, ...FLOAT_KEYS, ...BOOL_KEYS]);
      const nextConvergenceSnapshot = {
        ...snapshotConvergenceSettings(config),
      };
      const applied = {};
      const rejected = {};
      for (const [key, value] of Object.entries(body || {})) {
        if (!ALL_KEYS.has(key)) continue;
        if (INT_KEYS.has(key)) {
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(0, n);
          nextConvergenceSnapshot[key] = clamped;
          applied[key] = clamped;
        } else if (FLOAT_KEYS.has(key)) {
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(0, Math.min(1, n));
          nextConvergenceSnapshot[key] = clamped;
          applied[key] = clamped;
        } else if (BOOL_KEYS.has(key)) {
          const b = value === true || value === 'true' || value === 1;
          nextConvergenceSnapshot[key] = b;
          applied[key] = b;
        }
      }
      recordRouteWriteAttempt('convergence', 'convergence-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistCanonicalSections({
          convergence: nextConvergenceSnapshot,
        });
        await persistLegacySettingsFile(
          'convergence-settings.json',
          persistedArtifacts.legacy.convergence,
        );
        recordRouteWriteOutcome('convergence', 'convergence-settings-route', true);
      } catch {
        recordRouteWriteOutcome('convergence', 'convergence-settings-route', false, 'convergence_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'convergence_settings_persist_failed' });
      }
      emitDataChange({
        broadcastWs,
        event: 'convergence-settings-updated',
        meta: { applied },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'convergence',
          applied,
        },
      });
      return jsonRes(res, 200, { ok: true, applied, ...(Object.keys(rejected).length > 0 ? { rejected } : {}) });
    }

    // GET /api/v1/runtime-settings
    if (parts[0] === 'runtime-settings' && method === 'GET') {
      const STRING_MAP = RUNTIME_SETTINGS_ROUTE_GET.stringMap;
      const INT_MAP = RUNTIME_SETTINGS_ROUTE_GET.intMap;
      const FLOAT_MAP = RUNTIME_SETTINGS_ROUTE_GET.floatMap;
      const BOOL_MAP = RUNTIME_SETTINGS_ROUTE_GET.boolMap;
      const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey;
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
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = config.dynamicFetchPolicyMapJson;
      } else if (config.dynamicFetchPolicyMap && typeof config.dynamicFetchPolicyMap === 'object') {
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = JSON.stringify(config.dynamicFetchPolicyMap);
      } else {
        settings[DYNAMIC_FETCH_POLICY_MAP_JSON_KEY] = '';
      }
      for (const [feKey, cfgKey] of Object.entries(BOOL_MAP)) {
        settings[feKey] = Boolean(config[cfgKey]);
      }
      return jsonRes(res, 200, settings);
    }

    // PUT /api/v1/runtime-settings
    if (parts[0] === 'runtime-settings' && method === 'PUT') {
      const body = await readJsonBody(req).catch(() => ({}));
      const STRING_ENUM_MAP = RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap;
      const STRING_FREE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap;
      const DYNAMIC_FETCH_POLICY_MAP_JSON_KEY = RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey;
      const INT_RANGE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap;
      const FLOAT_RANGE_MAP = RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap;
      const BOOL_MAP = RUNTIME_SETTINGS_ROUTE_PUT.boolMap;
      const nextRuntimeSnapshot = {
        ...snapshotRuntimeSettings(config),
      };

      const applied = {};
      const rejected = {};

      for (const [key, value] of Object.entries(body || {})) {
        if (key in STRING_ENUM_MAP) {
          const { cfgKey, allowed } = STRING_ENUM_MAP[key];
          const str = String(value ?? '').trim().toLowerCase();
          if (!allowed.includes(str)) { rejected[key] = 'invalid_enum'; continue; }
          nextRuntimeSnapshot[cfgKey] = str;
          applied[key] = str;
        } else if (key === DYNAMIC_FETCH_POLICY_MAP_JSON_KEY) {
          const normalized = String(value ?? '').trim();
          if (!normalized) {
            nextRuntimeSnapshot.dynamicFetchPolicyMapJson = '';
            nextRuntimeSnapshot.dynamicFetchPolicyMap = {};
            applied[key] = '';
            continue;
          }
          try {
            const parsed = JSON.parse(normalized);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
              rejected[key] = 'invalid_json_object';
              continue;
            }
            nextRuntimeSnapshot.dynamicFetchPolicyMap = parsed;
            nextRuntimeSnapshot.dynamicFetchPolicyMapJson = JSON.stringify(parsed);
            applied[key] = nextRuntimeSnapshot.dynamicFetchPolicyMapJson;
          } catch {
            rejected[key] = 'invalid_json_object';
          }
        } else if (key in STRING_FREE_MAP) {
          const cfgKey = STRING_FREE_MAP[key];
          const str = String(value ?? '').trim();
          nextRuntimeSnapshot[cfgKey] = str;
          applied[key] = str;
        } else if (key in INT_RANGE_MAP) {
          const { cfgKey, min, max } = INT_RANGE_MAP[key];
          const n = Number.parseInt(String(value ?? ''), 10);
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_integer'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          nextRuntimeSnapshot[cfgKey] = clamped;
          applied[key] = clamped;
        } else if (key in FLOAT_RANGE_MAP) {
          const { cfgKey, min, max } = FLOAT_RANGE_MAP[key];
          const n = Number.parseFloat(String(value ?? ''));
          if (!Number.isFinite(n)) { rejected[key] = 'invalid_float'; continue; }
          const clamped = Math.max(min, Math.min(max, n));
          nextRuntimeSnapshot[cfgKey] = clamped;
          applied[key] = clamped;
        } else if (key in BOOL_MAP) {
          const cfgKey = BOOL_MAP[key];
          const b = value === true || value === 'true' || value === 1;
          nextRuntimeSnapshot[cfgKey] = b;
          applied[key] = b;
        }
      }

      recordRouteWriteAttempt('runtime', 'runtime-settings-route');
      let persistedArtifacts = null;
      try {
        persistedArtifacts = await persistCanonicalSections({
          runtime: nextRuntimeSnapshot,
        });
        await persistLegacySettingsFile('settings.json', persistedArtifacts.legacy.runtime);
        recordRouteWriteOutcome('runtime', 'runtime-settings-route', true);
      } catch {
        recordRouteWriteOutcome('runtime', 'runtime-settings-route', false, 'runtime_settings_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'runtime_settings_persist_failed' });
      }
      emitDataChange({
        broadcastWs,
        event: 'runtime-settings-updated',
        meta: { applied },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: {
          section: 'runtime',
          applied,
        },
      });
      return jsonRes(res, 200, { ok: true, applied, ...(Object.keys(rejected).length > 0 ? { rejected } : {}) });
    }

    return false;
  };
}
