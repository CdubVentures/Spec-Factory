#!/usr/bin/env node
// WHY: One-shot migration — promote per-phase writer sub-keys to the global
// `writer` phase. Idempotent: safe to run multiple times.
//
//   Before: "colorFinder": { "writerModel": "...", "writerUseReasoning": true, ... }
//   After:  "writer": { "baseModel": "...", "useReasoning": true, ... }
//
// Usage: node scripts/migrateWriterPhaseConfig.js [path-to-user-settings.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WRITER_SUBKEYS = ['writerModel', 'writerReasoningModel', 'writerUseReasoning', 'writerThinking', 'writerThinkingEffort'];

const WRITER_SUBKEY_TO_WRITER_FIELD = {
  writerModel: 'baseModel',
  writerReasoningModel: 'reasoningModel',
  writerUseReasoning: 'useReasoning',
  writerThinking: 'thinking',
  writerThinkingEffort: 'thinkingEffort',
};

function isWriterSubKeyPopulated(phase, key) {
  if (!(key in phase)) return false;
  const v = phase[key];
  if (typeof v === 'string') return v.length > 0;
  return v !== undefined && v !== null;
}

function migrateOverrides(overrides) {
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    return { overrides, changed: false };
  }
  if ('writer' in overrides) {
    return { overrides, changed: false };
  }

  let sourcePhase = null;
  let writerEntry = null;
  const conflicts = [];

  for (const [phaseId, phase] of Object.entries(overrides)) {
    if (typeof phase !== 'object' || phase === null) continue;
    const hasWriterKeys = WRITER_SUBKEYS.some((k) => isWriterSubKeyPopulated(phase, k));
    if (!hasWriterKeys) continue;

    if (writerEntry) {
      conflicts.push(phaseId);
      continue;
    }
    sourcePhase = phaseId;
    writerEntry = {};
    for (const subKey of WRITER_SUBKEYS) {
      if (isWriterSubKeyPopulated(phase, subKey)) {
        writerEntry[WRITER_SUBKEY_TO_WRITER_FIELD[subKey]] = phase[subKey];
      }
    }
  }

  const nextOverrides = { ...overrides };
  let changed = false;

  for (const [phaseId, phase] of Object.entries(nextOverrides)) {
    if (typeof phase !== 'object' || phase === null) continue;
    const stripped = { ...phase };
    let strippedAny = false;
    for (const subKey of WRITER_SUBKEYS) {
      if (subKey in stripped) {
        delete stripped[subKey];
        strippedAny = true;
      }
    }
    if (strippedAny) {
      nextOverrides[phaseId] = stripped;
      changed = true;
    }
  }

  if (writerEntry) {
    nextOverrides.writer = writerEntry;
    changed = true;
    console.log(`[migrate] lifted writer config from "${sourcePhase}" → global writer phase`);
    if (conflicts.length > 0) {
      console.warn(`[migrate] WARNING: additional phases with writer sub-keys ignored: ${conflicts.join(', ')}`);
      console.warn('[migrate] Only the first non-empty source was kept. Review manually if needed.');
    }
  }

  return { overrides: nextOverrides, changed };
}

function main() {
  const argPath = process.argv[2];
  const settingsPath = resolve(argPath || '.workspace/global/user-settings.json');

  const raw = readFileSync(settingsPath, 'utf8');
  const settings = JSON.parse(raw);

  const phaseOverridesJson = settings?.runtime?.llmPhaseOverridesJson;
  if (typeof phaseOverridesJson !== 'string' || !phaseOverridesJson.trim()) {
    console.log('[migrate] No llmPhaseOverridesJson found — nothing to migrate.');
    return;
  }

  let overrides;
  try {
    overrides = JSON.parse(phaseOverridesJson);
  } catch (err) {
    console.error('[migrate] Failed to parse llmPhaseOverridesJson:', err.message);
    process.exit(1);
  }

  const { overrides: next, changed } = migrateOverrides(overrides);
  if (!changed) {
    console.log('[migrate] Already migrated — no changes.');
    return;
  }

  settings.runtime.llmPhaseOverridesJson = JSON.stringify(next);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  console.log(`[migrate] Wrote migrated settings to ${settingsPath}`);
}

main();
