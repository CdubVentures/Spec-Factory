// WHY: Bidirectional sync orchestrator for run data between local and S3.
// Operates on DB-indexed runs (from queueProductStore storage columns).
// Separate from runDataRelocationService which handles one-way post-run archival.

export function createStorageSyncService({
  getCategoryDbs,
  relocateToS3,
  materializeFromS3,
} = {}) {
  function allCategoryDbs() {
    const dbs = typeof getCategoryDbs === 'function' ? getCategoryDbs() : {};
    return Object.entries(dbs || {});
  }

  async function syncStatus() {
    const totals = { live: 0, local: 0, s3: 0, synced: 0 };
    for (const [, db] of allCategoryDbs()) {
      const counts = db.countRunsByStorageState();
      for (const { storage_state, count } of counts) {
        if (storage_state in totals) {
          totals[storage_state] += count;
        }
      }
    }
    return totals;
  }

  async function pushAllToS3() {
    const results = { pushed: 0, errors: [] };
    for (const [category, db] of allCategoryDbs()) {
      const localRuns = db.listRunsByStorageState('local');
      for (const run of localRuns) {
        try {
          const relocationResult = await relocateToS3({
            runMeta: {
              run_id: run.run_id,
              category: run.category || category,
              product_id: run.product_id,
            },
          });
          if (relocationResult?.ok) {
            db.updateRunStorageLocation({
              productId: run.product_id,
              runId: run.run_id,
              storageState: 'synced',
              localPath: run.local_path || '',
              s3Key: relocationResult.s3_prefix || '',
              sizeBytes: run.size_bytes || 0,
              relocatedAt: new Date().toISOString(),
            });
            results.pushed += 1;
          }
        } catch (error) {
          results.errors.push({
            run_id: run.run_id,
            category: run.category || category,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return results;
  }

  async function pullAllFromS3() {
    const results = { pulled: 0, errors: [] };
    for (const [category, db] of allCategoryDbs()) {
      const s3Runs = db.listRunsByStorageState('s3');
      for (const run of s3Runs) {
        try {
          const localPath = await materializeFromS3({
            runId: run.run_id,
            s3Key: run.s3_key || '',
            category: run.category || category,
            productId: run.product_id,
          });
          db.updateRunStorageLocation({
            productId: run.product_id,
            runId: run.run_id,
            storageState: 'synced',
            localPath: localPath || '',
            s3Key: run.s3_key || '',
            sizeBytes: run.size_bytes || 0,
            relocatedAt: new Date().toISOString(),
          });
          results.pulled += 1;
        } catch (error) {
          results.errors.push({
            run_id: run.run_id,
            category: run.category || category,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return results;
  }

  return { syncStatus, pushAllToS3, pullAllFromS3 };
}
