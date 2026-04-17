// WHY: Plan 05 — Runtime settings snapshot transport.
// Replaces the 42-field env-var explosion with one snapshot JSON file per run.
// The GUI sends ALL settings in the POST body → backend writes snapshot →
// child reads snapshot via RUNTIME_SETTINGS_SNAPSHOT env var.

import fs from 'node:fs';
import path from 'node:path';

// WHY: These are run-control fields that should NOT be in the settings snapshot.
// They control what to run (product identity), not how to run (pipeline settings).
const RUN_CONTROL_KEYS = new Set([
  'requestedRunId', 'runId', 'category', 'productId', 'brand', 'model',
  'variant', 'sku', 'mode', 'profile', 'seed', 'fields',
  'providers', 'indexlabOut', 'replaceRunning',
]);

/**
 * Extract settings-only keys from the POST body, excluding run control fields.
 * @param {Object} body — Full POST body from /process/start
 * @returns {Object} Settings-only fields
 */
function extractSettingsFromBody(body) {
  const settings = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!RUN_CONTROL_KEYS.has(key) && value !== undefined) {
      settings[key] = value;
    }
  }
  return settings;
}

/**
 * Write a runtime settings snapshot to disk.
 * @param {string} runId — Run identifier
 * @param {Object} body — Full POST body (run control + settings)
 * @param {string} snapshotsDir — REQUIRED snapshot directory. Callers resolve the
 *   real .workspace/runtime/snapshots at the route boundary; tests pass a tmpdir.
 *   There is no silent default — a previous default leaked test state into the
 *   real runtime snapshots.
 * @returns {string} Absolute path to the written snapshot file
 */
export function writeRuntimeSettingsSnapshot(runId, body, snapshotsDir) {
  if (!snapshotsDir) {
    throw new Error('writeRuntimeSettingsSnapshot requires snapshotsDir');
  }
  const resolvedDir = path.resolve(snapshotsDir);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const snapshot = {
    snapshotId: String(runId || '').trim(),
    schemaVersion: '1.0',
    createdAt: Date.now(),
    source: 'gui',
    settings: extractSettingsFromBody(body),
  };

  const safeRunId = String(runId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
  const filePath = path.join(resolvedDir, `${safeRunId}-settings.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filePath;
}

/**
 * Read a runtime settings snapshot from disk.
 * @param {string} snapshotPath — Absolute path to snapshot file
 * @returns {{ snapshotId: string, schemaVersion: string, createdAt: number, source: string, settings: Object }}
 * @throws {Error} If file missing, unreadable, or invalid
 */
export function readRuntimeSettingsSnapshot(snapshotPath) {
  if (!snapshotPath || typeof snapshotPath !== 'string' || !snapshotPath.trim()) {
    const error = new Error('RUNTIME_SETTINGS_SNAPSHOT path is empty');
    error.code = 'SNAPSHOT_PATH_EMPTY';
    throw error;
  }
  const resolved = path.resolve(snapshotPath.trim());
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    const error = new Error(`Cannot read settings snapshot: ${resolved}`);
    error.code = 'SNAPSHOT_READ_FAILED';
    error.cause = err;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const error = new Error(`Settings snapshot is not valid JSON: ${resolved}`);
    error.code = 'SNAPSHOT_INVALID_JSON';
    error.cause = err;
    throw error;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error('Settings snapshot root must be an object');
    error.code = 'SNAPSHOT_INVALID_SHAPE';
    throw error;
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    const error = new Error('Settings snapshot missing settings object');
    error.code = 'SNAPSHOT_MISSING_SETTINGS';
    throw error;
  }
  return parsed;
}

/**
 * Resolve snapshot path from environment.
 * @param {Object} [env=process.env]
 * @returns {string|null} Snapshot path or null if not present
 */
export function resolveSnapshotPath(env = process.env) {
  const p = String(env?.RUNTIME_SETTINGS_SNAPSHOT || '').trim();
  return p || null;
}
