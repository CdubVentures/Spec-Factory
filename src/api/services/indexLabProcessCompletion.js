import fs from 'node:fs/promises';
import path from 'node:path';
import { emitDataChange } from '../../core/events/dataChangeContract.js';
import { defaultIndexLabRoot, defaultLocalOutputRoot } from '../../core/config/runtimeArtifactRoots.js';
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

async function safeReadJson(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function safeReadJsonLines(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
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
  const rootDir = path.resolve(String(indexLabRoot || defaultIndexLabRoot()));
  const requestedRunId = parseCliArg(cliArgs, '--run-id');
  if (requestedRunId) {
    const directMeta = await safeReadJson(path.join(rootDir, requestedRunId, 'run.json'));
    if (directMeta && typeof directMeta === 'object') {
      return directMeta;
    }
  }

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

function closeOpenStages(stages = {}, endedAt = '') {
  const source = stages && typeof stages === 'object' ? stages : {};
  const next = {};
  for (const [stageName, stageState] of Object.entries(source)) {
    const safeState = stageState && typeof stageState === 'object' ? stageState : {};
    const startedAt = String(safeState.started_at || '').trim();
    const stageEndedAt = String(safeState.ended_at || '').trim();
    next[stageName] = {
      ...safeState,
      ended_at: startedAt && !stageEndedAt ? endedAt : stageEndedAt,
    };
  }
  return next;
}

function extractTerminalErrorReason(events = []) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i] || {};
    if (String(row.event || '').trim() === 'run_completed') {
      return '';
    }
    if (String(row.event || '').trim() !== 'error') continue;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const reason = String(
      payload.event
      || payload.reason
      || payload.code
      || payload.message
      || '',
    ).trim();
    if (reason) return reason;
  }
  return '';
}

async function reconcileInterruptedRunArtifacts({
  exitCode,
  cliArgs,
  indexLabRoot,
} = {}) {
  if (exitCode === 0) return null;

  const runId = parseCliArg(cliArgs, '--run-id');
  if (!runId) return null;

  const rootDir = path.resolve(String(indexLabRoot || defaultIndexLabRoot()));
  const runDir = path.join(rootDir, runId);
  const runMetaPath = path.join(runDir, 'run.json');
  const runEventsPath = path.join(runDir, 'run_events.ndjson');

  const meta = await safeReadJson(runMetaPath);
  if (!meta || typeof meta !== 'object') return null;

  const events = await safeReadJsonLines(runEventsPath);
  const hasCompletedEvent = events.some((row) => String(row?.event || '').trim() === 'run_completed');
  const terminalReason = extractTerminalErrorReason(events) || (hasCompletedEvent ? '' : 'process_interrupted');
  const endedAt = String(meta.ended_at || '').trim() || new Date().toISOString();

  if (!hasCompletedEvent && !extractTerminalErrorReason(events)) {
    await fs.mkdir(path.dirname(runEventsPath), { recursive: true });
    await fs.appendFile(
      runEventsPath,
      `${JSON.stringify({
        run_id: runId,
        category: String(meta.category || '').trim(),
        product_id: String(meta.product_id || meta.productId || '').trim(),
        ts: endedAt,
        stage: 'error',
        event: 'error',
        payload: {
          event: terminalReason,
          message: 'IndexLab process exited before run_completed.',
        },
      })}\n`,
      'utf8',
    );
  }

  const nextStatus = hasCompletedEvent ? 'completed' : 'failed';
  await fs.writeFile(
    runMetaPath,
    JSON.stringify({
      ...meta,
      status: nextStatus,
      ended_at: endedAt,
      stages: closeOpenStages(meta.stages, endedAt),
    }, null, 2),
    'utf8',
  );

  return {
    ...meta,
    status: nextStatus,
    ended_at: endedAt,
    stages: closeOpenStages(meta.stages, endedAt),
  };
}

export async function handleIndexLabProcessCompletion({
  exitCode,
  cliArgs,
  startedAt = '',
  runDataStorageSettings = {},
  indexLabRoot = defaultIndexLabRoot(),
  outputRoot = defaultLocalOutputRoot(),
  outputPrefix = 'specs/outputs',
  broadcastWs,
  logError = console.error,
  onRelocationComplete,
} = {}) {
  if (!isIndexLabCommand(cliArgs)) return null;

  const customOutRoot = parseCliArg(cliArgs, '--out');
  const effectiveIndexLabRoot = customOutRoot || indexLabRoot;
  await reconcileInterruptedRunArtifacts({
    exitCode,
    cliArgs,
    indexLabRoot: effectiveIndexLabRoot,
  });

  if (!shouldRelocateRunData(runDataStorageSettings)) return null;
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
    if (typeof onRelocationComplete === 'function') {
      try {
        onRelocationComplete({ relocation, category, productId: String(runMeta.product_id || runMeta.productId || '').trim(), runId });
      } catch (cbErr) {
        logError?.('[indexlab-relocation] onRelocationComplete callback error', cbErr);
      }
    }
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
