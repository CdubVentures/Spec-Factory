import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { nowIso, buildProductId } from '../shared/primitives.js';
import { upsertQueueProduct } from '../queue/queueState.js';
import { slugify as canonicalSlugify } from '../features/catalog/identity/slugify.js';
import { loadCatalogProductsWithFields } from '../features/catalog/products/catalogProductLoader.js';
import {
  evaluateIdentityGate,
  loadCanonicalIdentityIndex,
  registerCanonicalIdentity
} from '../features/catalog/identity/identityGate.js';
import { isObject, toArray, normalizeFieldKey, normalizeText } from '../shared/primitives.js';

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isIdentityLikeField(field) {
  return new Set(['id', 'brand', 'model', 'base_model', 'category', 'sku']).has(String(field || '').trim());
}

function slug(value) {
  return canonicalSlugify(value);
}

function parseRowRange(value) {
  const text = String(value || '').trim();
  const match = text.match(/^([A-Za-z]+)(\d+)\s*:\s*([A-Za-z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  if (String(match[1]).toUpperCase() !== String(match[3]).toUpperCase()) {
    return null;
  }
  const start = Number.parseInt(match[2], 10);
  const end = Number.parseInt(match[4], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return {
    column: String(match[1]).toUpperCase(),
    start,
    end
  };
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

function xmlText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => xmlText(entry)).join('');
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '#text')) {
      return String(value['#text'] ?? '');
    }
    if (Object.prototype.hasOwnProperty.call(value, 't')) {
      return xmlText(value.t);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'r')) {
      return asArray(value.r)
        .map((entry) => xmlText(entry?.t ?? entry?.['#text'] ?? ''))
        .join('');
    }
  }
  return '';
}

function colToIndex(column) {
  const text = String(column || '').trim().toUpperCase();
  if (!text) {
    throw new Error('invalid_column');
  }
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) {
      throw new Error(`invalid_column:${column}`);
    }
    total = (total * 26) + (code - 64);
  }
  if (total <= 0) {
    throw new Error(`invalid_column:${column}`);
  }
  return total;
}

