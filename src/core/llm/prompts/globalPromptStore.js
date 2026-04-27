/**
 * In-memory snapshot + appDb runtime storage for globally editable
 * prompt fragments.
 *
 * WHY: prompt assembly is synchronous. Bootstrap loads SQL into this
 * snapshot after appDb opens; before appDb exists, JSON is allowed as the
 * first-boot fallback. Writes use SQL first, then mirror JSON for rebuild.
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultUserSettingsRoot } from '../../config/runtimeArtifactRoots.js';

export const GLOBAL_PROMPTS_FILENAME = 'global-prompts.json';
export const GLOBAL_PROMPTS_SETTINGS_SECTION = 'global-prompts';

let snapshot = Object.freeze({});

function normalizeSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function getGlobalPrompts() {
  return snapshot;
}

export function setGlobalPromptsSnapshot(value) {
  snapshot = Object.freeze({ ...normalizeSnapshot(value) });
  return snapshot;
}

function resolveFilePath({ settingsRoot = null } = {}) {
  const root = settingsRoot || defaultUserSettingsRoot();
  return path.join(root, GLOBAL_PROMPTS_FILENAME);
}

function readGlobalPromptsJsonSync({ settingsRoot = null } = {}) {
  const filePath = resolveFilePath({ settingsRoot });
  try {
    const raw = fsSync.readFileSync(filePath, 'utf8');
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function readGlobalPromptsJson({ settingsRoot = null } = {}) {
  const filePath = resolveFilePath({ settingsRoot });
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readGlobalPromptsFromAppDb(appDb) {
  const rows = appDb.getSection(GLOBAL_PROMPTS_SETTINGS_SECTION);
  const out = {};
  for (const row of rows) {
    if (typeof row?.key !== 'string') continue;
    if (typeof row.value !== 'string') continue;
    out[row.key] = row.value;
  }
  return out;
}

function replaceGlobalPromptsInAppDb(appDb, values) {
  const write = () => {
    appDb.deleteSection(GLOBAL_PROMPTS_SETTINGS_SECTION);
    for (const [key, value] of Object.entries(values)) {
      appDb.upsertSetting({
        section: GLOBAL_PROMPTS_SETTINGS_SECTION,
        key,
        value,
        type: 'string',
      });
    }
  };

  if (appDb?.db?.transaction) {
    appDb.db.transaction(write)();
    return;
  }
  write();
}

function applyPatch(existing, patch) {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null) delete merged[k];
    else if (typeof v === 'string') merged[k] = v;
  }
  return merged;
}

async function writeGlobalPromptsJson(merged, { settingsRoot = null } = {}) {
  const filePath = resolveFilePath({ settingsRoot });
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(merged, null, 2)}\n`;
  try {
    await fs.writeFile(tempPath, body, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function loadGlobalPromptsSync({ settingsRoot = null, appDb = null } = {}) {
  if (appDb) {
    const sqlSnapshot = readGlobalPromptsFromAppDb(appDb);
    if (Object.keys(sqlSnapshot).length > 0) {
      return setGlobalPromptsSnapshot(sqlSnapshot);
    }

    const rebuilt = readGlobalPromptsJsonSync({ settingsRoot });
    if (Object.keys(rebuilt).length > 0) {
      replaceGlobalPromptsInAppDb(appDb, rebuilt);
    }
    return setGlobalPromptsSnapshot(rebuilt);
  }

  return setGlobalPromptsSnapshot(readGlobalPromptsJsonSync({ settingsRoot }));
}

export async function writeGlobalPromptsPatch(patch, { settingsRoot = null, appDb = null } = {}) {
  if (appDb) {
    const sqlSnapshot = readGlobalPromptsFromAppDb(appDb);
    const existing = Object.keys(sqlSnapshot).length > 0
      ? sqlSnapshot
      : await readGlobalPromptsJson({ settingsRoot });
    const merged = applyPatch(existing, patch);
    replaceGlobalPromptsInAppDb(appDb, merged);
    await writeGlobalPromptsJson(merged, { settingsRoot });
    setGlobalPromptsSnapshot(merged);
    return merged;
  }

  const existing = await readGlobalPromptsJson({ settingsRoot });
  const merged = applyPatch(existing, patch);
  await writeGlobalPromptsJson(merged, { settingsRoot });
  setGlobalPromptsSnapshot(merged);
  return merged;
}
