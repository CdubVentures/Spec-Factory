import path from 'node:path';

export const KEY_ORDER_PATCH_SCHEMA_VERSION = 'key-order-patch.v1';

const PATCH_FILE_NAME = (category) => `${category}-keys-order.${KEY_ORDER_PATCH_SCHEMA_VERSION}.json`;
const GROUP_SEPARATOR_PREFIX = '__grp::';
const VALID_VERDICTS = new Set(['keep', 'reorder', 'add_keys', 'rename_keys', 'reorganize']);
const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'category',
  'verdict',
  'groups',
  'add_keys',
  'rename_keys',
  'audit',
]);
const GROUP_KEYS = new Set(['group_key', 'display_name', 'rationale', 'keys']);
const ADD_KEY_KEYS = new Set([
  'field_key',
  'display_name',
  'group_key',
  'rationale',
  'contract',
  'priority',
  'ui',
  'aliases',
  'search_hints',
  'notes',
]);
const RENAME_KEY_KEYS = new Set(['from', 'to', 'rationale']);
const AUDIT_KEYS = new Set([
  'categories_compared',
  'products_checked',
  'sources_checked',
  'missing_key_rationale',
  'organization_rationale',
  'open_questions',
]);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function assertStrictKeys(value, allowed, label) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) {
      throw new Error(`${label}: unknown key "${key}"`);
    }
  }
}

function assertNoTextSentinels(value, pathLabel = '$') {
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'no change') {
      throw new Error(`${pathLabel}: "No change" is not valid in strict JSON patches; omit unchanged paths`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoTextSentinels(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertNoTextSentinels(child, `${pathLabel}.${key}`);
    }
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${label} must be a field-style identifier`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function groupSeparator(displayName) {
  return `${GROUP_SEPARATOR_PREFIX}${String(displayName || '').trim()}`;
}

function orderFieldKeys(order) {
  return (Array.isArray(order) ? order : [])
    .filter((entry) => typeof entry === 'string' && !entry.startsWith(GROUP_SEPARATOR_PREFIX));
}

function currentKeySet({ currentOrder = [], existingFieldKeys = [] }) {
  return new Set([
    ...orderFieldKeys(currentOrder),
    ...(Array.isArray(existingFieldKeys) ? existingFieldKeys : []),
  ].filter((key) => typeof key === 'string' && key.trim()));
}

function safeSourceFileName(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!base) {
    throw new Error('fileName is required');
  }
  return base;
}

function stripPatchMetadata(doc) {
  if (!isObject(doc)) return doc;
  const { source_file, source_path, ...patchDoc } = doc;
  return patchDoc;
}

function assertStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string`);
    }
  });
}

function validateAuditBlock(audit) {
  if (!isObject(audit)) {
    throw new Error('audit must be an object');
  }
  assertStrictKeys(audit, AUDIT_KEYS, 'audit');
  for (const key of ['categories_compared', 'products_checked', 'sources_checked', 'open_questions']) {
    assertStringArray(audit[key], `audit.${key}`);
  }
  assertString(audit.missing_key_rationale, 'audit.missing_key_rationale');
  assertString(audit.organization_rationale, 'audit.organization_rationale');
}

function validateAddKey(addKey, index, groupKeys) {
  if (!isObject(addKey)) {
    throw new Error(`add_keys[${index}] must be an object`);
  }
  assertStrictKeys(addKey, ADD_KEY_KEYS, `add_keys[${index}]`);
  assertIdentifier(addKey.field_key, `add_keys[${index}].field_key`);
  assertString(addKey.display_name, `add_keys[${index}].display_name`);
  assertIdentifier(addKey.group_key, `add_keys[${index}].group_key`);
  assertString(addKey.rationale, `add_keys[${index}].rationale`);
  if (!groupKeys.has(addKey.group_key)) {
    throw new Error(`add_keys[${index}].group_key "${addKey.group_key}" is not declared in groups`);
  }
}

function validateRenameKey(renameKey, index) {
  if (!isObject(renameKey)) {
    throw new Error(`rename_keys[${index}] must be an object`);
  }
  assertStrictKeys(renameKey, RENAME_KEY_KEYS, `rename_keys[${index}]`);
  assertIdentifier(renameKey.from, `rename_keys[${index}].from`);
  assertIdentifier(renameKey.to, `rename_keys[${index}].to`);
  assertString(renameKey.rationale, `rename_keys[${index}].rationale`);
}

function validateGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('groups must be a non-empty array');
  }

  const groupKeys = new Set();
  const orderedKeys = [];
  const keyOwners = new Map();
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!isObject(group)) {
      throw new Error(`groups[${index}] must be an object`);
    }
    assertStrictKeys(group, GROUP_KEYS, `groups[${index}]`);
    assertIdentifier(group.group_key, `groups[${index}].group_key`);
    assertString(group.display_name, `groups[${index}].display_name`);
    assertString(group.rationale, `groups[${index}].rationale`);
    if (groupKeys.has(group.group_key)) {
      throw new Error(`duplicate group_key "${group.group_key}"`);
    }
    groupKeys.add(group.group_key);
    if (!Array.isArray(group.keys)) {
      throw new Error(`groups[${index}].keys must be an array`);
    }
    for (const key of group.keys) {
      assertIdentifier(key, `groups[${index}].keys[]`);
      if (keyOwners.has(key)) {
        throw new Error(`duplicate ordered key "${key}"`);
      }
      keyOwners.set(key, group.group_key);
      orderedKeys.push(key);
    }
  }

  return { groupKeys, orderedKeys, keyOwners };
}

function patchFileSummary(doc) {
  return {
    fileName: doc.source_file || expectedKeyOrderPatchFileName({ category: doc.category }),
    verdict: doc.verdict,
    groupCount: doc.groups.length,
    addKeyCount: doc.add_keys.length,
    renameKeyCount: doc.rename_keys.length,
  };
}

export function expectedKeyOrderPatchFileName({ category }) {
  if (!category || typeof category !== 'string') {
    throw new Error('expectedKeyOrderPatchFileName: category is required');
  }
  return PATCH_FILE_NAME(category);
}

export function validateKeyOrderPatchDocument(doc, {
  category = null,
  fileName = null,
  currentOrder = [],
  existingFieldKeys = [],
} = {}) {
  if (!isObject(doc)) {
    throw new Error('Key order patch must be a JSON object');
  }
  assertNoTextSentinels(doc);
  assertStrictKeys(doc, TOP_LEVEL_KEYS, 'key_order_patch');
  const normalizedDoc = {
    add_keys: [],
    rename_keys: [],
    ...doc,
  };

  if (normalizedDoc.schema_version !== KEY_ORDER_PATCH_SCHEMA_VERSION) {
    throw new Error(`schema_version must be "${KEY_ORDER_PATCH_SCHEMA_VERSION}"`);
  }
  assertString(normalizedDoc.category, 'category');
  if (category && normalizedDoc.category !== category) {
    throw new Error(`patch category "${normalizedDoc.category}" does not match requested category "${category}"`);
  }
  if (fileName && safeSourceFileName(fileName) !== expectedKeyOrderPatchFileName({ category: normalizedDoc.category })) {
    throw new Error(`filename must be "${expectedKeyOrderPatchFileName({ category: normalizedDoc.category })}"`);
  }
  if (!VALID_VERDICTS.has(normalizedDoc.verdict)) {
    throw new Error(`verdict must be one of ${[...VALID_VERDICTS].join(', ')}`);
  }

  const { groupKeys, orderedKeys } = validateGroups(normalizedDoc.groups);
  if (!Array.isArray(normalizedDoc.add_keys)) {
    throw new Error('add_keys must be an array');
  }
  if (!Array.isArray(normalizedDoc.rename_keys)) {
    throw new Error('rename_keys must be an array');
  }
  normalizedDoc.add_keys.forEach((addKey, index) => validateAddKey(addKey, index, groupKeys));
  normalizedDoc.rename_keys.forEach(validateRenameKey);
  validateAuditBlock(normalizedDoc.audit);

  const existingKeys = currentKeySet({ currentOrder, existingFieldKeys });
  const addKeys = new Set(normalizedDoc.add_keys.map((entry) => entry.field_key));
  for (const addKey of addKeys) {
    if (existingKeys.has(addKey)) {
      throw new Error(`add_keys contains existing key "${addKey}"`);
    }
  }
  for (const key of existingKeys) {
    if (!orderedKeys.includes(key)) {
      throw new Error(`missing current key "${key}"`);
    }
  }
  for (const key of orderedKeys) {
    if (!existingKeys.has(key) && !addKeys.has(key)) {
      throw new Error(`unknown ordered key "${key}" must be declared in add_keys`);
    }
  }
  for (const addKey of addKeys) {
    if (!orderedKeys.includes(addKey)) {
      throw new Error(`add_keys entry "${addKey}" must appear in exactly one group`);
    }
  }

  return cloneJson(normalizedDoc);
}

