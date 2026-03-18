export async function runRepairSearchPhase({
  logger,
  repairEvents = [],
  planner,
  config = {},
  processPlannerQueueFn,
  runSearchFn,
  startMs = 0,
  nowFn = Date.now,
} = {}) {
  const result = {
    repairSearchesAttempted: 0,
    repairSearchesCompleted: 0,
    repairSearchesFailed: 0,
    totalUrlsSeeded: 0,
  };

  const engines = String(config.searchEngines || '').trim().toLowerCase();
  if (!engines) {
    logger?.info?.('repair_search_skipped', {
      reason: 'search_provider_disabled',
      queued_repairs: repairEvents.length,
    });
    return result;
  }

  if (!repairEvents.length) {
    return result;
  }

  // deduplicate by domain — only the first repair query per domain
  const seenDomains = new Set();
  const uniqueRepairs = [];
  for (const evt of repairEvents) {
    const domain = String(evt.domain || '').trim().toLowerCase();
    if (!domain || seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    uniqueRepairs.push(evt);
  }

  let anyUrlsSeeded = false;

  for (const repair of uniqueRepairs) {
    const elapsed = (nowFn() - startMs) / 1000;
    const maxSeconds = Number(config.maxRunSeconds || 300);
    if (elapsed >= maxSeconds) {
      logger?.info?.('repair_search_skipped', {
        reason: 'time_budget_exhausted',
        elapsed_seconds: Math.round(elapsed),
        max_seconds: maxSeconds,
        remaining_repairs: uniqueRepairs.length - result.repairSearchesAttempted,
      });
      break;
    }

    const domain = String(repair.domain || '').trim();
    const query = String(repair.query || '').trim();

    logger?.info?.('repair_search_started', {
      domain,
      query,
      field_targets: repair.field_targets || [],
      reason: repair.reason || '',
      source_url: repair.source_url || '',
    });

    result.repairSearchesAttempted += 1;

    try {
      const searchResults = await runSearchFn({ query, config, logger });
      const urls = (searchResults || [])
        .map((r) => String(r?.url || '').trim())
        .filter(Boolean);

      let seededCount = 0;
      for (const url of urls) {
        if (planner.enqueue(url, `repair_search:${domain}`)) {
          seededCount += 1;
        }
      }

      result.repairSearchesCompleted += 1;
      result.totalUrlsSeeded += seededCount;
      if (seededCount > 0) anyUrlsSeeded = true;

      logger?.info?.('repair_search_completed', {
        domain,
        query,
        urls_found: urls.length,
        urls_seeded: seededCount,
        field_targets: repair.field_targets || [],
      });
    } catch (err) {
      result.repairSearchesFailed += 1;
      logger?.info?.('repair_search_failed', {
        domain,
        query,
        error: err?.message || String(err),
        field_targets: repair.field_targets || [],
      });
    }
  }

  if (anyUrlsSeeded && typeof processPlannerQueueFn === 'function') {
    await processPlannerQueueFn();
  }

  return result;
}
