/**
 * Generic Finder Route Handler.
 *
 * Creates a standard 5-endpoint route handler for any finder module:
 * GET list, GET single, POST trigger, DELETE run, DELETE all.
 *
 * Owns the full operations lifecycle (register → stage → stream →
 * complete/fail → emit) so per-module route files are pure config.
 */

import { emitDataChange } from '../events/dataChangeContract.js';
import { registerOperation, getOperationSignal, updateStage, updateModelInfo, updateQueueDelay, appendLlmCall, completeOperation, failOperation, cancelOperation, fireAndForget } from '../operations/index.js';
import { createStreamBatcher } from '../llm/streamBatcher.js';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';
import { normalizeConfidence } from '../../features/publisher/publish/publishCandidate.js';
import { republishField } from '../../features/publisher/publish/republishField.js';
import fs from 'node:fs';
import path from 'node:path';

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function cleanProductJsonCandidates(productId, fieldKeys) {
  const productPath = path.join(defaultProductRoot(), productId, 'product.json');
  try {
    const data = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    if (!data.candidates) return;
    for (const key of fieldKeys) delete data.candidates[key];
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify(data, null, 2));
  } catch { /* product.json may not exist */ }
}

function cleanProductJsonPublishedFields(productId, fieldKeys) {
  const productPath = path.join(defaultProductRoot(), productId, 'product.json');
  try {
    const data = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    if (!data.fields) return;
    let changed = false;
    for (const key of fieldKeys) {
      if (data.fields[key]) { delete data.fields[key]; changed = true; }
    }
    if (changed) {
      data.updated_at = new Date().toISOString();
      fs.writeFileSync(productPath, JSON.stringify(data, null, 2));
    }
  } catch { /* product.json may not exist */ }
}

/**
 * Run-scoped candidate cleanup — deletes source-centric rows for specific run(s).
 *
 * WHY: Source-centric model — each extraction event has its own row keyed by source_id.
 * Deleting a run = DELETE rows with deterministic source_id pattern.
 * Then re-publish from remaining candidates or clean stale product.json.
 */
function stripRunSourceFromCandidates(specDb, productId, fieldKeys, sourceType, runNumbers, config) {
  if (!specDb.getFieldCandidatesByProductAndField) return;
  const runSet = new Set(Array.isArray(runNumbers) ? runNumbers : [runNumbers]);

  // WHY: Source-centric rows have source_id = `{sourceType}-{productId}-{runNumber}`.
  // Delete by source_id when available; fall back to old sources_json splicing for legacy rows.
  for (const fieldKey of fieldKeys) {
    // Try source-centric delete first
    if (specDb.deleteFieldCandidateBySourceId) {
      for (const rn of runSet) {
        const sourceId = `${sourceType}-${productId}-${rn}`;
        specDb.deleteFieldCandidateBySourceId(productId, fieldKey, sourceId);
      }
    }

    // Fall back: strip from legacy rows that still have sources_json
    const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
    for (const row of rows) {
      if (row.source_id) continue; // source-centric row already handled above
      const sources = Array.isArray(row.sources_json) ? row.sources_json : [];
      const remaining = sources.filter(s => !(s.source === sourceType && runSet.has(s.run_number)));
      if (remaining.length === sources.length) continue;
      if (remaining.length === 0) {
        if (specDb.deleteFieldCandidateByValue) specDb.deleteFieldCandidateByValue(productId, fieldKey, row.value);
      } else {
        specDb.upsertFieldCandidate({
          productId, fieldKey, value: row.value, unit: row.unit,
          confidence: remaining.reduce((max, s) => Math.max(max, s.confidence ?? 0), 0),
          sourceCount: remaining.length, sourcesJson: remaining,
          validationJson: row.validation_json, metadataJson: row.metadata_json, status: row.status,
        });
      }
    }
  }

  // WHY: After deleting, re-publish from remaining candidates or clean stale state.
  republishAfterDelete(specDb, productId, fieldKeys, sourceType, runSet, config);
}

/**
 * Source-type candidate cleanup — deletes all rows from a specific source type.
 *
 * WHY: Source-centric model — DELETE by source_type column instead of splicing arrays.
 */
