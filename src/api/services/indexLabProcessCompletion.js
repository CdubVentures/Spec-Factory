import fs from 'node:fs/promises';
import path from 'node:path';
import { emitDataChange } from '../events/dataChangeContract.js';
import {
  shouldRelocateRunData,
  relocateRunDataForCompletedRun,
} from './runDataRelocationService.js';

function parseCliArg(cliArgs, argName) {
  if (!Array.isArray(cliArgs) || !argName) return '';
  const index = cliArgs.findIndex((value) => String(value || '').trim() === argName);
  if (index < 0 || !cliArgs[index + 1]) return '';
  return String(cliArgs[index + 1]).trim();
}

function isIndexLabCommand(cliArgs) {
  if (!Array.isArray(cliArgs) || cliArgs.length === 0) return false;
  return String(cliArgs[0] || '').trim() === 'indexlab';
}

function scoreRunMeta(row = {}, { category = '', productId = '', startedAt = '' } = {}) {
  let score = 0;
  if (category && String(row.category || '').trim() === category) score += 3;
  if (productId && String(row.product_id || row.productId || '').trim() === productId) score += 5;

  const startedTargetMs = Date.parse(String(startedAt || ''));
  const startedRowMs = Date.parse(String(row.started_at || ''));
  if (Number.isFinite(startedTargetMs) && Number.isFinite(startedRowMs)) {
    const diffMs = Math.abs(startedTargetMs - startedRowMs);
    if (diffMs <= 30_000) score += 5;
    else if (diffMs <= 5 * 60_000) score += 3;
    else if (diffMs <= 30 * 60_000) score += 1;
  }

  const endedRowMs = Date.parse(String(row.ended_at || ''));
  if (Number.isFinite(endedRowMs)) score += 1;
  return score;
}

async function resolveCompletedRunMeta({
  indexLabRoot,
  cliArgs,
  startedAt,
} = {}) {
  const rootDir = path.resolve(String(indexLabRoot || 'artifacts/indexlab'));
  let entries = [];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const category = parseCliArg(cliArgs, '--category');
  const productId = parseCliArg(cliArgs, '--product-id');
  const rows = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runMetaPath = path.join(rootDir, entry.name, 'run.json');
    try {
      const text = await fs.readFile(runMetaPath, 'utf8');
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') continue;
      rows.push(parsed);
    } catch {
      continue;
    }
  }

  if (rows.length === 0) return null;

  const sorted = rows.sort((a, b) => {
    const scoreA = scoreRunMeta(a, { category, productId, startedAt });
    const scoreB = scoreRunMeta(b, { category, productId, startedAt });
    if (scoreA !== scoreB) return scoreB - scoreA;
    const endedA = Date.parse(String(a.ended_at || ''));
    const endedB = Date.parse(String(b.ended_at || ''));
    if (Number.isFinite(endedA) || Number.isFinite(endedB)) {
      return (Number.isFinite(endedB) ? endedB : 0) - (Number.isFinite(endedA) ? endedA : 0);
    }
    return String(b.run_id || '').localeCompare(String(a.run_id || ''));
  });

  return sorted[0] || null;
}

export async function handleIndexLabProcessCompletion({
  exitCode,
  cliArgs,
  startedAt = '',
  runDataStorageSettings = {},
  indexLabRoot = 'artifacts/indexlab',
  outputRoot = 'out',
  outputPrefix = 'specs/outputs',
  broadcastWs,
  logError = console.error,
} = {}) {
  if (!isIndexLabCommand(cliArgs)) return null;
  if (!shouldRelocateRunData(runDataStorageSettings)) return null;

  const customOutRoot = parseCliArg(cliArgs, '--out');
  const effectiveIndexLabRoot = customOutRoot || indexLabRoot;
  const runMeta = await resolveCompletedRunMeta({
    indexLabRoot: effectiveIndexLabRoot,
    cliArgs,
    startedAt,
  });
  if (!runMeta) {
    return {
      ok: false,
      skipped: 'run_meta_not_found',
    };
  }

  const category = String(runMeta.category || '').trim().toLowerCase();
  const runId = String(runMeta.run_id || '');
  const configuredDestinationType = String(runDataStorageSettings?.destinationType || '')
    .trim()
    .toLowerCase();
  const relocationTarget = configuredDestinationType === 's3' || configuredDestinationType === 'local'
    ? configuredDestinationType
    : 'unknown';

  emitDataChange({
    broadcastWs,
    event: 'indexlab-run-data-relocation-started',
    category,
    meta: {
      run_id: runId,
      destination_type: relocationTarget,
    },
  });
  broadcastWs?.('process', [
    `[storage] relocating run ${runId} (${relocationTarget})`,
  ]);

  try {
    const relocation = await relocateRunDataForCompletedRun({
      settings: runDataStorageSettings,
      runMeta,
      outputRoot,
      outputPrefix,
      indexLabRoot: effectiveIndexLabRoot,
    });

    emitDataChange({
      broadcastWs,
      event: 'indexlab-run-data-relocated',
      category,
      meta: {
        run_id: runId,
        destination_type: relocation.destination_type || 'unknown',
      },
    });
    broadcastWs?.('process', [
      `[storage] relocated run ${runId} (${relocation.destination_type || 'unknown'})`,
    ]);
    return relocation;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'run_data_relocation_failed');
    emitDataChange({
      broadcastWs,
      event: 'indexlab-run-data-relocation-failed',
      category,
      meta: {
        run_id: runId,
        message,
      },
    });
    broadcastWs?.('process', [
      `[storage] relocation failed for ${runId}: ${message}`,
    ]);
    logError?.('[indexlab-relocation] failed', error);
    return {
      ok: false,
      error: message,
      run_id: runId,
    };
  }
}
