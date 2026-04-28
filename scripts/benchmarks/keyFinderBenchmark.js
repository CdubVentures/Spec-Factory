import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const DEFAULT_RESERVED_KEY_FINDER_KEYS = Object.freeze(['colors', 'editions', 'release_date', 'sku']);
const UNKNOWN_TOKENS = new Set(['', '-', '--', 'unk', 'unknown', 'n/a', 'na', 'null']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function isUnknown(value) {
  return UNKNOWN_TOKENS.has(toText(value).toLowerCase());
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return '';
  if (!['[', '{', '"'].includes(text[0])) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function normalizeSpaces(value) {
  return toText(value)
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();
}

function softToken(value) {
  return normalizeToken(value)
    .replace(/\brf\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/2\.4\s*ghz/g, '2.4ghz')
    .replace(/2\.4g\b/g, '2.4ghz')
    .replace(/usb-wired/g, 'usb wired')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitListText(value) {
  const text = normalizeSpaces(value);
  if (!text) return [];
  return text
    .split(/[,;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeList(value, rule) {
  const parsed = parseMaybeJson(value);
  const rawItems = Array.isArray(parsed) ? parsed : splitListText(parsed);
  return rawItems
    .flatMap((item) => {
      if (Array.isArray(item)) return item;
      return [item];
    })
    .map((item) => normalizeForCompare(item, { ...rule, shape: 'scalar' }))
    .filter((item) => item !== null && item !== '')
    .map((item) => (typeof item === 'string' ? normalizeToken(item) : item))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(6));
  const match = toText(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const token = normalizeToken(value);
  if (['yes', 'y', 'true', '1', 'on'].includes(token)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(token)) return false;
  return null;
}

function monthNumber(month) {
  const m = normalizeToken(month).slice(0, 3);
  return {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }[m] || null;
}

function normalizeDate(value) {
  const text = normalizeSpaces(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`;
  const monthYear = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (monthYear) {
    const month = monthNumber(monthYear[1]);
    return month ? `${monthYear[2]}-${month}` : normalizeToken(text);
  }
  const yearMonth = text.match(/^(\d{4})\s+([A-Za-z]{3,9})\.?$/);
  if (yearMonth) {
    const month = monthNumber(yearMonth[2]);
    return month ? `${yearMonth[1]}-${month}` : normalizeToken(text);
  }
  return normalizeToken(text);
}

function fieldContract(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  return {
    type: String(contract.type || rule.type || rule.data_type || 'string').trim().toLowerCase(),
    shape: String(contract.shape || rule.shape || rule.output_shape || rule.value_form || 'scalar').trim().toLowerCase(),
    unit: contract.unit ?? rule.unit ?? null,
    rounding: isObject(contract.rounding) ? contract.rounding : null,
  };
}

export function normalizeForCompare(value, rule = {}) {
  const parsed = parseMaybeJson(value);
  if (isUnknown(parsed)) return null;

  const shape = String(rule.shape || 'scalar').toLowerCase();
  if (shape === 'list' || shape === 'array' || Array.isArray(parsed)) {
    return normalizeList(parsed, rule);
  }

  const type = String(rule.type || 'string').toLowerCase();
  if (type === 'number' || type === 'integer' || type === 'float') return normalizeNumber(parsed);
  if (type === 'boolean' || type === 'bool') return normalizeBoolean(parsed);
  if (type === 'date') return normalizeDate(parsed);
  return normalizeToken(parsed);
}

export function columnLabelToIndex(label) {
  const text = String(label || '').trim().toUpperCase();
  let index = 0;
  for (const char of text) {
    if (char < 'A' || char > 'Z') continue;
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function cell(rows, rowNumber, columnIndex) {
  return rows[rowNumber - 1]?.[columnIndex] ?? '';
}

function productDisplayName({ brand, model, variant }) {
  return [brand, model, variant].map(toText).filter(Boolean).join(' ');
}

function identityKey({ brand, model, variant }, includeVariant = true) {
  const parts = includeVariant ? [brand, model, variant] : [brand, model];
  return parts.map((part) => normalizeToken(part)).filter(Boolean).join('|');
}

function maxColumns(rows) {
  return rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}

function normalizeWorksheetRows(rows) {
  return rows.map((row) => {
    if (Array.isArray(row)) return row;
    if (isObject(row) && Array.isArray(row.value)) return row.value;
    return [];
  });
}

function orderedFields({ rows, fieldRules, workbookMap }) {
  const keyList = isObject(workbookMap.key_list) ? workbookMap.key_list : {};
  const keyColumn = columnLabelToIndex(keyList.column || 'B');
  const rowStart = Number(keyList.row_start || 9);
  const rowEnd = Number(keyList.row_end || rowStart);
  const fields = isObject(fieldRules.fields) ? fieldRules.fields : {};
  const result = [];

  for (let row = rowStart; row <= rowEnd; row += 1) {
    const fieldKey = normalizeToken(cell(rows, row, keyColumn)).replace(/-/g, '_');
    if (!fieldKey) continue;
    const rule = fields[fieldKey] || { field_key: fieldKey };
    const ui = isObject(rule.ui) ? rule.ui : {};
    result.push({
      field_key: fieldKey,
      row,
      label: String(ui.label || rule.display_name || fieldKey),
      group: String(ui.group || rule.group || 'Ungrouped'),
      ...fieldContract(rule),
    });
  }

  return result;
}

export function buildBenchmark({
  rows,
  fieldRules,
  workbookMap,
  category = 'mouse',
  minFilledFields = 1,
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array of worksheet rows');
  if (!isObject(fieldRules)) throw new TypeError('fieldRules must be an object');
  if (!isObject(workbookMap)) throw new TypeError('workbookMap must be an object');
  rows = normalizeWorksheetRows(rows);

  const productTable = isObject(workbookMap.product_table) ? workbookMap.product_table : {};
  const startColumn = columnLabelToIndex(productTable.value_col_start || productTable.value_start_column || 'C');
  const keyColumn = columnLabelToIndex(productTable.key_column || workbookMap.key_list?.column || 'B');
  const brandRow = Number(productTable.brand_row || 3);
  const modelRow = Number(productTable.model_row || 4);
  const variantRow = Number(productTable.variant_row || 5);
  const variantRowLabel = normalizeToken(cell(rows, variantRow, keyColumn)).replace(/-/g, '_');
  const variantRowIsBaseModel = variantRowLabel === 'base_model';
  const variantRowIsMetadata = new Set(['id', 'brand', 'model', 'base_model', 'category', 'cardtags', 'featured']).has(variantRowLabel);
  const fields = orderedFields({ rows, fieldRules, workbookMap });
  const products = [];
  const width = maxColumns(rows);

  for (let column = startColumn; column < width; column += 1) {
    const brand = normalizeSpaces(cell(rows, brandRow, column));
    const model = normalizeSpaces(cell(rows, modelRow, column));
    const variantCell = normalizeSpaces(cell(rows, variantRow, column));
    const variant = variantRowIsMetadata ? '' : variantCell;
    const baseModel = variantRowIsBaseModel ? variantCell : '';
    if (!brand && !model) continue;

    const fieldValues = {};
    for (const field of fields) {
      const raw = cell(rows, field.row, column);
      if (isUnknown(raw)) continue;
      const normalized = normalizeForCompare(raw, field);
      if (normalized === null || (Array.isArray(normalized) && normalized.length === 0)) continue;
      fieldValues[field.field_key] = {
        raw: toText(raw),
        normalized,
        label: field.label,
        group: field.group,
        type: field.type,
        shape: field.shape,
        unit: field.unit,
      };
    }

    const filledFieldCount = Object.keys(fieldValues).length;
    if (filledFieldCount < minFilledFields) continue;

    const product = { brand, model, variant };
    products.push({
      ...product,
      base_model: baseModel,
      display_name: productDisplayName(product),
      workbook_column: column + 1,
      identity_key: identityKey(product),
      identity_key_without_variant: identityKey(product, false),
      filled_field_count: filledFieldCount,
      fields: fieldValues,
    });
  }

  return {
    category,
    generated_at: new Date().toISOString(),
    field_keys: fields.map((field) => field.field_key),
    fields,
    products,
  };
}

function sortedJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

function compareNormalized(gold, actual) {
  if (gold === null && actual === null) return { status: 'blank', reason: 'both blank' };
  if (gold !== null && actual === null) return { status: 'missing', reason: 'benchmark has a value but app DB has no resolved value' };
  if (gold === null && actual !== null) return { status: 'extra', reason: 'app DB has a resolved value but benchmark is blank' };
  if (Array.isArray(gold) || Array.isArray(actual)) {
    const goldList = Array.isArray(gold) ? gold : [gold];
    const actualList = Array.isArray(actual) ? actual : [actual];
    if (sortedJson(goldList) === sortedJson(actualList)) return { status: 'correct', reason: 'normalized list match' };
    const softGold = goldList.map(softToken).sort();
    const softActual = actualList.map(softToken).sort();
    if (sortedJson(softGold) === sortedJson(softActual)) return { status: 'needs_review', reason: 'soft-normalized list match' };
    const overlap = softGold.filter((item) => softActual.includes(item));
    if (overlap.length > 0) return { status: 'needs_review', reason: 'partial list overlap' };
    return { status: 'wrong', reason: 'normalized list mismatch' };
  }
  if (typeof gold === 'number' || typeof actual === 'number') {
    const delta = Math.abs(Number(gold) - Number(actual));
    if (Number.isFinite(delta) && delta <= 0.05) return { status: 'correct', reason: 'numeric match' };
    if (Number.isFinite(delta) && delta <= 1) return { status: 'needs_review', reason: 'numeric value is within 1 unit' };
    return { status: 'wrong', reason: 'numeric mismatch' };
  }
  if (gold === actual) return { status: 'correct', reason: 'normalized scalar match' };
  if (typeof gold === 'string' && typeof actual === 'string') {
    if (gold.startsWith(actual) || actual.startsWith(gold)) {
      return { status: 'needs_review', reason: 'one normalized scalar is a prefix of the other' };
    }
    if (softToken(gold) === softToken(actual)) return { status: 'needs_review', reason: 'soft-normalized scalar match' };
  }
  return { status: 'wrong', reason: 'normalized scalar mismatch' };
}

export function buildPublishedValueMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (String(row.status || '').trim() !== 'resolved') continue;
    if (row.variant_id !== null && row.variant_id !== undefined && String(row.variant_id).trim() !== '') continue;
    const productId = String(row.product_id || '').trim();
    const fieldKey = normalizeToken(row.field_key).replace(/-/g, '_');
    if (!productId || !fieldKey) continue;
    const normalized = normalizeForCompare(row.value, { type: 'string', shape: Array.isArray(parseMaybeJson(row.value)) ? 'list' : 'scalar' });
    const entry = { ...row, field_key: fieldKey, normalized };
    if (!map.has(productId)) map.set(productId, new Map());
    const productMap = map.get(productId);
    const existing = productMap.get(fieldKey);
    const confidence = Number(row.confidence || 0);
    const existingConfidence = Number(existing?.confidence || 0);
    if (!existing || confidence > existingConfidence) productMap.set(fieldKey, entry);
  }
  return map;
}

function productIndexes(products = []) {
  const exact = new Map();
  const loose = new Map();
  for (const product of products) {
    const normalized = {
      brand: product.brand,
      model: product.model,
      variant: product.variant,
    };
    const exactKey = identityKey(normalized);
    const looseKey = identityKey(normalized, false);
    if (exactKey && !exact.has(exactKey)) exact.set(exactKey, product);
    if (looseKey && !loose.has(looseKey)) loose.set(looseKey, product);
  }
  return { exact, loose };
}

function matchProduct(benchmarkProduct, indexes) {
  const exact = indexes.exact.get(benchmarkProduct.identity_key);
  if (exact) return { product: exact, match: 'exact' };
  const loose = indexes.loose.get(benchmarkProduct.identity_key_without_variant);
  if (loose) return { product: loose, match: 'brand_model' };
  return { product: null, match: 'unmatched' };
}

function statusCounts() {
  return { correct: 0, wrong: 0, missing: 0, extra: 0, needs_review: 0, skipped: 0, unmatched_product: 0, blank: 0 };
}

function accuracy(counts) {
  const scored = counts.correct + counts.wrong + counts.missing + counts.extra + counts.needs_review;
  return scored === 0 ? 0 : Number(((counts.correct / scored) * 100).toFixed(1));
}

export function compareBenchmark({
  benchmark,
  products = [],
  published = new Map(),
  skipFieldKeys = [],
} = {}) {
  const skipSet = new Set(skipFieldKeys.map((key) => normalizeToken(key).replace(/-/g, '_')));
  const indexes = productIndexes(products);
  const summary = statusCounts();
  const byField = new Map();
  const resultProducts = [];

  for (const product of benchmark.products || []) {
    const match = matchProduct(product, indexes);
    const productCounts = statusCounts();
    const appProductId = match.product?.product_id || null;
    const appValues = appProductId ? published.get(appProductId) || new Map() : new Map();
    const cells = {};

    for (const field of benchmark.fields || []) {
      const fieldKey = field.field_key;
      if (!byField.has(fieldKey)) byField.set(fieldKey, { field_key: fieldKey, label: field.label, ...statusCounts() });
      const fieldCounts = byField.get(fieldKey);

      if (skipSet.has(fieldKey)) {
        cells[fieldKey] = { status: 'skipped', reason: 'field is reserved outside Key Finder scoring' };
        summary.skipped += 1;
        productCounts.skipped += 1;
        fieldCounts.skipped += 1;
        continue;
      }

      const gold = product.fields[fieldKey] || null;
      const actual = appValues.get(fieldKey) || null;
      if (!match.product) {
        if (!gold) continue;
        cells[fieldKey] = {
          status: 'unmatched_product',
          reason: 'benchmark product could not be matched to an app DB product',
          benchmark: gold.raw,
          app: '',
        };
        summary.unmatched_product += 1;
        productCounts.unmatched_product += 1;
        fieldCounts.unmatched_product += 1;
        continue;
      }
      if (!gold && !actual) continue;

      const actualNormalized = actual
        ? normalizeForCompare(actual.value, { type: gold?.type || field.type, shape: gold?.shape || field.shape })
        : null;
      const comparison = compareNormalized(gold?.normalized ?? null, actualNormalized);
      cells[fieldKey] = {
        status: comparison.status,
        reason: comparison.reason,
        benchmark: gold?.raw ?? '',
        benchmark_normalized: gold?.normalized ?? null,
        app: actual?.value ?? '',
        app_normalized: actualNormalized,
        app_confidence: actual?.confidence ?? null,
        app_source_type: actual?.source_type ?? '',
        app_updated_at: actual?.updated_at ?? '',
      };
      summary[comparison.status] += 1;
      productCounts[comparison.status] += 1;
      fieldCounts[comparison.status] += 1;
    }

    const scored = productCounts.correct + productCounts.wrong + productCounts.missing + productCounts.extra + productCounts.needs_review;
    resultProducts.push({
      ...product,
      app_product_id: appProductId,
      match: match.match,
      cells,
      summary: { ...productCounts, scored, accuracy: accuracy(productCounts) },
    });
  }

  const finalSummary = { ...summary, scored: summary.correct + summary.wrong + summary.missing + summary.extra + summary.needs_review };
  finalSummary.accuracy = accuracy(summary);

  return {
    category: benchmark.category,
    generated_at: new Date().toISOString(),
    summary: finalSummary,
    fields: [...byField.values()].map((field) => ({
      ...field,
      scored: field.correct + field.wrong + field.missing + field.extra + field.needs_review,
      accuracy: accuracy(field),
    })),
    products: resultProducts,
  };
}

function escapeHtml(value) {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || isObject(value)) return escapeHtml(JSON.stringify(value));
  return escapeHtml(value);
}

function renderCandidateRows(benchmark) {
  return (benchmark.products || []).map((product) => `
      <tr>
        <td>${escapeHtml(product.display_name)}</td>
        <td>${escapeHtml(product.brand)}</td>
        <td>${escapeHtml(product.model)}</td>
        <td>${escapeHtml(product.variant)}</td>
        <td class="num">${product.filled_field_count}</td>
      </tr>`).join('');
}

function renderCandidateDetail(benchmark) {
  return (benchmark.products || []).map((product) => {
    const rows = Object.entries(product.fields).map(([fieldKey, value]) => `
          <tr>
            <td>${escapeHtml(value.group)}</td>
            <td>${escapeHtml(value.label || fieldKey)}</td>
            <td>${escapeHtml(fieldKey)}</td>
            <td>${escapeHtml(value.raw)}</td>
          </tr>`).join('');
    return `
      <section>
        <h2>${escapeHtml(product.display_name)}</h2>
        <table>
          <thead><tr><th>Group</th><th>Label</th><th>Key</th><th>Benchmark Value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }).join('');
}

function renderProblemRows(product, fieldLabels) {
  const rows = Object.entries(product.cells)
    .filter(([, cell]) => ['wrong', 'missing', 'needs_review', 'extra', 'unmatched_product'].includes(cell.status))
    .map(([fieldKey, cell]) => `
          <tr>
            <td><span class="pill ${escapeHtml(cell.status)}">${escapeHtml(cell.status)}</span></td>
            <td>${escapeHtml(fieldLabels.get(fieldKey) || fieldKey)}</td>
            <td>${escapeHtml(fieldKey)}</td>
            <td>${htmlValue(cell.benchmark)}</td>
            <td>${htmlValue(cell.app)}</td>
            <td>${escapeHtml(cell.reason)}</td>
          </tr>`);

  if (rows.length === 0) {
    return '<p class="row-details-empty">No wrong, missing, or needs-review cells for this product.</p>';
  }

  return `
        <table class="row-details-table">
          <thead><tr><th>Status</th><th>Label</th><th>Key</th><th>Benchmark</th><th>App DB</th><th>Reason</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>`;
}

function renderProductRowDetails(product, fieldLabels) {
  const count = product.summary.wrong
    + product.summary.missing
    + product.summary.needs_review
    + product.summary.extra
    + product.summary.unmatched_product;
  const summary = count > 0 ? `Show problem cells (${count})` : 'No problem cells';
  return `
          <details class="row-details">
            <summary>${escapeHtml(summary)}</summary>
            ${renderProblemRows(product, fieldLabels)}
          </details>`;
}

function renderScorecard(scorecard, benchmark) {
  if (!scorecard) return '';
  const fieldLabels = new Map((benchmark.fields || []).map((field) => [field.field_key, field.label]));
  const productRows = (scorecard.products || []).map((product) => `
      <tr>
        <td>${escapeHtml(product.display_name)}</td>
        <td>${escapeHtml(product.app_product_id || '')}</td>
        <td>${escapeHtml(product.match)}</td>
        <td class="num">${product.summary.accuracy}%</td>
        <td class="ok num">${product.summary.correct}</td>
        <td class="bad num">${product.summary.wrong}</td>
        <td class="miss num">${product.summary.missing}</td>
        <td class="review num">${product.summary.needs_review}</td>
        <td>${renderProductRowDetails(product, fieldLabels)}</td>
      </tr>`).join('');
  const fieldRows = (scorecard.fields || []).map((field) => `
      <tr>
        <td>${escapeHtml(field.label || field.field_key)}</td>
        <td>${escapeHtml(field.field_key)}</td>
        <td class="num">${field.accuracy}%</td>
        <td class="ok num">${field.correct}</td>
        <td class="bad num">${field.wrong}</td>
        <td class="miss num">${field.missing}</td>
        <td class="review num">${field.needs_review}</td>
      </tr>`).join('');
  return `
    <section class="summary">
      <div><strong>Accuracy</strong><span>${scorecard.summary.accuracy}%</span></div>
      <div><strong>Correct</strong><span>${scorecard.summary.correct}</span></div>
      <div><strong>Wrong</strong><span>${scorecard.summary.wrong}</span></div>
      <div><strong>Missing</strong><span>${scorecard.summary.missing}</span></div>
      <div><strong>Needs Review</strong><span>${scorecard.summary.needs_review}</span></div>
      <div><strong>Unmatched Product</strong><span>${scorecard.summary.unmatched_product}</span></div>
    </section>
    <section>
      <h2>Product Scores</h2>
      <table>
        <thead><tr><th>Benchmark Product</th><th>App Product ID</th><th>Match</th><th>Accuracy</th><th>Correct</th><th>Wrong</th><th>Missing</th><th>Needs Review</th><th>Details</th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Key Scores</h2>
      <table>
        <thead><tr><th>Label</th><th>Key</th><th>Accuracy</th><th>Correct</th><th>Wrong</th><th>Missing</th><th>Needs Review</th></tr></thead>
        <tbody>${fieldRows}</tbody>
      </table>
    </section>`;
}

export function htmlReport({ title, benchmark, scorecard = null } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || 'Key Finder Benchmark')}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #f7f8fb; color: #182230; }
    header { background: #182230; color: white; padding: 24px 32px; }
    main { padding: 24px 32px 48px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    p { margin: 0; color: #d9e2f2; }
    table { width: 100%; border-collapse: collapse; background: white; margin-bottom: 18px; }
    th, td { border: 1px solid #d7dce5; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #eef2f7; font-weight: 700; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .summary div { background: white; border: 1px solid #d7dce5; padding: 14px; }
    .summary strong { display: block; color: #526071; font-size: 12px; text-transform: uppercase; }
    .summary span { display: block; margin-top: 6px; font-size: 24px; font-weight: 700; }
    .ok { color: #126b3a; } .bad { color: #a72020; } .miss { color: #915d00; } .review { color: #6f3da8; }
    .pill { display: inline-block; border-radius: 4px; padding: 2px 6px; font-size: 12px; font-weight: 700; background: #eef2f7; }
    .row-details summary { cursor: pointer; font-weight: 700; color: #1f4f82; }
    .row-details[open] summary { margin-bottom: 8px; }
    .row-details-table { margin: 0; }
    .row-details-table th, .row-details-table td { font-size: 12px; }
    .row-details-empty { color: #526071; margin: 8px 0 0; }
    .wrong { background: #ffe4e4; color: #8b1b1b; } .missing { background: #fff0d6; color: #774b00; }
    .needs_review { background: #eee5ff; color: #58308b; } .unmatched_product { background: #e9eef5; color: #334155; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title || 'Key Finder Benchmark')}</h1>
    <p>${escapeHtml(benchmark?.category || '')} · generated ${escapeHtml(scorecard?.generated_at || benchmark?.generated_at || '')}</p>
  </header>
  <main>
    ${scorecard ? renderScorecard(scorecard, benchmark) : `
      <section class="summary">
        <div><strong>Products</strong><span>${benchmark.products?.length || 0}</span></div>
        <div><strong>Keys</strong><span>${benchmark.field_keys?.length || 0}</span></div>
      </section>
      <section>
        <h2>Comparison Candidates</h2>
        <table>
          <thead><tr><th>Product</th><th>Brand</th><th>Model</th><th>Variant</th><th>Filled Fields</th></tr></thead>
          <tbody>${renderCandidateRows(benchmark)}</tbody>
        </table>
      </section>
      ${renderCandidateDetail(benchmark)}
    `}
  </main>
</body>
</html>`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readDb({ dbPath, category }) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const products = db.prepare(
      `SELECT product_id, brand, model, variant, status
       FROM products
       WHERE category = ? AND status = 'active'
       ORDER BY brand, model, variant`
    ).all(category);
    const rows = db.prepare(
      `SELECT product_id, field_key, value, unit, confidence, source_type, source_id, model,
              validation_json, metadata_json, status, variant_id, submitted_at, updated_at
       FROM field_candidates
       WHERE category = ? AND status = 'resolved'
       ORDER BY product_id, field_key, confidence DESC, updated_at DESC`
    ).all(category);
    return { products, rows };
  } finally {
    db.close();
  }
}

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasArg(args, name) {
  return args.includes(name);
}

export async function runCli(argv = process.argv.slice(2)) {
  const category = argValue(argv, '--category', 'mouse');
  const repoRoot = process.cwd();
  const reportRoot = path.resolve(repoRoot, '.workspace', 'reports', category);
  const outputRoot = path.resolve(argValue(argv, '--out', path.join(reportRoot, 'key-finder-benchmark')));
  const sheetJson = path.resolve(argValue(argv, '--sheet-json', path.join(outputRoot, 'workbook-dataEntry.json')));
  const workbookPath = path.resolve(argValue(argv, '--workbook', path.join(reportRoot, 'mouseData.xlsm')));
  const dbPath = path.resolve(argValue(argv, '--db', path.join(repoRoot, '.workspace', 'db', category, 'spec.sqlite')));
  const fieldRulesPath = path.resolve(argValue(argv, '--field-rules', path.join(repoRoot, 'category_authority', category, '_generated', 'field_rules.json')));
  const workbookMapPath = path.resolve(argValue(argv, '--workbook-map', path.join(repoRoot, 'category_authority', category, '_control_plane', 'field_studio_map.json')));
  const minFilledFields = Number(argValue(argv, '--min-filled', '10'));
  const skipReserved = !hasArg(argv, '--score-reserved');

  await fs.mkdir(outputRoot, { recursive: true });
  const rows = await readJson(sheetJson);
  const fieldRules = await readJson(fieldRulesPath);
  const workbookMap = await readJson(workbookMapPath);
  const benchmark = buildBenchmark({ rows, fieldRules, workbookMap, category, minFilledFields });
  benchmark.source = {
    workbook_path: workbookPath,
    sheet_json: sheetJson,
    db_path: dbPath,
    min_filled_fields: minFilledFields,
  };

  const { products, rows: publishedRows } = readDb({ dbPath, category });
  const published = buildPublishedValueMap(publishedRows);
  const scorecard = compareBenchmark({
    benchmark,
    products,
    published,
    skipFieldKeys: skipReserved ? DEFAULT_RESERVED_KEY_FINDER_KEYS : [],
  });

  const benchmarkJson = path.join(outputRoot, 'benchmark-source.json');
  const candidatesHtml = path.join(outputRoot, 'benchmark-candidates.html');
  const scorecardJson = path.join(outputRoot, 'scorecard.json');
  const scorecardHtml = path.join(outputRoot, 'scorecard.html');

  await writeJson(benchmarkJson, benchmark);
  await fs.writeFile(candidatesHtml, htmlReport({ title: 'Key Finder Benchmark Candidates', benchmark }), 'utf8');
  await writeJson(scorecardJson, scorecard);
  await fs.writeFile(scorecardHtml, htmlReport({ title: 'Key Finder Benchmark Scorecard', benchmark, scorecard }), 'utf8');

  return { outputRoot, benchmarkJson, candidatesHtml, scorecardJson, scorecardHtml, summary: scorecard.summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli()
    .then((result) => {
      console.log(`Wrote benchmark reports to ${result.outputRoot}`);
      console.log(`Accuracy: ${result.summary.accuracy}% (${result.summary.correct}/${result.summary.scored})`);
      console.log(`Open: ${result.scorecardHtml}`);
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
