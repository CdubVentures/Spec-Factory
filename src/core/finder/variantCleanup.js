/**
 * Variant-delete cleanup for variantFieldProducer modules.
 *
 * WHY: CEF owns variants. When a variant is deleted, any downstream
 * variantFieldProducer finder (RDF today; SKU/price/availability etc. tomorrow)
 * must strip its own per-variant state — field_candidates rows are already
 * handled by cascadeVariantIdFromCandidates, but each finder also keeps
 * per-variant entries inside its own JSON file and SQL summary/runs blobs.
 *
 * This module is the one place that knows how to strip those. CEF's
 * deleteVariant iterates FINDER_MODULES where moduleClass ===
 * 'variantFieldProducer' and calls stripVariantFromFieldProducerHistory for
 * each — adding a new variantFieldProducer feature costs only a
 * finderModuleRegistry entry (it already requires one for DDL/routes/etc.).
 *
 * Convention (enforced by variantFieldProducer contract):
 *   - JSON at {productRoot}/{productId}/{filePrefix}.json
 *   - selected.candidates[]  — aggregate, one entry per variant
 *   - runs[].selected.candidates[]  — per-run projections
 *   - runs[].response.candidates[]  — LLM output
 *   - SQL summary column 'candidates' mirrors selected.candidates
 *   - SQL summary column 'candidate_count' mirrors candidates.length
 *   - SQL runs_table rows have selected_json / response_json blobs
 *
 * Each candidate entry carries variant_id (optional) and variant_key.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';

function readFinderJson(productRoot, productId, filePrefix) {
  try {
    const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeFinderJson(productRoot, productId, filePrefix, data) {
  const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function variantMatches(candidate, variantId, variantKey) {
  if (!candidate) return false;
  if (variantId && candidate.variant_id === variantId) return true;
  if (variantKey && candidate.variant_key === variantKey) return true;
  return false;
}

function filterCandidates(arr, variantId, variantKey) {
  if (!Array.isArray(arr)) return { result: arr, changed: false };
  const result = arr.filter(c => !variantMatches(c, variantId, variantKey));
  return { result, changed: result.length !== arr.length };
}

/**
 * Strip a variant's entries from one variantFieldProducer module's history.
 *
 * @param {object} opts
 * @param {object} opts.specDb
 * @param {string} opts.productId
 * @param {string} [opts.variantId]   — preferred match
 * @param {string} [opts.variantKey]  — fallback match
 * @param {object} opts.module        — finderModuleRegistry entry (filePrefix, id, ...)
 * @param {string} [opts.productRoot]
 * @returns {{ changed: boolean, runsTouched: number }}
 */
export function stripVariantFromFieldProducerHistory({
  specDb, productId, variantId, variantKey, module, productRoot,
}) {
  if (!module || module.moduleClass !== 'variantFieldProducer') {
    return { changed: false, runsTouched: 0 };
  }
  if (!variantId && !variantKey) return { changed: false, runsTouched: 0 };

  productRoot = productRoot || defaultProductRoot();
  const data = readFinderJson(productRoot, productId, module.filePrefix);
  if (!data) return { changed: false, runsTouched: 0 };

  let jsonChanged = false;
  const touchedRuns = [];

  const runs = Array.isArray(data.runs) ? data.runs : [];
  for (const run of runs) {
    let runChanged = false;

    if (run.selected && Array.isArray(run.selected.candidates)) {
      const { result, changed } = filterCandidates(run.selected.candidates, variantId, variantKey);
      if (changed) {
        run.selected.candidates = result;
        runChanged = true;
      }
    }

    if (run.response && Array.isArray(run.response.candidates)) {
      const { result, changed } = filterCandidates(run.response.candidates, variantId, variantKey);
      if (changed) {
        run.response.candidates = result;
        runChanged = true;
      }
    }

    if (runChanged) {
      jsonChanged = true;
      touchedRuns.push(run);
    }
  }

  if (data.selected && Array.isArray(data.selected.candidates)) {
    const { result, changed } = filterCandidates(data.selected.candidates, variantId, variantKey);
    if (changed) {
      data.selected.candidates = result;
      jsonChanged = true;
    }
  }

  if (!jsonChanged) return { changed: false, runsTouched: 0 };

  data.updated_at = new Date().toISOString();
  writeFinderJson(productRoot, productId, module.filePrefix, data);

  const finderStore = specDb.getFinderStore?.(module.id);
  if (finderStore) {
    const aggregate = data.selected?.candidates || [];
    finderStore.updateSummaryField(productId, 'candidates', JSON.stringify(aggregate));
    finderStore.updateSummaryField(productId, 'candidate_count', aggregate.length);

    if (typeof finderStore.updateRunJson === 'function') {
      for (const run of touchedRuns) {
        finderStore.updateRunJson(productId, run.run_number, {
          selected: run.selected || {},
          response: run.response || {},
        });
      }
    }
  }

  return { changed: true, runsTouched: touchedRuns.length };
}