function indexToCol(index) {
  let value = Number.parseInt(String(index), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid_column_index:${index}`);
  }
  let out = '';
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function splitCellRef(ref) {
  const match = String(ref || '').trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) {
    throw new Error(`invalid_cell_ref:${ref}`);
  }
  return {
    column: String(match[1]).toUpperCase(),
    row: Number.parseInt(match[2], 10)
  };
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - (0xffff + 22));
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }
  return -1;
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error('zip_eocd_not_found');
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`zip_central_directory_invalid:${cursor}`);
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength);
    entries.set(fileName, {
      fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset
    });
    cursor += (46 + fileNameLength + extraLength + commentLength);
  }
  return entries;
}

function readZipEntryBuffer(sourceBuffer, zipEntry) {
  const localHeaderOffset = zipEntry.localHeaderOffset;
  if (sourceBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error(`zip_local_header_invalid:${zipEntry.fileName}`);
  }
  const fileNameLength = sourceBuffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = sourceBuffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedBuffer = sourceBuffer.subarray(dataStart, dataStart + zipEntry.compressedSize);
  if (zipEntry.compressionMethod === 0) {
    return compressedBuffer;
  }
  if (zipEntry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressedBuffer);
  }
  throw new Error(`zip_compression_unsupported:${zipEntry.compressionMethod}`);
}

function readZipEntryText(sourceBuffer, entries, entryName) {
  const entry = entries.get(entryName);
  if (!entry) {
    return null;
  }
  return readZipEntryBuffer(sourceBuffer, entry).toString('utf8');
}

function parseXml(text) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    textNodeName: '#text',
    trimValues: false,
    parseTagValue: false
  });
  return parser.parse(String(text || ''));
}

function normalizeSheetTarget(value) {
  let token = String(value || '').trim().replace(/\\/g, '/');
  if (!token) {
    return '';
  }
  if (token.startsWith('/')) {
    token = token.slice(1);
  }
  if (!token.startsWith('xl/')) {
    token = `xl/${token}`;
  }
  return token;
}

function loadSourceSheetPath({ sourceBuffer, entries, sheet }) {
  const sourceManifestXml = readZipEntryText(sourceBuffer, entries, 'xl/workbook.xml');
  if (!sourceManifestXml) {
    throw new Error('source_manifest_xml_missing');
  }
  const relsXml = readZipEntryText(sourceBuffer, entries, 'xl/_rels/workbook.xml.rels');
  if (!relsXml) {
    throw new Error('source_manifest_rels_missing');
  }
  const sourceManifestDoc = parseXml(sourceManifestXml);
  const relsDoc = parseXml(relsXml);

  const relationships = new Map();
  for (const rel of asArray(relsDoc?.Relationships?.Relationship)) {
    const relId = String(rel?.Id || '').trim();
    const target = normalizeSheetTarget(rel?.Target || '');
    if (!relId || !target) {
      continue;
    }
    relationships.set(relId, target);
  }

  const sheets = asArray(sourceManifestDoc?.workbook?.sheets?.sheet);
  const targetSheet = sheets.find((row) => String(row?.name || '') === String(sheet || ''))
    || sheets.find((row) => String(row?.name || '').toLowerCase() === String(sheet || '').toLowerCase());
  if (!targetSheet) {
    const sheetNames = sheets
      .map((row) => String(row?.name || '').trim())
      .filter(Boolean);
    throw new Error(`sheet_not_found:${sheet}:${sheetNames.join(',')}`);
  }

  const relId = String(targetSheet?.id || '').trim();
  const sheetPath = relationships.get(relId);
  if (!sheetPath) {
    throw new Error(`sheet_relationship_missing:${sheet}`);
  }
  return sheetPath;
}

function loadSharedStrings({ sourceBuffer, entries }) {
  const sharedXml = readZipEntryText(sourceBuffer, entries, 'xl/sharedStrings.xml');
  if (!sharedXml) {
    return [];
  }
  const sharedDoc = parseXml(sharedXml);
  return asArray(sharedDoc?.sst?.si).map((entry) => xmlText(entry).trim());
}

function loadSheetCellMap({ sourceBuffer, entries, sheetPath, sharedStrings }) {
  const sheetXml = readZipEntryText(sourceBuffer, entries, sheetPath);
  if (!sheetXml) {
    throw new Error(`sheet_xml_missing:${sheetPath}`);
  }
  const sheetDoc = parseXml(sheetXml);
  const cells = new Map();
  for (const row of asArray(sheetDoc?.worksheet?.sheetData?.row)) {
    for (const cell of asArray(row?.c)) {
      const ref = String(cell?.r || '').trim().toUpperCase();
      if (!ref) {
        continue;
      }
      let value = '';
      if (cell?.is !== undefined) {
        value = xmlText(cell.is);
      } else if (cell?.v !== undefined) {
        const rawValue = xmlText(cell.v);
        if (String(cell?.t || '').trim() === 's') {
          const idx = Number.parseInt(rawValue, 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length) {
            value = sharedStrings[idx];
          } else {
            value = rawValue;
          }
        } else {
          value = rawValue;
        }
      }
      const normalized = String(value || '').trim();
      if (!normalized) {
        continue;
      }
      cells.set(ref, normalized);
    }
  }
  return cells;
}

function buildFieldStudioPayloadFromCells({
  cells,
  fieldLabelColumn,
  fieldRowStart,
  fieldRowEnd,
  brandRow,
  modelRow,
  variantRow,
  dataColumnStart,
  dataColumnEnd
}) {
  const fieldRows = [];
  for (let rowIndex = fieldRowStart; rowIndex <= fieldRowEnd; rowIndex += 1) {
    const label = String(cells.get(`${fieldLabelColumn}${rowIndex}`) || '').trim();
    if (!label) {
      continue;
    }
    fieldRows.push({
      row: rowIndex,
      label
    });
  }

  if (!fieldRows.length) {
    return {
      field_rows: [],
      products: []
    };
  }

  let maxColumnSeen = colToIndex(dataColumnStart);
  for (const ref of cells.keys()) {
    try {
      const split = splitCellRef(ref);
      maxColumnSeen = Math.max(maxColumnSeen, colToIndex(split.column));
    } catch {
      continue;
    }
  }

  const startColumn = colToIndex(dataColumnStart);
  let endColumn = dataColumnEnd ? colToIndex(dataColumnEnd) : maxColumnSeen;
  endColumn = Math.max(startColumn, Math.min(endColumn, maxColumnSeen));

  const products = [];
  for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
    const column = indexToCol(columnIndex);
    const brand = String(cells.get(`${column}${brandRow}`) || '').trim();
    const model = String(cells.get(`${column}${modelRow}`) || '').trim();
    if (!brand && !model) {
      continue;
    }
    const variant = variantRow > 0
      ? String(cells.get(`${column}${variantRow}`) || '').trim()
      : '';
    const valuesByLabel = {};
    for (const row of fieldRows) {
      valuesByLabel[row.label] = String(cells.get(`${column}${row.row}`) || '').trim();
    }
    products.push({
      column,
      brand,
      model,
      variant,
      values_by_label: valuesByLabel
    });
  }

  return {
    field_rows: fieldRows,
    products
  };
}

function extractFieldStudioPayloadWithNode({
  fieldStudioSourcePath,
  sheet,
  fieldLabelColumn,
  fieldRowStart,
  fieldRowEnd,
  brandRow,
  modelRow,
  variantRow,
  dataColumnStart,
  dataColumnEnd
}) {
  const sourceBuffer = fsSync.readFileSync(fieldStudioSourcePath);
  const entries = readZipEntries(sourceBuffer);
  const sheetPath = loadSourceSheetPath({
    sourceBuffer: sourceBuffer,
    entries,
    sheet
  });
  const sharedStrings = loadSharedStrings({
    sourceBuffer: sourceBuffer,
    entries
  });
  const cells = loadSheetCellMap({
    sourceBuffer: sourceBuffer,
    entries,
    sheetPath,
    sharedStrings
  });
  return buildFieldStudioPayloadFromCells({
    cells,
    fieldLabelColumn,
    fieldRowStart,
    fieldRowEnd,
    brandRow,
    modelRow,
    variantRow,
    dataColumnStart,
    dataColumnEnd
  });
}


function helperCategoryDir({ category, config = {} }) {
  return path.resolve(config.categoryAuthorityRoot || 'category_authority', category);
}

export function fieldRulesPathCandidates({ category, config = {} }) {
  return [
    path.join(helperCategoryDir({ category, config }), '_generated', 'field_rules.json')
  ];
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveFieldStudioSourcePath({ category, config = {}, fieldRules = {} }) {
  const fieldStudioSource = isObject(fieldRules.field_studio_source) ? fieldRules.field_studio_source : {};
  const configured = String(
    fieldRules.field_studio_source_path
    || fieldStudioSource.path
    || ''
  ).trim();
  if (configured) {
    if (path.isAbsolute(configured)) {
      return configured;
    }
    return path.resolve(helperCategoryDir({ category, config }), configured);
  }
  return '';
}

function resolveFieldStudioSourceConfig({ category, config = {}, fieldRules = {} }) {
  const layout = isObject(fieldRules.field_studio_layout) ? fieldRules.field_studio_layout : {};
  const schema = isObject(fieldRules.schema) ? fieldRules.schema : {};
  const explicitRange = parseRowRange(
    layout.field_rows_range ||
    schema.field_rows_range ||
    ''
  );
  const rowStart = explicitRange?.start || asInt(layout.field_row_start, 9);
  const rowEnd = explicitRange?.end || asInt(layout.field_row_end, 83);
  const labelColumn = explicitRange?.column || String(layout.field_label_column || 'B').toUpperCase();
  return {
    fieldStudioSourcePath: resolveFieldStudioSourcePath({ category, config, fieldRules }),
    sheet: String(layout.sheet || 'dataEntry').trim() || 'dataEntry',
    fieldLabelColumn: labelColumn,
    fieldRowStart: rowStart,
    fieldRowEnd: rowEnd,
    brandRow: asInt(layout.brand_row, 3),
    modelRow: asInt(layout.model_row, 4),
    variantRow: asInt(layout.variant_row, 5),
    dataColumnStart: String(layout.data_column_start || 'C').toUpperCase(),
    dataColumnEnd: String(layout.data_column_end || '').toUpperCase()
  };
}

function normalizeFieldLabelMap(fieldRules = {}) {
  const out = {};
  const candidates = [
    fieldRules.field_map,
    fieldRules.label_to_field,
    fieldRules.field_aliases
  ];
  for (const source of candidates) {
    if (!isObject(source)) {
      continue;
    }
    for (const [label, field] of Object.entries(source)) {
      const l = normalizeFieldKey(label);
      const f = normalizeFieldKey(field);
      if (!l || !f) {
        continue;
      }
      out[l] = f;
    }
  }
  return out;
}

function normalizeFieldRows({ rows = [], fieldRules = {} }) {
  const labelMap = normalizeFieldLabelMap(fieldRules);
  return toArray(rows)
    .map((row) => {
      const label = normalizeText(row?.label);
      const labelKey = normalizeFieldKey(label);
      const mapped = labelMap[labelKey] || labelKey;
      return {
        row: asInt(row?.row, 0),
        label,
        field: mapped
      };
    })
    .filter((row) => row.row > 0 && row.label && row.field);
}

function normalizeProductRows({
  rows = [],
  fieldRows = [],
  category,
  fieldOrder = [],
  fieldRules = {}
}) {
  const fieldSet = new Set(fieldOrder || []);
  const exclude = new Set(
    toArray(fieldRules?.schema?.exclude_fields)
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const products = [];
  for (const row of toArray(rows)) {
    const brand = normalizeText(row?.brand);
    const model = normalizeText(row?.model);
    if (!brand || !model) {
      continue;
    }
    const variant = normalizeText(row?.variant);
    const valuesByLabel = isObject(row?.values_by_label) ? row.values_by_label : {};
    const canonicalFields = {};
    for (const fieldRow of fieldRows) {
      const field = normalizeFieldKey(fieldRow.field);
      if (!field || isIdentityLikeField(field) || exclude.has(field)) {
        continue;
      }
      if (fieldSet.size > 0 && !fieldSet.has(field)) {
        continue;
      }
      const value = normalizeText(valuesByLabel[fieldRow.label]);
      if (!value) {
        continue;
      }
      canonicalFields[field] = value;
    }
    const sourceColumn = normalizeText(row?.column || '');
    products.push({
      source_column: sourceColumn,
      brand,
      model,
      variant,
      category,
      canonical_fields: canonicalFields
    });
  }
  return products;
}

export async function loadGeneratedFieldRules(category, config = {}) {
  for (const filePath of fieldRulesPathCandidates({ category, config })) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        file_path: filePath,
        value: isObject(parsed) ? parsed : {}
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
  return null;
}

function buildCatalogFieldRows({
  fieldRules = {},
  fieldOrder = []
}) {
  const ruleFields = isObject(fieldRules?.fields) ? fieldRules.fields : {};
  const fieldSet = new Set(
    (fieldOrder.length > 0 ? fieldOrder : Object.keys(ruleFields))
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const rows = [];
  let rowIndex = 1;
  for (const field of fieldSet) {
    if (isIdentityLikeField(field)) {
      continue;
    }
    rows.push({
      row: rowIndex,
      label: field,
      field
    });
    rowIndex += 1;
  }
  return rows;
}

function normalizeCatalogSeedProducts({
  category,
  rows = [],
  fieldRules = {},
  fieldOrder = []
}) {
  const normalizedCategory = normalizeText(category).toLowerCase();
  const fieldSet = new Set(
    toArray(fieldOrder)
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const exclude = new Set(
    toArray(fieldRules?.schema?.exclude_fields)
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const products = [];
  for (const row of toArray(rows)) {
    const brand = normalizeText(row?.brand);
    const baseModel = normalizeText(row?.base_model);
    const model = normalizeText(row?.model);
    if (!brand || !model) {
      continue;
    }
    const variant = normalizeText(row?.variant);
    const canonicalFieldsIn = isObject(row?.canonical_fields) ? row.canonical_fields : {};
    const canonicalFields = {};
    for (const [rawKey, rawValue] of Object.entries(canonicalFieldsIn)) {
      const key = normalizeFieldKey(rawKey);
      if (!key || isIdentityLikeField(key) || exclude.has(key)) {
        continue;
      }
      if (fieldSet.size > 0 && !fieldSet.has(key)) {
        continue;
      }
      const value = normalizeText(rawValue);
      if (!value) {
        continue;
      }
      canonicalFields[key] = value;
    }
    products.push({
      source_column: '',
      brand,
      base_model: baseModel,
      model,
      variant,
      category: normalizedCategory,
      canonical_fields: canonicalFields
    });
  }
  return products;
}

export async function extractCatalogSeedData({
  category,
  config = {},
  fieldRules = {},
  fieldOrder = []
}) {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (!normalizedCategory) {
    return {
      enabled: false,
      catalog_path: null,
      field_studio_source_path: '',
      sheet: '',
      field_rows: [],
      products: [],
      error: 'category_required',
      parser: 'catalog'
    };
  }

  const catalogPath = path.join(
    helperCategoryDir({ category: normalizedCategory, config }),
    '_control_plane',
    'product_catalog.json'
  );
  if (!(await fileExists(catalogPath))) {
    return {
      enabled: false,
      catalog_path: catalogPath,
      field_studio_source_path: '',
      sheet: '',
      field_rows: [],
      products: [],
      error: 'catalog_not_found',
      parser: 'catalog'
    };
  }

  const sourceRows = await loadCatalogProductsWithFields({
    category: normalizedCategory,
    config
  });
  const fieldRows = buildCatalogFieldRows({
    fieldRules,
    fieldOrder
  });
  const products = normalizeCatalogSeedProducts({
    category: normalizedCategory,
    rows: sourceRows,
    fieldRules,
    fieldOrder,
  });
  if (products.length === 0) {
    return {
      enabled: false,
      catalog_path: catalogPath,
      field_studio_source_path: '',
      sheet: '',
      field_rows: fieldRows,
      products: [],
      error: 'catalog_empty',
      parser: 'catalog'
    };
  }

  return {
    enabled: true,
    catalog_path: catalogPath,
    field_studio_source_path: '',
    sheet: '',
    field_rows: fieldRows,
    products,
    error: null,
    parser: 'catalog'
  };
}

export function buildFieldOrderFromCatalogSeed({
  fieldRows = [],
  fieldRules = {},
  existingFieldOrder = []
}) {
  const includeExtras = new Set(
    toArray(fieldRules?.schema?.include_fields)
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const exclude = new Set(
    toArray(fieldRules?.schema?.exclude_fields || ['id', 'brand', 'model', 'base_model', 'category', 'sku'])
      .map((field) => normalizeFieldKey(field))
      .filter(Boolean)
  );
  const preserveExistingFields = fieldRules?.schema?.preserve_existing_fields !== false;
  const seen = new Set();
  const out = [];
  for (const row of toArray(fieldRows)) {
    const field = normalizeFieldKey(row?.field);
    if (!field || isIdentityLikeField(field) || exclude.has(field)) {
      continue;
    }
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    out.push(field);
  }

  const appendFields = (values = []) => {
    for (const value of values) {
      const field = normalizeFieldKey(value);
      if (!field || isIdentityLikeField(field) || exclude.has(field)) {
        continue;
      }
      if (seen.has(field)) {
        continue;
      }
      seen.add(field);
      out.push(field);
    }
  };

  appendFields([...includeExtras]);
  if (preserveExistingFields) {
    appendFields(toArray(existingFieldOrder));
  }
  return out;
}

export async function syncJobsFromCatalogSeed({
  storage,
  config,
  category,
  fieldOrder = [],
  fieldRules = {},
  limit = 0,
  specDb = null,
}) {
  const extracted = await extractCatalogSeedData({
    category,
    config,
    fieldRules,
    fieldOrder
  });
  if (!extracted.enabled) {
    return {
      enabled: false,
      category,
      catalog_path: extracted.catalog_path || null,
      field_studio_source_path: extracted.field_studio_source_path || null,
      error: extracted.error || null,
      created: 0,
      skipped_existing: 0,
      products_seen: 0
    };
  }

  const selected = limit > 0 ? extracted.products.slice(0, limit) : extracted.products;
  const canonicalIndex = await loadCanonicalIdentityIndex({ config, category, specDb });
  let created = 0;
  let skippedExisting = 0;
  let skippedIdentityGate = 0;

  for (const product of selected) {
    const gate = evaluateIdentityGate({
      category,
      brand: product.brand,
      model: product.base_model,
      variant: product.variant,
      canonicalIndex
    });
    if (!gate.valid) {
      skippedIdentityGate += 1;
      continue;
    }

    const identity = gate.normalized;
    // WHY: Check canonical index for existing product before generating new hex ID.
    // gate.canonicalProductId is the real catalog key when identity exists in the index.
    const checkPid = gate.canonicalProductId;
    if (checkPid && specDb) {
      const existing = specDb.getProduct(checkPid);
      if (existing) {
        skippedExisting += 1;
        continue;
      }
    }
    // WHY: Reuse canonical pid when available — only generate fresh for truly new products.
    const productId = checkPid || buildProductId(category);
    registerCanonicalIdentity({
      canonicalIndex,
      brand: identity.brand,
      model: identity.model,
      variant: identity.variant,
      productId
    });

    await upsertQueueProduct({
      storage,
      category,
      productId,
      s3key: '',
      specDb,
      patch: {
        status: 'pending',
        next_action_hint: 'fast_pass'
      }
    });
    created += 1;
  }

  return {
    enabled: true,
    category,
    catalog_path: extracted.catalog_path || null,
    field_studio_source_path: extracted.field_studio_source_path,
    products_seen: extracted.products.length,
    created,
    skipped_existing: skippedExisting,
    skipped_identity_gate: skippedIdentityGate,
    field_count: extracted.field_rows.length
  };
}

export async function loadCategoryFieldRules(category, config = {}) {
  return loadGeneratedFieldRules(category, config);
}

