/**
 * In-memory snapshot + durable JSON storage for globally editable
 * prompt fragments (identity warning, siblings, evidence, confidence,
 * discovery history).
 *
 * WHY: Prompts are sourced synchronously during LLM call assembly —
 * async disk reads on every call would slow every finder. Bootstrap
 * calls loadGlobalPromptsSync() once; writes go through
 * writeGlobalPromptsPatch() which persists to disk and refreshes the
 * in-memory snapshot atomically.
 *
 * Storage: .workspace/global/global-prompts.json — a flat
 * Record<GlobalPromptKey, string>. Empty string or missing key =
 * "use default" (resolveGlobalPrompt handles the fallback).
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultUserSettingsRoot } from '../../config/runtimeArtifactRoots.js';

export const GLOBAL_PROMPTS_FILENAME = 'global-prompts.json';

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

export function loadGlobalPromptsSync({ settingsRoot = null } = {}) {
  const filePath = resolveFilePath({ settingsRoot });
  let raw;
  try {
    raw = fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return setGlobalPromptsSnapshot({});
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return setGlobalPromptsSnapshot({});
  }
  return setGlobalPromptsSnapshot(parsed);
}

export async function writeGlobalPromptsPatch(patch, { settingsRoot = null } = {}) {
  const filePath = resolveFilePath({ settingsRoot });
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let existing = {};
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    existing = normalizeSnapshot(parsed);
  } catch { /* missing or malformed → start fresh */ }

  const merged = { ...existing };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null) delete merged[k];
    else if (typeof v === 'string') merged[k] = v;
  }

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(merged, null, 2)}\n`;
  try {
    await fs.writeFile(tempPath, body, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  setGlobalPromptsSnapshot(merged);
  return merged;
}