export function buildKeyOrderPatchChangeLog({ currentOrder = [], nextOrder = [], doc }) {
  const currentFields = orderFieldKeys(currentOrder);
  const currentFieldSet = new Set(currentFields);
  const currentGroupSet = new Set((Array.isArray(currentOrder) ? currentOrder : [])
    .filter((entry) => typeof entry === 'string' && entry.startsWith(GROUP_SEPARATOR_PREFIX)));
  const changes = [];

  for (const group of doc.groups) {
    const separator = groupSeparator(group.display_name);
    if (!currentGroupSet.has(separator)) {
      changes.push({
        kind: 'group_added',
        groupKey: group.group_key,
        label: group.display_name,
        after: separator,
      });
    }
  }

  for (const addKey of doc.add_keys) {
    changes.push({
      kind: 'key_added',
      key: addKey.field_key,
      groupKey: addKey.group_key,
      label: addKey.display_name,
      rationale: addKey.rationale,
    });
  }

  const nextFields = orderFieldKeys(nextOrder);
  for (const key of nextFields) {
    if (!currentFieldSet.has(key)) continue;
    const beforeIndex = currentFields.indexOf(key);
    const afterIndex = nextFields.indexOf(key);
    if (beforeIndex !== afterIndex) {
      changes.push({
        kind: 'key_moved',
        key,
        beforeIndex,
        afterIndex,
      });
    }
  }

  for (const rename of doc.rename_keys) {
    changes.push({
      kind: 'rename_proposed',
      from: rename.from,
      to: rename.to,
      rationale: rename.rationale,
    });
  }

  return changes;
}

export function applyKeyOrderPatchDocument(patchDoc, {
  category = null,
  currentOrder = [],
  existingFieldKeys = [],
} = {}) {
  const doc = validateKeyOrderPatchDocument(stripPatchMetadata(patchDoc), {
    category,
    fileName: patchDoc?.source_file || null,
    currentOrder,
    existingFieldKeys,
  });
  const order = doc.groups.flatMap((group) => [
    groupSeparator(group.display_name),
    ...group.keys,
  ]);
  return {
    category: doc.category,
    order,
    document: doc,
    files: [patchFileSummary({ ...doc, source_file: patchDoc?.source_file })],
    changes: buildKeyOrderPatchChangeLog({ currentOrder, nextOrder: order, doc }),
  };
}

export function parseKeyOrderPatchPayloadFiles({
  category,
  files,
  currentOrder = [],
  existingFieldKeys = [],
}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('files must be a non-empty array');
  }
  if (files.length !== 1) {
    throw new Error('key order import accepts exactly one JSON file');
  }

  return files.map((file, index) => {
    if (!isObject(file)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const fileName = safeSourceFileName(file.fileName || file.name);
    const content = file.content ?? file.text;
    if (typeof content !== 'string') {
      throw new Error(`${fileName}: content must be a string`);
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`${fileName}: invalid JSON (${err.message})`);
    }
    const doc = validateKeyOrderPatchDocument(parsed, {
      category,
      fileName,
      currentOrder,
      existingFieldKeys,
    });
    return { ...doc, source_file: fileName };
  });
}

export function previewKeyOrderPatchDocument({
  category,
  currentOrder = [],
  existingFieldKeys = [],
  patchDoc,
}) {
  const result = applyKeyOrderPatchDocument(patchDoc, {
    category,
    currentOrder,
    existingFieldKeys,
  });
  return {
    category: result.category,
    valid: true,
    files: result.files,
    changes: result.changes,
    order: result.order,
    errors: [],
    warnings: result.document.rename_keys.length > 0
      ? ['rename_keys are review proposals only; importer does not rename field rule files']
      : [],
  };
}