function stripSourceFromCandidates(specDb, productId, fieldKeys, sourceType, config) {
  if (!specDb.getFieldCandidatesByProductAndField) return;

  for (const fieldKey of fieldKeys) {
    // Source-centric: bulk delete by source_type
    if (specDb.deleteFieldCandidatesBySourceType) {
      specDb.deleteFieldCandidatesBySourceType(productId, fieldKey, sourceType);
    }

    // Fall back: strip from legacy rows that still have sources_json
    const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
    for (const row of rows) {
      if (row.source_id) continue;
      const sources = Array.isArray(row.sources_json) ? row.sources_json : [];
      const remaining = sources.filter(s => s.source !== sourceType);
      if (remaining.length === 0) {
        if (specDb.deleteFieldCandidateByValue) specDb.deleteFieldCandidateByValue(productId, fieldKey, row.value);
      } else if (remaining.length < sources.length) {
        specDb.upsertFieldCandidate({
          productId, fieldKey, value: row.value, unit: row.unit,
          confidence: remaining.reduce((max, s) => Math.max(max, s.confidence ?? 0), 0),
          sourceCount: remaining.length, sourcesJson: remaining,
          validationJson: row.validation_json, metadataJson: row.metadata_json, status: row.status,
        });
      }
    }
  }

  // Clean product.json after source-type deletion
  republishAfterDelete(specDb, productId, fieldKeys, sourceType, null, config);
}

/**
 * Shared post-delete cleanup: update product.json candidates[] and fields[].
 */
function republishAfterDelete(specDb, productId, fieldKeys, sourceType, runSet, config) {
  const productPath = path.join(defaultProductRoot(), productId, 'product.json');
  try {
    const data = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    let changed = false;

    // Clean product.json candidates[] — filter by source_id or source_type
    if (data.candidates) {
      for (const key of fieldKeys) {
        if (!Array.isArray(data.candidates[key])) continue;
        const before = data.candidates[key].length;
        data.candidates[key] = data.candidates[key].filter(entry => {
          // New format: match by source_id or source_type
          if (entry.source_id) {
            if (runSet) {
              for (const rn of runSet) {
                if (entry.source_id === `${sourceType}-${productId}-${rn}`) return false;
              }
              return true;
            }
            return entry.source_type !== sourceType;
          }
          // Old format: filter sources array
          if (!Array.isArray(entry.sources)) return true;
          const remaining = runSet
            ? entry.sources.filter(s => !(s.source === sourceType && runSet.has(s.run_number)))
            : entry.sources.filter(s => s.source !== sourceType);
          if (remaining.length === 0) return false;
          entry.sources = remaining;
          return true;
        });
        if (data.candidates[key].length !== before) changed = true;
      }
    }

    // Re-publish or clean stale fields[]
    if (data.fields) {
      for (const key of fieldKeys) {
        const result = republishField({ specDb, productId, fieldKey: key, config, productJson: data });
        if (result.status !== 'unchanged') changed = true;
      }
    }

    if (changed) {
      data.updated_at = new Date().toISOString();
      fs.writeFileSync(productPath, JSON.stringify(data, null, 2));
    }
  } catch { /* product.json may not exist */ }
}

/**
 * @param {object} finderConfig
 * @param {string} finderConfig.routePrefix — URL path prefix (e.g. 'color-edition-finder')
 * @param {string} finderConfig.moduleType — operations tracker type (e.g. 'cef')
 * @param {string} finderConfig.phase — LLM phase ID (e.g. 'colorFinder')
 * @param {string[]} finderConfig.fieldKeys — field keys for candidate cleanup on delete-all
 * @param {Function} finderConfig.runFinder — orchestrator function
 * @param {Function} finderConfig.deleteRun — JSON deleteRun function
 * @param {Function} finderConfig.deleteAll — JSON deleteAll function
 * @param {Function} finderConfig.getOne — (specDb, productId) => row|null
 * @param {Function} finderConfig.listByCategory — (specDb, category) => rows[]
 * @param {Function} finderConfig.listRuns — (specDb, productId) => runs[]
 * @param {Function} finderConfig.upsertSummary — (specDb, row) => void
 * @param {Function} finderConfig.deleteOneSql — (specDb, productId) => void
 * @param {Function} finderConfig.deleteRunSql — (specDb, productId, runNumber) => void
 * @param {Function} finderConfig.deleteAllRunsSql — (specDb, productId) => void
 * @param {Function} [finderConfig.buildGetResponse] — (row, selected, runs) => custom response
 * @param {Function} [finderConfig.buildResultMeta] — (result) => meta for data-change event
 * @returns {Function} (ctx) => async route handler
 */
