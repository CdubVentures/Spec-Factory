import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyConvergenceSettingsToConfig,
  applyRuntimeSettingsToConfig,
  deriveSettingsArtifactsFromUserSettings,
  persistUserSettingsSections,
  snapshotStorageSettings,
  snapshotUiSettings,
} from '../../settings-authority/index.js';
import {
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
} from '../../../observability/settingsPersistenceCounters.js';

export function createConfigPersistenceContext({
  config,
  settingsRoot,
  canonicalOnlySettingsWrites,
  runDataStorageState,
  initialUserSettings,
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
    applyConvergenceSettingsToConfig(config, sections.convergence || {});
    Object.assign(runDataStorageState, snapshotStorageSettings(sections.storage || {}));
    Object.assign(uiSettingsState, snapshotUiSettings(sections.ui || {}));
  }

  async function persistLegacySettingsFile(filename, snapshot) {
    if (canonicalOnlySettingsWrites) return;
    const dir = path.join(settingsRoot, '_runtime');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, filename),
      JSON.stringify(snapshot, null, 2) + '\n',
      'utf8',
    );
  }

  async function persistCanonicalSections({
    runtime = null,
    convergence = null,
    storage: storageSection = null,
    ui = null,
    studio = null,
  } = {}) {
    const persisted = await persistUserSettingsSections({
      ['helper' + 'FilesRoot']: settingsRoot,
      runtime,
      convergence,
      storage: storageSection,
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
    runDataStorageState,
    persistCanonicalSections,
    persistLegacySettingsFile,
    recordRouteWriteAttempt: recordRouteWriteAttemptWrapper,
    recordRouteWriteOutcome: recordRouteWriteOutcomeWrapper,
  };
}
