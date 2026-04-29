import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeKnownValueMatchKey } from '../../../shared/primitives.js';

async function safeReadJson(fp) {
  try { return JSON.parse(await fs.readFile(fp, 'utf8')); } catch { return null; }
}

async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function categoryRootCandidates(outputRoot, category) {
  const roots = [
    path.join(outputRoot, category),
    path.join(outputRoot, 'specs', 'outputs', category),
  ];
  return [...new Set(roots.map((entry) => path.resolve(entry)))];
}

async function listProductDirsFromOutput(outputRoot, category) {
  const names = new Set();
  const roots = categoryRootCandidates(outputRoot, category);
  for (const root of roots) {
    const dirs = await listDirs(root);
    for (const dir of dirs) {
      names.add(dir);
    }
  }
  return [...names];
}

function latestNormalizedPathCandidates(outputRoot, category, productId) {
  return categoryRootCandidates(outputRoot, category)
    .map((root) => path.join(root, productId, 'latest', 'normalized.json'));
}

async function readLatestNormalized(outputRoot, category, productId) {
  for (const filePath of latestNormalizedPathCandidates(outputRoot, category, productId)) {
    const normalized = await safeReadJson(filePath);
    if (normalized) {
      return { filePath, normalized };
    }
  }
  return null;
}

async function listProductIdsFromRoot(productRoot) {
  const entries = await listDirs(productRoot);
  return entries.filter((entry) => !entry.startsWith('_'));
}

function productJsonPath(productRoot, productId) {
  return path.join(productRoot, productId, 'product.json');
}

async function readProductJson(productRoot, productId) {
  const filePath = productJsonPath(productRoot, productId);
  const productJson = await safeReadJson(filePath);
  return productJson ? { filePath, productJson } : null;
}

function addAffectedRow(map, row = {}) {
  const productId = String(row.productId || row.product_id || '').trim();
  if (!productId) return;
  const field = String(row.field || row.field_key || '').trim();
  const key = `${productId}::${field || '*'}`;
  if (map.has(key)) return;
  map.set(key, {
    productId,
    field: field || null,
    value: row.value ?? null,
    match_type: row.match_type || null,
    match_score: row.match_score ?? null,
  });
}

function uniqueProductIds(rows = []) {
  return [...new Set(rows.map((row) => String(row?.productId || '').trim()).filter(Boolean))];
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeEnumComparable(value) {
  return normalizeKnownValueMatchKey(value);
}

function extractPublishedValue(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value;
  }
  return entry;
}

function publishedValueContainsEnumValue(publishedValue, enumValue) {
  const target = normalizeEnumComparable(enumValue);
  if (!target) return false;
  if (Array.isArray(publishedValue)) {
    return publishedValue.some((item) => normalizeEnumComparable(item) === target);
  }
  return normalizeEnumComparable(publishedValue) === target;
}

function replaceEnumValueInPublishedValue(publishedValue, oldValue, newValue) {
  const target = normalizeEnumComparable(oldValue);
  const replacement = String(newValue || '').trim();
  if (!target || !replacement) return { value: publishedValue, changed: false };
  if (!Array.isArray(publishedValue)) {
    if (normalizeEnumComparable(publishedValue) !== target) {
      return { value: publishedValue, changed: false };
    }
    return { value: replacement, changed: true };
  }

  const seen = new Set();
  let changed = false;
  const next = [];
  for (const item of publishedValue) {
    const token = normalizeEnumComparable(item);
    const nextItem = token === target ? replacement : item;
    const nextToken = normalizeEnumComparable(nextItem);
    if (token === target) changed = true;
    if (!nextToken || seen.has(nextToken)) continue;
    seen.add(nextToken);
    next.push(nextItem);
  }
  return { value: next, changed };
}

function replacePublishedEntryValue(entry, oldValue, newValue) {
  const currentValue = extractPublishedValue(entry);
  const rewritten = replaceEnumValueInPublishedValue(currentValue, oldValue, newValue);
  if (!rewritten.changed) return { entry, changed: false };
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return { entry: { ...entry, value: rewritten.value }, changed: true };
  }
  return { entry: rewritten.value, changed: true };
}

