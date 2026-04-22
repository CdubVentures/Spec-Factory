// ── Review Grid Helpers ─────────────────────────────────────────────
//
// Private helpers for reviewGridData.js / overrideHelpers / routes:
// number parsing, file I/O, field studio hints, contract normalization,
// flag inference, source labels.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ruleRequiredLevel } from '../../../engine/ruleAccessors.js';
import {
  isObject,
  normalizeToken,
  normalizeField,
  normalizePathToken,
} from './reviewNormalization.js';
import {
  isKnownSlotValue,
} from '../../../utils/slotValueShape.js';

// ── Number Parsing ──────────────────────────────────────────────────

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// toNumber consolidated into reviewNormalization.js — import from there

export function hasKnownValue(value) {
  return isKnownSlotValue(value, 'scalar') || isKnownSlotValue(value, 'list');
}

// ── File I/O ────────────────────────────────────────────────────────

export function resolveOverrideFilePath({ config = {}, category, productId }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  return path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
}

export async function readOverrideFile(filePath, { config, category, productId } = {}) {
  // WHY: Overlap 0d — try consolidated file first when context is available
  if (config && category && productId) {
    try {
      const { readProductFromConsolidated } = await import('../../../shared/consolidatedOverrides.js');
      const entry = await readProductFromConsolidated({ config, category, productId });
      if (entry) return entry;
    } catch { /* consolidated read failed — fall through to per-product file */ }
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (isObject(parsed)) return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}

// ── Field Studio ────────────────────────────────────────────────────

export function parseFieldStudioRowFromCell(cell) {
  const text = String(cell || '').trim().toUpperCase();
  const match = text.match(/[A-Z]+(\d+)/);
  if (!match) {
    return null;
  }
  const row = Number.parseInt(match[1], 10);
  return Number.isFinite(row) ? row : null;
}

export function extractFieldStudioHints(rule = {}) {
  const blocks = [
    rule.field_studio_hints,
    rule.field_studio
  ].filter(isObject);
  for (const block of blocks) {
    for (const key of ['dataEntry', 'dataentry', 'source']) {
      if (isObject(block[key])) {
        return block[key];
      }
    }
    if (isObject(block.data) && isObject(block.data.dataEntry)) {
      return block.data.dataEntry;
    }
    if (isObject(block.default)) {
      return block.default;
    }
  }
  return {};
}

// ── Storage Keys ────────────────────────────────────────────────────

export function reviewKeys(storage, category, productId) {
  const reviewBase = ['final', normalizePathToken(category), normalizePathToken(productId), 'review'].join('/');
  const legacyReviewBase = storage.resolveOutputKey(category, productId, 'review');
  return {
    reviewBase,
    legacyReviewBase,
    candidatesKey: `${reviewBase}/candidates.json`,
    legacyCandidatesKey: `${legacyReviewBase}/candidates.json`,
    productKey: `${reviewBase}/product.json`,
    legacyProductKey: `${legacyReviewBase}/product.json`
  };
}

// ── Field Contract ──────────────────────────────────────────────────

export function normalizeFieldContract(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  const level = ruleRequiredLevel(rule);
  const comp = isObject(rule.component) ? rule.component : null;
  const enu = isObject(rule.enum) ? rule.enum : null;
  const evidence = isObject(rule.evidence) ? rule.evidence : {};
  return {
    type: String(contract.type || 'string'),
    shape: String(contract.shape || 'scalar').trim().toLowerCase() || 'scalar',
    required: level === 'mandatory',
    units: contract.unit || null,
    component_type: comp?.type || null,
    enum_source: enu?.source || null,
    min_evidence_refs: toInt(evidence.min_evidence_refs, 1),
  };
}

// ── Storage Write ───────────────────────────────────────────────────

export async function writeJson(storage, key, value) {
  await storage.writeObject(
    key,
    Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}

// ── Source Labels ───────────────────────────────────────────────────

export function dbSourceLabel(source) {
  const token = normalizeToken(source);
  if (token === 'component_db' || token === 'known_values' || token === 'reference') return 'Reference';
  if (token === 'pipeline') return 'Pipeline';
  if (token === 'user') return 'user';
  return String(source || '').trim();
}

