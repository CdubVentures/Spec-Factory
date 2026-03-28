import { defaultIndexLabRoot } from '../../core/config/runtimeArtifactRoots.js';

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
  getSpecDb,
} = {}) {
  if (exitCode === 0) return null;

  const runId = parseCliArg(cliArgs, '--run-id');
  if (!runId) return null;

  const category = parseCliArg(cliArgs, '--category');

  // SQL-first path (Wave 5.5+)
  if (typeof getSpecDb === 'function' && category) {
    try {
      const specDb = getSpecDb(category);
      if (specDb) {
        const meta = specDb.getRunByRunId(runId);
        if (meta) {
          const events = specDb.getBridgeEventsByRunId(runId, 3000) || [];
          const hasCompletedEvent = events.some((row) => String(row?.event || '').trim() === 'run_completed');
          const terminalReason = extractTerminalErrorReason(events) || (hasCompletedEvent ? '' : 'process_interrupted');
          const endedAt = String(meta.ended_at || '').trim() || new Date().toISOString();

          if (!hasCompletedEvent && !extractTerminalErrorReason(events)) {
            try {
              specDb.insertBridgeEvent({
                run_id: runId,
                category: String(meta.category || '').trim(),
                product_id: String(meta.product_id || '').trim(),
                ts: endedAt,
                stage: 'error',
                event: 'error',
                payload: JSON.stringify({
                  event: terminalReason,
                  message: 'IndexLab process exited before run_completed.',
                }),
              });
            } catch { /* best-effort */ }
          }

          const nextStatus = hasCompletedEvent ? 'completed' : 'failed';
          try {
            specDb.upsertRun({
              ...meta,
              counters: typeof meta.counters === 'string' ? meta.counters : JSON.stringify(meta.counters || {}),
              status: nextStatus,
              ended_at: endedAt,
            });
          } catch { /* best-effort */ }

          return { ...meta, status: nextStatus, ended_at: endedAt };
        }
      }
    } catch { /* best-effort */ }
  }

  return null;
}

export async function handleIndexLabProcessCompletion({
  exitCode,
  cliArgs,
  startedAt = '',
  indexLabRoot = defaultIndexLabRoot(),
  broadcastWs,
  logError = console.error,
  getSpecDb,
} = {}) {
  if (!isIndexLabCommand(cliArgs)) return null;

  const customOutRoot = parseCliArg(cliArgs, '--out');
  const effectiveIndexLabRoot = customOutRoot || indexLabRoot;
  await reconcileInterruptedRunArtifacts({
    exitCode,
    cliArgs,
    indexLabRoot: effectiveIndexLabRoot,
    getSpecDb,
  });

  // Record storage location in SQL
  const category = parseCliArg(cliArgs, '--category');
  const productId = parseCliArg(cliArgs, '--product-id');
  const runId = parseCliArg(cliArgs, '--run-id');
  if (typeof getSpecDb === 'function' && category) {
    try {
      const db = getSpecDb(category);
      if (db && runId) {
        db.updateRunStorageLocation({
          productId,
          runId,
          storageState: 'live',
          localPath: effectiveIndexLabRoot,
          s3Key: '',
          sizeBytes: 0,
          relocatedAt: '',
        });
      }
    } catch (err) {
      logError?.('[indexlab-completion] failed to record storage location', err);
    }
  }

  return null;
}