function upsertNormalizedField(normalized, field, value) {
  if (!normalized || !field) return;

  let wrote = false;
  if (normalized.fields && typeof normalized.fields === 'object') {
    if (value === undefined) delete normalized.fields[field];
    else normalized.fields[field] = value;
    wrote = true;
  }
  if (normalized.specs && typeof normalized.specs === 'object') {
    if (value === undefined) delete normalized.specs[field];
    else normalized.specs[field] = value;
    wrote = true;
  }
  if (!wrote) {
    normalized.fields = {};
    if (value !== undefined) {
      normalized.fields[field] = value;
    }
  }
}

function clearPublishResultMetadataPreservingEvidence(specDb, productId, fieldKey, variantId) {
  const rows = specDb?.getFieldCandidatesByProductAndField?.(
    productId,
    fieldKey,
    variantId === undefined ? undefined : variantId,
  ) || [];
  for (const row of rows) {
    const metadata = row?.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
    if (!Object.prototype.hasOwnProperty.call(metadata, 'publish_result')) continue;
    specDb?.updateFieldCandidateMetadata?.(row.id, { ...metadata, publish_result: null });
  }
}

function clearScalarPublishedEnum({ specDb, productId, field, productJson, enumValue }) {
  const entry = productJson?.fields?.[field];
  if (!publishedValueContainsEnumValue(extractPublishedValue(entry), enumValue)) {
    return false;
  }
  delete productJson.fields[field];
  specDb?.demoteResolvedCandidates?.(productId, field, null);
  clearPublishResultMetadataPreservingEvidence(specDb, productId, field, null);
  return true;
}

function clearVariantPublishedEnum({ specDb, productId, field, productJson, enumValue }) {
  const variantFields = productJson?.variant_fields || {};
  let changed = false;
  for (const [variantId, entry] of Object.entries(variantFields)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!publishedValueContainsEnumValue(extractPublishedValue(entry[field]), enumValue)) continue;
    delete entry[field];
    if (Object.keys(entry).length === 0) {
      delete variantFields[variantId];
    }
    specDb?.demoteResolvedCandidates?.(productId, field, variantId);
    clearPublishResultMetadataPreservingEvidence(specDb, productId, field, variantId);
    changed = true;
  }
  return changed;
}

function renameScalarPublishedEnum({ productId, field, productJson, oldValue, newValue }) {
  if (!productJson?.fields || !Object.prototype.hasOwnProperty.call(productJson.fields, field)) {
    return false;
  }
  const rewritten = replacePublishedEntryValue(productJson.fields[field], oldValue, newValue);
  if (!rewritten.changed) return false;
  productJson.fields[field] = rewritten.entry;
  return true;
}

function renameVariantPublishedEnum({ productJson, field, oldValue, newValue }) {
  const variantFields = productJson?.variant_fields || {};
  let changed = false;
  for (const entry of Object.values(variantFields)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    const rewritten = replacePublishedEntryValue(entry[field], oldValue, newValue);
    if (!rewritten.changed) continue;
    entry[field] = rewritten.entry;
    changed = true;
  }
  return changed;
}

/**
 * Remove a deleted enum value from published product mirrors without deleting
 * candidate rows or evidence projections. Candidate status is demoted so the
 * product is genuinely unpublished until a reviewer or run resolves a valid
 * value again.
 */
