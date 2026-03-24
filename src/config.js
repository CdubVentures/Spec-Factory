// WHY: Facade — all config logic lives in src/core/config/ modules.
// Consumers import { loadConfig, validateConfig, loadDotEnvFile } from this file.

import { loadConfig as _loadConfig } from './core/config/configOrchestrator.js';
import {
  applyRuntimeSettingsToConfig,
  applyConvergenceSettingsToConfig,
  loadUserSettingsSync,
} from './features/settings-authority/userSettingsService.js';
import {
  resolveSnapshotPath,
  readRuntimeSettingsSnapshot,
} from './core/config/runtimeSettingsSnapshot.js';
import { applySnapshotToConfig } from './core/config/resolveEffectiveRuntimeConfig.js';

export { _loadConfig as loadConfig };
export { validateConfig } from './core/config/configValidator.js';
export { loadDotEnvFile } from './core/config/dotEnvLoader.js';

/**
 * Load config AND apply persisted user settings from user-settings.json.
 * WHY: loadConfig() only reads env vars + registry defaults. GUI-persisted
 * settings (LLM phase overrides, search engines, budgets, etc.) live in
 * user-settings.json and must be merged separately. Every CLI entry point
 * and child process spawned from the GUI must call this instead of loadConfig
 * to respect user-configured settings.
 *
 * Plan 06: When RUNTIME_SETTINGS_SNAPSHOT env var is present (GUI-launched runs),
 * the snapshot is the source of truth — not user-settings.json. This eliminates
 * the stale-start race where autosave hadn't flushed before the child spawned.
 * CLI usage (no snapshot) falls back to the original user-settings.json path.
 */
export function loadConfigWithUserSettings(overrides = {}) {
  const config = _loadConfig(overrides);

  // Plan 06: Snapshot-first path — GUI-launched runs send a complete snapshot
  const snapshotPath = resolveSnapshotPath();
  if (snapshotPath) {
    try {
      const snapshot = readRuntimeSettingsSnapshot(snapshotPath);
      // WHY: Use the alias-aware resolver to overlay snapshot settings onto config.
      // Snapshot values win for all keys because they represent the exact editor state
      // at the moment the user clicked Start. applySnapshotToConfig maps setting keys
      // (e.g. setting keys to config keys) so runtime consumers read the correct values.
      applySnapshotToConfig(config, snapshot.settings || {});
      // WHY: applyRuntimeSettingsToConfig handles dual-key sync + phase override
      // re-resolution. We call it with the snapshot settings to ensure _resolved*
      // phase fields are computed correctly.
      applyRuntimeSettingsToConfig(config, snapshot.settings || {});
      return config;
    } catch (err) {
      // WHY: If snapshot read fails, fall through to user-settings.json path.
      // This makes the snapshot transport additive — it can't make things worse.
      console.error('Failed to load runtime settings snapshot, falling back to user-settings.json:', err?.message || err);
    }
  }

  // Fallback: CLI usage or snapshot read failure
  const helperRoot = String(
    config.categoryAuthorityRoot || 'category_authority'
  ).trim();
  try {
    const userSettings = loadUserSettingsSync({ categoryAuthorityRoot: helperRoot });
    applyRuntimeSettingsToConfig(config, userSettings.runtime);
    applyConvergenceSettingsToConfig(config, userSettings.convergence);
  } catch { /* best-effort — CLI may run without persisted settings */ }
  return config;
}
