import fs from 'node:fs';
import path from 'node:path';

import { normalizeKnownValueMatchKey } from '../../../shared/primitives.js';

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function productJsonPath(productRoot, productId) {
  return path.join(productRoot, productId, 'product.json');
}

function publishedValue(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value;
  }
  return entry;
}

function replacePublishedValue(entry, oldValue, newValue) {
  if (normalizeKnownValueMatchKey(publishedValue(entry)) !== normalizeKnownValueMatchKey(oldValue)) {
    return { changed: false, entry };
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return { changed: true, entry: { ...entry, value: newValue } };
  }
  return { changed: true, entry: newValue };
}

function linkedProductRows(linkedProducts = []) {
  const seen = new Set();
  const rows = [];
  for (const linkedProduct of linkedProducts) {
    const productId = String(linkedProduct?.product_id || linkedProduct?.productId || '').trim();
    const fieldKey = String(linkedProduct?.field_key || linkedProduct?.fieldKey || '').trim();
    if (!productId || !fieldKey) continue;
    const key = `${productId}::${fieldKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ productId, fieldKey });
  }
  return rows;
}

function updateField({ productJson, fieldKey, oldValue, newValue }) {
  if (!productJson?.fields || !Object.prototype.hasOwnProperty.call(productJson.fields, fieldKey)) {
    return false;
  }
  const replaced = replacePublishedValue(productJson.fields[fieldKey], oldValue, newValue);
  if (!replaced.changed) return false;
  productJson.fields[fieldKey] = replaced.entry;
  return true;
}

export function renamePublishedComponentIdentityFields({
  productRoot,
  linkedProducts = [],
  oldName,
  oldMaker,
  nextName,
  nextMaker,
}) {
  const root = String(productRoot || '').trim();
  if (!root) return { renamed: 0, affected: [] };

  const affected = [];
  for (const row of linkedProductRows(linkedProducts)) {
    const filePath = productJsonPath(root, row.productId);
    const productJson = safeReadJson(filePath);
    if (!productJson) continue;

    const renamedName = oldName !== nextName
      ? updateField({
          productJson,
          fieldKey: row.fieldKey,
          oldValue: oldName,
          newValue: nextName,
        })
      : false;
    const renamedMaker = oldMaker !== nextMaker
      ? updateField({
          productJson,
          fieldKey: `${row.fieldKey}_brand`,
          oldValue: oldMaker,
          newValue: nextMaker,
        })
      : false;

    if (!renamedName && !renamedMaker) continue;
    productJson.updated_at = new Date().toISOString();
    writeJson(filePath, productJson);
    affected.push({
      productId: row.productId,
      fieldKey: row.fieldKey,
      renamed_name: renamedName,
      renamed_maker: renamedMaker,
    });
  }

  return { renamed: affected.length, affected };
}
