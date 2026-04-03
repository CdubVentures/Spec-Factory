import {
  applyRuntimeSettingsToConfig,
  deriveSettingsArtifactsFromUserSettings,
  persistUserSettingsSections,
  snapshotUiSettings,
} from '../../settings-authority/index.js';
import {
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
} from '../../../observability/settingsPersistenceCounters.js';

export function createConfigPersistenceContext({
  config,
  initialUserSettings,
  appDb = null,
}) {
  let userSettingsState = initialUserSettings;
  const initialSettingsArtifacts = deriveSettingsArtifactsFromUserSettings(initialUserSettings);
  const uiSettingsState = snapshotUiSettings(initialSettingsArtifacts.sections.ui || {});

  function applyDerivedSettingsArtifacts(artifacts) {
    if (!artifacts || typeof artifacts !== 'object') return;
    const sections = artifacts.sections && typeof artifacts.sections === 'object'
      ? artifacts.sections
      : {};
    applyRuntimeSettingsToConfig(config, sections.runtime || {});
    Object.assign(uiSettingsState, snapshotUiSettings(sections.ui || {}));
  }

  // WHY: Reconcile live config with SQL-loaded settings. The boot sequence applies
  // runtime settings up to three times (createBootstrapEnvironment from JSON,
  // createBootstrapSessionLayer from SQL, and here). applyRuntimeSettingsToConfig is
  // idempotent for identical inputs — it overwrites keys and rebuilds derived state.
  // This call is the safety net: if a caller constructs this context without the
  // session-layer apply having run first, config still gets the SQL truth.
  applyDerivedSettingsArtifacts(initialSettingsArtifacts);

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

  return {
    getUserSettingsState() { return userSettingsState; },
    getUiSettingsState() { return uiSettingsState; },
    persistCanonicalSections,
    recordRouteWriteAttempt: recordRouteWriteAttemptWrapper,
    recordRouteWriteOutcome: recordRouteWriteOutcomeWrapper,
  };
}
