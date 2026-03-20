// WHY: O(1) Feature Scaling — manifest entries are derived from registry SSOT.
// Adding a new setting = add one entry to settingsRegistry.js. Zero changes here.

import { RUNTIME_SETTINGS_REGISTRY } from '../../../shared/settingsRegistry.js';
import { deriveMiscGroupEntries } from '../../../shared/settingsRegistryDerivations.js';

export const miscGroup = Object.freeze({
  id: "misc",
  title: "Miscellaneous",
  notes: "Legacy/compatibility settings not yet mapped to a dedicated domain.",
  entries: deriveMiscGroupEntries(RUNTIME_SETTINGS_REGISTRY),
});
