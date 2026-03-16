export async function runPlannerQueueSnapshotPhase({
  traceWriter = null,
  planner = {},
  logger = {},
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  if (!traceWriter) {
    return;
  }

  const pendingCount =
    (planner.manufacturerQueue?.length || 0) +
    (planner.queue?.length || 0) +
    (planner.candidateQueue?.length || 0);
  const blockedHosts = [...(planner.blockedHosts || new Set())];
  const plannerTrace = await traceWriter.writeJson({
    section: 'planner',
    prefix: 'queue_snapshot',
    payload: {
      ts: nowIsoFn(),
      pending_count: pendingCount,
      blocked_hosts: blockedHosts.slice(0, 60),
      stats: planner.getStats(),
    },
    ringSize: 20,
  });

  logger.info('planner_queue_snapshot_written', {
    pending_count: pendingCount,
    blocked_hosts: blockedHosts.slice(0, 12),
    trace_path: plannerTrace.trace_path,
  });
}