export function createFinderRouteHandler(finderConfig) {
  const {
    routePrefix, moduleType, phase, fieldKeys,
    runFinder, deleteRun, deleteAll,
    getOne, listByCategory, listRuns,
    upsertSummary, updateBookkeeping, deleteOneSql, deleteRunSql, deleteAllRunsSql,
    buildGetResponse, buildResultMeta,
  } = finderConfig;

  return function bindContext(ctx) {
    const { jsonRes, config, appDb, getSpecDb, broadcastWs, logger } = ctx;

    return async function handleFinderRoutes(parts, params, method, req, res) {
      if (parts[0] !== routePrefix) return false;

      const category = parts[1] || '';
      const productId = parts[2] || '';

      // ── GET /:prefix/:category — list all ───────────────────────
      if (method === 'GET' && category && !productId) {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
        const rows = listByCategory(specDb, category);
        return jsonRes(res, 200, rows);
      }

      // ── GET /:prefix/:category/:productId — single with runs ───
      if (method === 'GET' && category && productId) {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });
        const row = getOne(specDb, productId);
        if (!row) return jsonRes(res, 404, { error: 'not found' });

        const runRows = listRuns(specDb, productId);
        const latestRun = runRows.length > 0 ? runRows[runRows.length - 1] : null;
        const latestSelected = latestRun?.selected;
        const selected = (latestSelected && typeof latestSelected === 'object' && Object.keys(latestSelected).length > 0)
          ? latestSelected
          : (row.selected || {});

        if (buildGetResponse) {
          return jsonRes(res, 200, buildGetResponse(row, selected, runRows, { specDb, productId }));
        }

        return jsonRes(res, 200, {
          product_id: row.product_id,
          category: row.category,
          run_count: row.run_count,
          last_ran_at: row.latest_ran_at,
          selected,
          runs: runRows,
        });
      }

      // ── POST /:prefix/:category/:productId — trigger run ───────
      if (method === 'POST' && category && productId && !parts[3]) {
        let op = null;
        let batcher = null;
        try {
          const specDb = getSpecDb(category);
          if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

          const productRow = specDb.getProduct(productId);
          if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

          // WHY: Field Studio gate — if requiredFields are not enabled in
          // compiled rules, this module is disabled for this category.
          if (finderConfig.requiredFields?.length > 0) {
            const compiled = specDb.getCompiledRules?.();
            const fields = compiled?.fields || {};
            for (const key of finderConfig.requiredFields) {
              if (!fields[key]) {
                return jsonRes(res, 403, { error: `${routePrefix} disabled: field '${key}' not enabled in field studio` });
              }
            }
          }

          // WHY: When jsonStrict is off, LLM routing splits into Research + Writer.
          const jsonStrictKey = `_resolved${capitalize(phase)}JsonStrict`;
          const useWriterPhase = config[jsonStrictKey] === false;
          const stages = finderConfig.customStages
            || (useWriterPhase ? ['Research', 'Writer', 'Validate'] : ['LLM', 'Validate']);

          op = registerOperation({
            type: moduleType,
            category,
            productId,
            productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
            stages,
          });

          batcher = createStreamBatcher({ operationId: op.id, broadcastWs });
          const signal = getOperationSignal(op.id);

          return fireAndForget({
            res,
            jsonRes,
            op,
            batcher,
            broadcastWs,
            signal,
            emitArgs: {
              event: `${routePrefix}-run`,
              category,
              entities: { productIds: [productId] },
              meta: { productId },
            },
            asyncWork: () => runFinder({
              product: {
                product_id: productId,
                category,
                brand: productRow.brand || '',
                model: productRow.model || '',
                variant: productRow.variant || '',
              },
              appDb,
              specDb,
              config,
              logger: logger || null,
              signal,
              onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
              onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
              onStreamChunk: (delta) => { if (delta.reasoning) batcher.push(delta.reasoning); if (delta.content) batcher.push(delta.content); },
              onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
              onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
            }),
            completeOperation,
            failOperation,
            cancelOperation,
            emitDataChange,
          });
        } catch (err) {
          if (batcher) batcher.dispose();
          if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${routePrefix}] POST failed:`, message);
          return jsonRes(res, 500, { error: 'finder failed', message });
        }
      }

      // ── DELETE /:prefix/:category/:productId/runs/batch ──────────
      if (method === 'DELETE' && category && productId && parts[3] === 'runs' && parts[4] === 'batch') {
        const body = await ctx.readJsonBody(req);
        const { runNumbers } = body || {};
        if (!Array.isArray(runNumbers) || runNumbers.length === 0) {
          return jsonRes(res, 400, { error: 'runNumbers must be a non-empty array' });
        }

        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        for (const rn of runNumbers) deleteRunSql(specDb, productId, rn);

        const deleteRunsFn = finderConfig.deleteRuns || deleteRun;
        const updated = finderConfig.deleteRuns
          ? deleteRunsFn({ productId, runNumbers })
          : (() => {
            let last = null;
            for (const rn of runNumbers) last = deleteRun({ productId, runNumber: rn });
            return last;
          })();

        // WHY: Candidate cleanup on batch delete — strip deleted runs' source entries
        if (finderConfig.candidateSourceType && fieldKeys.length > 0) {
          stripRunSourceFromCandidates(specDb, productId, fieldKeys, finderConfig.candidateSourceType, runNumbers, config);
        }

        if (finderConfig.onAfterRunDelete) {
          finderConfig.onAfterRunDelete({ specDb, productId, productRoot: defaultProductRoot() });
        }

        if (updated) {
          const bookkeeping = {
            latest_ran_at: updated.last_ran_at || '',
            run_count: updated.run_count || 0,
          };
          if (finderConfig.skipSelectedOnDelete && updateBookkeeping) {
            // WHY: Only touch bookkeeping — preserve custom columns (colors,
            // editions, variant_registry). Full upsert would nuke them.
            updateBookkeeping(specDb, productId, bookkeeping);
          } else {
            const summaryRow = { category, product_id: productId, ...bookkeeping };
            if (!finderConfig.skipSelectedOnDelete) {
              Object.assign(summaryRow, updated.selected || {});
            }
            upsertSummary(specDb, summaryRow);
          }
        } else {
          deleteAllRunsSql(specDb, productId);
          deleteOneSql(specDb, productId);
        }

        emitDataChange({
          broadcastWs,
          event: `${routePrefix}-run-deleted`,
          category,
          entities: { productIds: [productId] },
          meta: { productId, deletedRuns: runNumbers, remainingRuns: updated?.run_count || 0 },
        });

        return jsonRes(res, 200, { ok: true, remaining_runs: updated?.run_count || 0 });
      }

      // ── DELETE /:prefix/:category/:productId/runs/:runNumber ────
      if (method === 'DELETE' && category && productId && parts[3] === 'runs' && parts[4]) {
        const runNumber = Number(parts[4]);
        if (!Number.isFinite(runNumber) || runNumber < 1) {
          return jsonRes(res, 400, { error: 'invalid run number' });
        }

        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        deleteRunSql(specDb, productId, runNumber);
        const updated = deleteRun({ productId, runNumber });

        // WHY: Candidate cleanup on single-run delete — strip the deleted run's
        // source entries from candidates, delete empty candidates, re-publish
        // from remaining candidates, and update product.json.
        if (finderConfig.candidateSourceType && fieldKeys.length > 0) {
          stripRunSourceFromCandidates(specDb, productId, fieldKeys, finderConfig.candidateSourceType, [runNumber], config);
        }

        // WHY: Post-delete hook lets modules re-derive published state from
        // their SSOT (e.g. CEF re-derives colors/editions from variants table).
        if (finderConfig.onAfterRunDelete) {
          finderConfig.onAfterRunDelete({ specDb, productId, productRoot: defaultProductRoot() });
        }

        if (updated) {
          const bookkeeping = {
            latest_ran_at: updated.last_ran_at || '',
            run_count: updated.run_count || 0,
          };
          if (finderConfig.skipSelectedOnDelete && updateBookkeeping) {
            // WHY: Only touch bookkeeping — preserve custom columns (colors,
            // editions, variant_registry). Full upsert would nuke them.
            updateBookkeeping(specDb, productId, bookkeeping);
          } else {
            const summaryRow = { category, product_id: productId, ...bookkeeping };
            if (!finderConfig.skipSelectedOnDelete) {
              Object.assign(summaryRow, updated.selected || {});
            }
            upsertSummary(specDb, summaryRow);
          }
        } else {
          deleteAllRunsSql(specDb, productId);
          deleteOneSql(specDb, productId);
        }

        emitDataChange({
          broadcastWs,
          event: `${routePrefix}-run-deleted`,
          category,
          entities: { productIds: [productId] },
          meta: { productId, deletedRun: runNumber, remainingRuns: updated?.run_count || 0 },
        });

        return jsonRes(res, 200, { ok: true, remaining_runs: updated?.run_count || 0 });
      }

      // ── DELETE /:prefix/:category/:productId — delete all ───────
      if (method === 'DELETE' && category && productId && !parts[3]) {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        deleteAll({ productId });
        deleteAllRunsSql(specDb, productId);
        deleteOneSql(specDb, productId);

        // WHY: Source-aware cleanup strips only this module's source entries
        // from candidate rows. Candidates from other sources (pipeline, review,
        // manual override) survive with their remaining sources intact.
        if (finderConfig.candidateSourceType && fieldKeys.length > 0) {
          stripSourceFromCandidates(specDb, productId, fieldKeys, finderConfig.candidateSourceType, config);
        } else {
          for (const key of fieldKeys) {
            specDb.deleteFieldCandidatesByProductAndField(productId, key);
          }
          cleanProductJsonCandidates(productId, fieldKeys);
          // WHY: Blanket delete removes all candidates — published fields[] are now stale.
          cleanProductJsonPublishedFields(productId, fieldKeys);
        }

        emitDataChange({
          broadcastWs,
          event: `${routePrefix}-deleted`,
          category,
          entities: { productIds: [productId] },
          meta: { productId },
        });

        return jsonRes(res, 200, { ok: true });
      }

      return false;
    };
  };
}
