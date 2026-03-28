// WHY: Manifest is 100% derived from registry SSOT. Zero hardcoded entries.
// Adding a new env var = add ONE entry to settingsRegistry.js with a `group` field.

import { RUNTIME_SETTINGS_REGISTRY, BOOTSTRAP_ENV_REGISTRY } from '../../../shared/settingsRegistry.js';
import { deriveManifestGroups } from '../../../shared/settingsRegistryDerivations.js';
import { defaultLocalOutputRoot } from '../runtimeArtifactRoots.js';

const MANIFEST_GROUPS = Object.freeze([
  { id: 'core', title: 'Core Application Settings', notes: 'Boot/runtime environment and top-level API binding.' },
  { id: 'caching', title: 'Caching and Data Layer', notes: 'External cache knobs; currently reserved for future non-SQLite cache integration.' },
  { id: 'storage', title: 'Storage and Cloud Infrastructure', notes: 'S3/AWS and run-data storage settings.' },
  { id: 'security', title: 'Security and Auth', notes: 'Authentication and trust-boundary controls.' },
  { id: 'llm', title: 'LLM and Model Routing', notes: 'Provider endpoints, keys, model ladders, pricing, and fallback policies.' },
  { id: 'discovery', title: 'Discovery and Search Providers', notes: 'Internet search endpoints and provider selection defaults.' },
  { id: 'runtime', title: 'Runtime Pipeline and Fetching', notes: 'Execution behavior, parsing, OCR, browser automation, and screenshot controls.' },
  { id: 'observability', title: 'Observability and Operations', notes: 'Telemetry persistence, daemon behavior, and operational traces.' },
  { id: 'paths', title: 'Filesystem and Local Paths', notes: 'Local directories and path roots for runtime artifacts.' },
  { id: 'misc', title: 'Miscellaneous', notes: 'Legacy/compatibility settings not yet mapped to a dedicated domain.' },
]);

export const CONFIG_MANIFEST_VERSION = 1;

// WHY: LOCAL_OUTPUT_ROOT default is platform-specific (computed at import time).
// Registry stores "" as the static default; we override here for the manifest.
const COMPUTED_DEFAULTS = Object.freeze({ LOCAL_OUTPUT_ROOT: defaultLocalOutputRoot() });

const allEntries = [...RUNTIME_SETTINGS_REGISTRY, ...BOOTSTRAP_ENV_REGISTRY];
export const CONFIG_MANIFEST = deriveManifestGroups(allEntries, MANIFEST_GROUPS, COMPUTED_DEFAULTS);

export const CONFIG_MANIFEST_KEYS = Object.freeze(
  CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => entry.key))
);

export const CONFIG_MANIFEST_DEFAULTS = Object.freeze(
  Object.fromEntries(
    CONFIG_MANIFEST.flatMap((section) => section.entries.map((entry) => [entry.key, entry.defaultValue]))
  )
);
