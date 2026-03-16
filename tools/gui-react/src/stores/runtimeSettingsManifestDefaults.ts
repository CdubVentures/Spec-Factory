import { SETTINGS_DEFAULTS } from '../../../../src/shared/settingsDefaults.js';

import type { RuntimeSettingDefaults } from './runtimeSettingsManifestTypes';

export const RUNTIME_SETTING_DEFAULTS: RuntimeSettingDefaults = {
  ...(SETTINGS_DEFAULTS.runtime as unknown as RuntimeSettingDefaults),
};
