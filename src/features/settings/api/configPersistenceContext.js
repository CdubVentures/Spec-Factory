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
