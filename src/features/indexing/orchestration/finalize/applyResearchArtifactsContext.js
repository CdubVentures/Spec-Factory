export async function applyResearchArtifactsContext({
  frontierDb = null,
  uberOrchestrator = null,
  storage,
  category,
  productId,
  runId,
  discoveryResult = {},
  previousFinalSpec = {},
  normalized = {},
  fieldOrder = [],
  summary = {},
  runtimeMode = 'production',
} = {}) {
  if (!frontierDb) {
    return;
  }

  const researchBase = storage.resolveOutputKey(category, productId, 'runs', runId, 'research');
  const searchPlanPayload = (
    discoveryResult?.uber_search_plan && typeof discoveryResult.uber_search_plan === 'object'
      ? discoveryResult.uber_search_plan
      : { source: 'none', queries: discoveryResult?.queries || [] }
  );
  const searchJournalRows = Array.isArray(discoveryResult?.search_journal) ? discoveryResult.search_journal : [];
  const frontierSnapshot = frontierDb?.frontierSnapshot?.({ limit: 200 }) || null;
  const previousFields = previousFinalSpec?.fields && typeof previousFinalSpec.fields === 'object'
    ? previousFinalSpec.fields
    : (previousFinalSpec || {});
  const coverageDelta = uberOrchestrator?.buildCoverageDelta?.({
    previousSpec: previousFields,
    currentSpec: normalized?.fields || {},
    fieldOrder,
  }) || {
    previous_known_count: 0,
    current_known_count: 0,
    delta_known: 0,
    gained_fields: [],
    lost_fields: [],
  };

  const searchPlanKey = `${researchBase}/search_plan.json`;
  const searchJournalKey = `${researchBase}/search_journal.jsonl`;
  const frontierSnapshotKey = `${researchBase}/frontier_snapshot.json`;
  const coverageDeltaKey = `${researchBase}/coverage_delta.json`;
  await storage.writeObject(
    searchPlanKey,
    Buffer.from(`${JSON.stringify(searchPlanPayload || {
      source: 'none',
      queries: discoveryResult?.queries || [],
    }, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    searchJournalKey,
    Buffer.from(
      `${searchJournalRows.map((row) => JSON.stringify(row)).join('\n')}${searchJournalRows.length ? '\n' : ''}`,
      'utf8',
    ),
    { contentType: 'application/x-ndjson' },
  );
  await storage.writeObject(
    frontierSnapshotKey,
    Buffer.from(`${JSON.stringify(frontierSnapshot || {}, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    coverageDeltaKey,
    Buffer.from(`${JSON.stringify(coverageDelta, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );

  summary.research = {
    ...(summary.research || {}),
    mode: runtimeMode,
    search_plan_key: searchPlanKey,
    search_journal_key: searchJournalKey,
    frontier_snapshot_key: frontierSnapshotKey,
    coverage_delta_key: coverageDeltaKey,
  };
}
