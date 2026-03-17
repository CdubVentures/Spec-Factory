// Assembly module — imports all group files, exports the public API.
// No business logic. No entries defined here.

import { coreGroup } from './coreGroup.js';
import { cachingGroup } from './cachingGroup.js';
import { storageGroup } from './storageGroup.js';
import { securityGroup } from './securityGroup.js';
import { llmGroup } from './llmGroup.js';
import { discoveryGroup } from './discoveryGroup.js';
import { runtimeGroup } from './runtimeGroup.js';
import { observabilityGroup } from './observabilityGroup.js';
import { pathsGroup } from './pathsGroup.js';
import { miscGroup } from './miscGroup.js';

export const CONFIG_MANIFEST_VERSION = 1;

export const CONFIG_MANIFEST = Object.freeze([
  coreGroup,
  cachingGroup,
  storageGroup,
  securityGroup,
  llmGroup,
  discoveryGroup,
  runtimeGroup,
  observabilityGroup,
  pathsGroup,
  miscGroup,
]);

export const CONFIG_MANIFEST_KEYS = Object.freeze(
  CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => entry.key))
);

export const CONFIG_MANIFEST_DEFAULTS = Object.freeze(
  Object.fromEntries(
    CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => [entry.key, entry.defaultValue]))
  )
);
