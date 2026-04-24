import {
  applyRuntimeSettingsToConfig,
  deriveSettingsArtifactsFromUserSettings,
  mergeAndPersistRuntimePatch,
  persistUserSettingsSections,
  snapshotRuntimeSettings,
  snapshotUiSettings,
} from '../../settings-authority/index.js';
import {
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
} from '../../../core/events/settingsPersistenceCounters.js';

function isNonEmptyRegistryJson(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export function createConfigPersistenceContext({
  config,
  initialUserSettings,
  appDb = null,
}) {
  let userSettingsState = initialUserSettings;
  const initialSettingsArtifacts = deriveSettingsArtifactsFromUserSettings(initialUserSettings);
  const uiSettingsState = snapshotUiSettings(initialSettingsArtifacts.sections.ui || {});

  function applyDerivedSettingsArtifacts(artifacts, options = {}) {
    if (!artifacts || typeof artifacts !== 'object') return;
    const sections = artifacts.sections && typeof artifacts.sections === 'object'
      ? artifacts.sections
      : {};
    applyRuntimeSettingsToConfig(config, sections.runtime || {}, options);
    Object.assign(uiSettingsState, snapshotUiSettings(sections.ui || {}));
  }

  // WHY: Reconcile live config with SQL-loaded settings. The boot sequence applies
  // runtime settings up to three times (createBootstrapEnvironment from JSON,
  // createBootstrapSessionLayer from SQL, and here). applyRuntimeSettingsToConfig is
  // idempotent for identical inputs — it overwrites keys and rebuilds derived state.
  // This call is the safety net: if a caller constructs this context without the
  // session-layer apply having run first, config still gets the SQL truth.
  applyDerivedSettingsArtifacts(initialSettingsArtifacts, { mode: 'bootstrap' });

  async function persistCanonicalSections({
    runtime = null,
    ui = null,
    studio = null,
  } = {}) {
    const persisted = await persistUserSettingsSections({
      appDb,
      runtime,
      ui,
      studio,
    });
    userSettingsState = persisted;
    const artifacts = deriveSettingsArtifactsFromUserSettings(persisted);
    applyDerivedSettingsArtifacts(artifacts);
    return artifacts;
  }

  function recordRouteWriteAttemptWrapper(section, target) {
    recordSettingsWriteAttempt({
      sections: [section],
      target,
    });
  }

  function recordRouteWriteOutcomeWrapper(section, target, success, reason = '') {
    recordSettingsWriteOutcome({
      sections: [section],
      target,
      success,
      reason,
    });
  }

  // WHY: Serialize runtime patch writes to prevent two-writer race (SET-001).
  // Each patch acquires the lock, reads current SQL state, merges the patch,
  // validates the merged snapshot, UPSERTs only changed keys, then updates
  // the in-memory canonical state — all inside the critical section.
  let runtimePatchQueue = Promise.resolve();

  async function mergeRuntimePatch(patch, { emptyRegistryGuard = false } = {}) {
    if (!appDb) {
      // WHY: Fallback for test/no-db contexts — delegate to existing full-section
      // persist which handles the JSON-only path.
      const snapshot = { ...snapshotRuntimeSettings(config), ...patch };
      return persistCanonicalSections({ runtime: snapshot });
    }

    const task = async () => {
      let guardedPatch = { ...patch };
      if (
        emptyRegistryGuard
        && guardedPatch.llmProviderRegistryJson === '[]'
      ) {
        const persistedRegistry = userSettingsState?.runtime?.llmProviderRegistryJson;
        if (isNonEmptyRegistryJson(persistedRegistry)) {
          guardedPatch.llmProviderRegistryJson = persistedRegistry;
        } else if (isNonEmptyRegistryJson(config.llmProviderRegistryJson)) {
          guardedPatch.llmProviderRegistryJson = config.llmProviderRegistryJson;
        }
      }

      // WHY: Preserve the default provider registry when SQL still contains a
      // stale empty-array bootstrap row and the incoming patch does not touch it.
      // Secret keys are no longer healed here — SQL is sole authority for secrets.
      const currentState = userSettingsState?.runtime;
      if (currentState && typeof currentState === 'object') {
        if (
          guardedPatch.llmProviderRegistryJson === undefined
          && String(currentState.llmProviderRegistryJson ?? '').trim() === '[]'
          && typeof config.llmProviderRegistryJson === 'string'
          && config.llmProviderRegistryJson.length > 2
        ) {
          guardedPatch.llmProviderRegistryJson = config.llmProviderRegistryJson;
        }
      }

      recordSettingsWriteAttempt({ sections: ['runtime'], target: 'app.sqlite' });

      try {
        const { sanitizedPatch, payload } = await mergeAndPersistRuntimePatch({
          appDb,
          patch: guardedPatch,
          config,
        });

        // WHY: Update canonical state inside the lock so the next queued write
        // sees fresh state. This eliminates SET-002 and SET-007.
        userSettingsState = payload;
        applyRuntimeSettingsToConfig(config, sanitizedPatch);
        Object.assign(uiSettingsState, snapshotUiSettings(
          deriveSettingsArtifactsFromUserSettings(payload).sections.ui || {}
        ));

        recordSettingsWriteOutcome({ sections: ['runtime'], target: 'app.sqlite', success: true });

        return deriveSettingsArtifactsFromUserSettings(payload);
      } catch (err) {
        recordSettingsWriteOutcome({
          sections: ['runtime'],
          target: 'app.sqlite',
          success: false,
          reason: err?.code || err?.message || 'runtime_patch_persist_failed',
        });
        throw err;
      }
    };

    const next = runtimePatchQueue.then(task, task);
    runtimePatchQueue = next.catch(() => {});
    return next;
  }

  return {
    getUserSettingsState() { return userSettingsState; },
    getUiSettingsState() { return uiSettingsState; },
    persistCanonicalSections,
    mergeRuntimePatch,
    recordRouteWriteAttempt: recordRouteWriteAttemptWrapper,
    recordRouteWriteOutcome: recordRouteWriteOutcomeWrapper,
  };
}