export async function unpublishEnumValueFromProducts({
  productRoot,
  category,
  field,
  value,
  productIds = [],
  specDb = null,
}) {
  const fieldKey = String(field || '').trim();
  const enumValue = String(value || '').trim();
  if (!productRoot || !fieldKey || !enumValue) {
    return { affected: [], unpublished: 0 };
  }

  const candidateProductIds = new Set(uniqueStrings(productIds));
  const allProductIds = await listProductIdsFromRoot(productRoot);
  for (const productId of allProductIds) {
    candidateProductIds.add(productId);
  }

  const affected = [];
  for (const productId of candidateProductIds) {
    const productData = await readProductJson(productRoot, productId);
    if (!productData?.productJson) continue;

    const scalarChanged = clearScalarPublishedEnum({
      specDb,
      productId,
      field: fieldKey,
      productJson: productData.productJson,
      enumValue,
    });
    const variantChanged = clearVariantPublishedEnum({
      specDb,
      productId,
      field: fieldKey,
      productJson: productData.productJson,
      enumValue,
    });

    if (!scalarChanged && !variantChanged) continue;
    productData.productJson.updated_at = new Date().toISOString();
    specDb?.syncItemListLinkForFieldValue?.({
      productId,
      fieldKey,
      value: undefined,
    });
    await fs.writeFile(productData.filePath, JSON.stringify(productData.productJson, null, 2));
    affected.push({
      productId,
      field: fieldKey,
      value: enumValue,
      match_type: 'published_product_json',
      match_score: 1.0,
    });
  }

  return { affected, unpublished: affected.length };
}

export async function renameEnumValueInProducts({
  productRoot,
  category,
  field,
  oldValue,
  newValue,
  productIds = [],
  specDb = null,
}) {
  const fieldKey = String(field || '').trim();
  const priorValue = String(oldValue || '').trim();
  const replacement = String(newValue || '').trim();
  if (!productRoot || !fieldKey || !priorValue || !replacement) {
    return { affected: [], renamed: 0 };
  }

  const candidateProductIds = new Set(uniqueStrings(productIds));
  const allProductIds = await listProductIdsFromRoot(productRoot);
  for (const productId of allProductIds) {
    candidateProductIds.add(productId);
  }

  const affected = [];
  for (const productId of candidateProductIds) {
    const productData = await readProductJson(productRoot, productId);
    if (!productData?.productJson) continue;

    const scalarChanged = renameScalarPublishedEnum({
      productId,
      field: fieldKey,
      productJson: productData.productJson,
      oldValue: priorValue,
      newValue: replacement,
    });
    const variantChanged = renameVariantPublishedEnum({
      productJson: productData.productJson,
      field: fieldKey,
      oldValue: priorValue,
      newValue: replacement,
    });

    if (!scalarChanged && !variantChanged) continue;
    productData.productJson.updated_at = new Date().toISOString();
    specDb?.syncItemListLinkForFieldValue?.({
      productId,
      fieldKey,
      value: extractPublishedValue(productData.productJson.fields?.[fieldKey]),
    });
    await fs.writeFile(productData.filePath, JSON.stringify(productData.productJson, null, 2));
    affected.push({
      productId,
      field: fieldKey,
      value: priorValue,
      newValue: replacement,
      match_type: 'published_product_json',
      match_score: 1.0,
    });
  }

  return { affected, renamed: affected.length };
}

/**
 * Find all products whose normalized.json references a specific component.
 * Tries SpecDb first, then falls back to filesystem scan.
 */
export async function findProductsReferencingComponent({
  outputRoot,
  category,
  componentType,
  componentName,
  componentMaker = '',
  specDb = null,
}) {
  const affectedMap = new Map();

  if (specDb) {
    try {
      const linkRows = specDb.getProductsForComponent(componentType, componentName, componentMaker || '');
      for (const row of linkRows) {
        addAffectedRow(affectedMap, {
          productId: row.product_id,
          field: row.field_key || componentType,
          value: componentName,
          match_type: row.match_type || 'exact',
          match_score: row.match_score ?? null,
        });
      }

      // Catch products that reference the component but are not linked yet.
      const fieldRows = specDb.getProductsForFieldValue(componentType, componentName);
      for (const row of fieldRows) {
        addAffectedRow(affectedMap, {
          productId: row.product_id,
          field: row.field_key || componentType,
          value: componentName,
          match_type: 'field_state',
          match_score: 1.0,
        });
      }
    } catch {
      // Fall through to filesystem fallback.
    }
  }

  const productDirs = await listProductDirsFromOutput(outputRoot, category);
  const nameStr = String(componentName || '').trim().toLowerCase();

  for (const productId of productDirs) {
    if (productId.startsWith('_')) continue;

    const productData = await readLatestNormalized(outputRoot, category, productId);
    if (!productData?.normalized) continue;
    const { normalized } = productData;

    const values = [];
    if (normalized.fields && typeof normalized.fields === 'object') {
      values.push(normalized.fields[componentType]);
    }
    if (normalized.specs && typeof normalized.specs === 'object') {
      values.push(normalized.specs[componentType]);
    }

    for (const rawValue of values) {
      if (!rawValue) continue;
      const valueStr = String(rawValue).trim().toLowerCase();
      if (!valueStr) continue;
      if (valueStr === nameStr || valueStr.includes(nameStr)) {
        addAffectedRow(affectedMap, {
          productId,
          field: componentType,
          value: String(rawValue),
          match_type: valueStr === nameStr ? 'exact' : 'partial',
          match_score: valueStr === nameStr ? 1.0 : 0.6,
        });
        break;
      }
    }
  }

  return [...affectedMap.values()];
}

