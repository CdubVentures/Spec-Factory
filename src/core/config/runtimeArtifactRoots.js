import path from 'node:path';

// WHY: Runtime artifacts live under .workspace/ in the project root.
// This is project-relative, visible, and git-ignored.
export function defaultLocalOutputRoot() {
  return path.resolve('.workspace', 'output');
}

export function defaultIndexLabRoot() {
  return path.resolve('.workspace', 'runs');
}

// WHY: One product.json per product — the rebuild SSOT.
// Created at product add time, grown after runs via writeProductCheckpoint.
export function defaultProductRoot() {
  return path.resolve('.workspace', 'products');
}

// WHY: User settings JSON (boot-time fallback + first-launch seed).
// SQL (app.sqlite) is primary; this file is read before appDb exists.
export function defaultUserSettingsRoot() {
  return path.resolve('.workspace', 'global');
}

// WHY: Per-run settings snapshots written by GUI → read by child processes.
// Capped at 10 files by snapshotCleanup.js.
export function defaultSnapshotRoot() {
  return path.resolve('.workspace', 'runtime', 'snapshots');
}
