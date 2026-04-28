/**
 * Benchmark scorecard reader. Loads the per-category benchmark scorecard
 * (when present) and extracts per-key per-product expected/extracted rows so
 * the per-key auditor brief can show the auditor exactly what each test
 * product expects vs what the most recent extraction produced.
 *
 * Optional dependency: when no scorecard file exists for the category, the
 * loader returns null and the per-key brief silently omits the benchmark
 * diff section. Categories without a benchmark are still fully auditable.
 *
 * Single concern: read + project. No transformation of the benchmark data
 * itself; the per-key brief renderer decides how to display it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SCORECARD_RELATIVE_PATH = ['key-finder-benchmark', 'scorecard.json'];

function resolveScorecardPath(outputRoot, category) {
  if (!outputRoot || !category) return null;
  return path.resolve(outputRoot, category, ...SCORECARD_RELATIVE_PATH);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.outputRoot   - absolute path to .workspace/reports
 * @param {string} opts.category
 * @returns {Promise<object|null>}   the parsed scorecard or null when missing/unreadable
 */
export async function loadBenchmarkScorecard({ outputRoot, category }) {
  const filePath = resolveScorecardPath(outputRoot, category);
  if (!filePath) return null;
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

const ROW_STATUSES_BY_LEVERAGE = ['wrong', 'extra', 'missing', 'needs_review', 'correct'];

function leverageRank(status) {
  const idx = ROW_STATUSES_BY_LEVERAGE.indexOf(String(status || '').toLowerCase());
  return idx === -1 ? ROW_STATUSES_BY_LEVERAGE.length : idx;
}

/**
 * Collect per-product cells for a single field key, sorted so the auditor sees
 * the highest-leverage rows first (wrong, extra, missing, needs_review, correct).
 *
 * @param {object|null} scorecard
 * @param {string} fieldKey
 * @returns {{ generatedAt: string|null, fieldSummary: object|null, rows: Array<object> }|null}
 */
export function extractFieldBenchmarkRows(scorecard, fieldKey) {
  if (!scorecard || typeof scorecard !== 'object' || !fieldKey) return null;
  const products = Array.isArray(scorecard.products) ? scorecard.products : [];
  if (products.length === 0) return null;

  const rows = [];
  for (const product of products) {
    const cell = product?.cells?.[fieldKey];
    if (!cell || typeof cell !== 'object') continue;
    rows.push({
      productLabel: product.display_name || product.identity_key || `${product.brand || ''} ${product.model || ''}`.trim(),
      identityKey: product.identity_key || null,
      status: cell.status || '',
      reason: cell.reason || '',
      benchmark: cell.benchmark ?? '',
      benchmarkNormalized: cell.benchmark_normalized ?? null,
      app: cell.app ?? '',
      appNormalized: cell.app_normalized ?? null,
      appConfidence: typeof cell.app_confidence === 'number' ? cell.app_confidence : null,
      appSourceType: cell.app_source_type || '',
      appUpdatedAt: cell.app_updated_at || '',
    });
  }
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const rankDiff = leverageRank(a.status) - leverageRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return String(a.productLabel || '').localeCompare(String(b.productLabel || ''));
  });

  const fieldSummary = Array.isArray(scorecard.fields)
    ? scorecard.fields.find((entry) => entry?.field_key === fieldKey) || null
    : null;

  return {
    generatedAt: scorecard.generated_at || null,
    fieldSummary,
    rows,
  };
}