/**
 * After a component property changes, mark affected products as stale.
 */
export async function cascadeComponentChange({
  storage,
  outputRoot,
  category,
  componentType,
  componentName,
  componentMaker = '',
  changedProperty,
  newValue,
  variancePolicy,
  constraints = [],
  specDb = null,
}) {
  const affected = await findProductsReferencingComponent({
    outputRoot,
    category,
    componentType,
    componentName,
    componentMaker,
    specDb,
  });
  if (affected.length === 0) return { affected: [], cascaded: 0, propagation: null };

  const affectedProductIds = uniqueProductIds(affected);
  const isIdentity = changedProperty && changedProperty.startsWith('__');
  const hasConstraints = Array.isArray(constraints) && constraints.length > 0;
  const effectivePolicy = variancePolicy || (isIdentity ? 'authoritative' : null);
  let targetProductIds = [...affectedProductIds];

  const propagation = {
    policy: effectivePolicy,
    action: 'stale_only',
    violations: [],
    compliant: [],
    updated: [],
  };

  if (specDb && changedProperty && newValue !== undefined && !isIdentity) {
    try {
      if (effectivePolicy === 'authoritative') {
        const updatedPids = uniqueStrings(specDb.pushAuthoritativeValueToLinkedProducts(
          componentType,
          componentName,
          componentMaker || '',
          changedProperty,
          String(newValue),
        ));
        propagation.action = 'value_pushed';
        propagation.updated = updatedPids;
        targetProductIds = [...updatedPids];

        for (const productId of targetProductIds) {
          try {
            const productData = await readLatestNormalized(outputRoot, category, productId);
            if (!productData?.normalized) continue;
            upsertNormalizedField(productData.normalized, changedProperty, String(newValue));
            await fs.writeFile(productData.filePath, JSON.stringify(productData.normalized, null, 2));
          } catch {
            // Best effort.
          }
        }
      } else if (effectivePolicy === 'upper_bound' || effectivePolicy === 'lower_bound' || effectivePolicy === 'range') {
        const result = specDb.evaluateAndFlagLinkedProducts(
          componentType,
          componentName,
          componentMaker || '',
          changedProperty,
          String(newValue),
          effectivePolicy,
        );
        propagation.action = 'variance_evaluated';
        propagation.violations = result.violations;
        propagation.compliant = result.compliant;
        targetProductIds = uniqueStrings([
          ...(result.violations || []),
          ...(result.compliant || []),
        ]);
      }

      if (hasConstraints) {
        const constraintResult = specDb.evaluateConstraintsForLinkedProducts(
          componentType,
          componentName,
          componentMaker || '',
          changedProperty,
          constraints,
        );
        propagation.constraint_violations = constraintResult.violations;
        propagation.constraint_compliant = constraintResult.compliant;
        for (const pid of constraintResult.violations) {
          if (!propagation.violations.includes(pid)) {
            propagation.violations.push(pid);
          }
        }
        const constraintTargets = uniqueStrings([
          ...(constraintResult.violations || []),
          ...(constraintResult.compliant || []),
        ]);
        if (constraintTargets.length > 0) {
          if (effectivePolicy === 'authoritative' || effectivePolicy === 'upper_bound' || effectivePolicy === 'lower_bound' || effectivePolicy === 'range') {
            targetProductIds = uniqueStrings([...targetProductIds, ...constraintTargets]);
          } else {
            // Constraints-only rechecks should target linked products only.
            targetProductIds = constraintTargets;
          }
        }
      }
    } catch (err) {
      propagation.error = err?.message || 'propagation_failed';
    }
  }

  return { affected, propagation };
}

