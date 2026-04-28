function sortRuns(runs) {
  return [...(Array.isArray(runs) ? runs : [])]
    .sort((a, b) => (Number(a?.run_number) || 0) - (Number(b?.run_number) || 0));
}

function maxRunNumber(runs) {
  return sortRuns(runs).reduce(
    (max, run) => Math.max(max, Number(run?.run_number) || 0),
    0,
  );
}

function canReadSqlRuns(finderStore) {
  return typeof finderStore?.listRuns === 'function';
}

function canPersistSqlRuns(finderStore) {
  return canReadSqlRuns(finderStore)
    && typeof finderStore?.insertRun === 'function'
    && typeof finderStore?.upsert === 'function';
}

function readSqlSummary(finderStore, productId) {
  return typeof finderStore?.get === 'function'
    ? finderStore.get(productId)
    : null;
}

function readJsonDoc({ readRuns, productId, productRoot }) {
  return readRuns({ productId, productRoot }) || null;
}

export function readScalarFinderRunsSqlFirst({
  finderStore,
  readRuns,
  productId,
  productRoot,
}) {
  if (canReadSqlRuns(finderStore)) {
    const sqlRuns = sortRuns(finderStore.listRuns(productId));
    const summary = readSqlSummary(finderStore, productId);
    if (sqlRuns.length > 0 || summary) return sqlRuns;
  }

  const doc = readJsonDoc({ readRuns, productId, productRoot });
  return sortRuns(doc?.runs || []);
}

function buildRunEntry({ runNumber, ranAt, run }) {
  return {
    run_number: runNumber,
    ran_at: ranAt || new Date().toISOString(),
    model: run.model || 'unknown',
    fallback_used: Boolean(run.fallback_used),
    ...(run.status ? { status: run.status } : {}),
    ...(run.mode ? { mode: run.mode } : {}),
    ...(run.loop_id ? { loop_id: run.loop_id } : {}),
    ...(run.started_at ? { started_at: run.started_at } : {}),
    ...(run.duration_ms != null ? { duration_ms: run.duration_ms } : {}),
    ...(run.access_mode ? { access_mode: run.access_mode } : {}),
    ...(run.effort_level ? { effort_level: run.effort_level } : {}),
    ...(run.thinking != null ? { thinking: Boolean(run.thinking) } : {}),
    ...(run.web_search != null ? { web_search: Boolean(run.web_search) } : {}),
    selected: run.selected || { candidates: [] },
    prompt: run.prompt || { system: '', user: '' },
    response: run.response || {},
  };
}

function insertSqlRun({ finderStore, category, productId, run }) {
  finderStore.insertRun({
    category,
    product_id: productId,
    run_number: run.run_number,
    ran_at: run.ran_at,
    started_at: run.started_at ?? run.response?.started_at ?? null,
    duration_ms: run.duration_ms ?? run.response?.duration_ms ?? null,
    model: run.model || 'unknown',
    fallback_used: Boolean(run.fallback_used),
    effort_level: run.effort_level || '',
    access_mode: run.access_mode || '',
    thinking: Boolean(run.thinking),
    web_search: Boolean(run.web_search),
    selected: run.selected || {},
    prompt: run.prompt || {},
    response: run.response || {},
  });
}

function upsertSqlSummary({ finderStore, category, productId, doc, previousSummary }) {
  const candidates = Array.isArray(doc?.selected?.candidates) ? doc.selected.candidates : [];
  finderStore.upsert({
    category,
    product_id: productId,
    candidates,
    candidate_count: candidates.length,
    cooldown_until: doc?.cooldown_until || previousSummary?.cooldown_until || '',
    latest_ran_at: doc?.last_ran_at || previousSummary?.latest_ran_at || '',
    run_count: doc?.run_count || (Array.isArray(doc?.runs) ? doc.runs.length : 0),
  });
}

function seedSqlRunsFromJson({
  finderStore,
  readRuns,
  productId,
  productRoot,
  category,
}) {
  const doc = readJsonDoc({ readRuns, productId, productRoot });
  const runs = sortRuns(doc?.runs || []);
  for (const run of runs) {
    insertSqlRun({ finderStore, category: doc?.category || category, productId, run });
  }
  if (doc && (runs.length > 0 || doc.selected)) {
    upsertSqlSummary({
      finderStore,
      category: doc.category || category,
      productId,
      doc,
      previousSummary: null,
    });
  }
  return { doc, runs };
}

function buildJsonMirrorFromRuns({
  readRuns,
  recalculateFromRuns,
  productId,
  productRoot,
  category,
  runs,
}) {
  const existingDoc = readJsonDoc({ readRuns, productId, productRoot });
  return recalculateFromRuns(runs, productId, category, existingDoc);
}

export function persistScalarFinderRunSqlFirst({
  finderStore,
  productId,
  productRoot,
  category,
  run,
  ranAt,
  readRuns,
  writeRuns,
  recalculateFromRuns,
  mergeDiscovery,
}) {
  if (!canPersistSqlRuns(finderStore) || !writeRuns || !recalculateFromRuns) {
    const doc = mergeDiscovery({
      productId,
      productRoot,
      newDiscovery: { category, last_ran_at: ranAt },
      run,
    });
    const sortedRuns = sortRuns(doc?.runs || []);
    const latestRun = sortedRuns[sortedRuns.length - 1] || null;
    if (latestRun && typeof finderStore?.insertRun === 'function') {
      insertSqlRun({ finderStore, category, productId, run: latestRun });
    }
    if (typeof finderStore?.upsert === 'function') {
      upsertSqlSummary({
        finderStore,
        category,
        productId,
        doc,
        previousSummary: readSqlSummary(finderStore, productId),
      });
    }
    return { doc, run: latestRun, sqlFirst: false };
  }

  let existingRuns = sortRuns(finderStore.listRuns(productId));
  let previousSummary = readSqlSummary(finderStore, productId);
  if (existingRuns.length === 0 && !previousSummary) {
    const seeded = seedSqlRunsFromJson({
      finderStore,
      readRuns,
      productId,
      productRoot,
      category,
    });
    existingRuns = seeded.runs;
    previousSummary = readSqlSummary(finderStore, productId) || null;
  }

  const runEntry = buildRunEntry({
    runNumber: maxRunNumber(existingRuns) + 1,
    ranAt,
    run,
  });
  insertSqlRun({ finderStore, category, productId, run: runEntry });

  const runsAfter = sortRuns([
    ...existingRuns.filter((existingRun) => existingRun.run_number !== runEntry.run_number),
    runEntry,
  ]);
  const doc = buildJsonMirrorFromRuns({
    readRuns,
    recalculateFromRuns,
    productId,
    productRoot,
    category,
    runs: runsAfter,
  });
  upsertSqlSummary({ finderStore, category, productId, doc, previousSummary });
  writeRuns({ productId, productRoot, data: doc });
  return { doc, run: runEntry, sqlFirst: true };
}