/**
 * After an enum value is removed or renamed, update the stored value in every
 * affected product and mark them stale.
 */
export async function cascadeEnumChange({
  storage,
  outputRoot,
  category,
  field,
  action,
  value,
  newValue,
  preAffectedProductIds = [],
  specDb = null,
}) {
  if (action !== 'remove' && action !== 'rename') return { affected: [] };

  const targetValue = String(value).trim();
  const affectedMap = new Map();

  for (const productId of preAffectedProductIds || []) {
    addAffectedRow(affectedMap, {
      productId,
      field,
      value: targetValue,
      match_type: 'precomputed',
      match_score: 1.0,
    });
  }

  if (specDb) {
    try {
      const fieldRows = specDb.getProductsForFieldValue(field, targetValue);
      for (const row of fieldRows) {
        addAffectedRow(affectedMap, {
          productId: row.product_id,
          field: row.field_key || field,
          value: targetValue,
          match_type: 'field_state',
          match_score: 1.0,
        });
      }

      const listRows = specDb.getProductsForListValue(field, targetValue);
      for (const row of listRows) {
        addAffectedRow(affectedMap, {
          productId: row.product_id,
          field: row.field_key || field,
          value: targetValue,
          match_type: 'list_link',
          match_score: 1.0,
        });
      }
    } catch {
      // Fall through to filesystem fallback.
    }
  }

  if (affectedMap.size === 0) {
    const productDirs = await listProductDirsFromOutput(outputRoot, category);
    const normalizedValue = normalizeEnumComparable(targetValue);

    for (const productId of productDirs) {
      if (productId.startsWith('_')) continue;

      const productData = await readLatestNormalized(outputRoot, category, productId);
      if (!productData?.normalized) continue;
      const { normalized } = productData;

      const values = [];
      if (normalized.fields && typeof normalized.fields === 'object') {
        values.push(normalized.fields[field]);
      }
      if (normalized.specs && typeof normalized.specs === 'object') {
        values.push(normalized.specs[field]);
      }

      for (const fieldValue of values) {
        if (!fieldValue) continue;
        const fieldStr = normalizeEnumComparable(fieldValue);
        if (fieldStr === normalizedValue) {
          addAffectedRow(affectedMap, {
            productId,
            field,
            value: String(fieldValue),
            match_type: 'normalized_file',
            match_score: 1.0,
          });
          break;
        }
      }
    }
  }

  const affected = [...affectedMap.values()];
  if (affected.length === 0) return { affected, cascaded: 0 };
  const affectedProductIds = uniqueProductIds(affected);

  if (specDb) {
    try {
      if (action === 'rename' && newValue) {
        specDb.renameFieldValueInItems(field, targetValue, String(newValue).trim());
      } else if (action === 'remove') {
        specDb.removeFieldValueFromItems(field, targetValue);
        specDb.removeListLinks(field, targetValue);
      }
    } catch {
      // Best effort.
    }
  }

  const trimmedNew = newValue ? String(newValue).trim() : null;
  for (const productId of affectedProductIds) {
    try {
      const productData = await readLatestNormalized(outputRoot, category, productId);
      if (!productData?.normalized) continue;

      if (action === 'rename' && trimmedNew) {
        upsertNormalizedField(productData.normalized, field, trimmedNew);
      } else if (action === 'remove') {
        upsertNormalizedField(productData.normalized, field, undefined);
      }
      await fs.writeFile(productData.filePath, JSON.stringify(productData.normalized, null, 2));
    } catch {
      // Best effort.
    }
  }

  return { affected };
}
