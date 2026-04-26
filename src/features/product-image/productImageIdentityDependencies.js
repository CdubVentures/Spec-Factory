const UNKNOWN_TOKENS = new Set([
  'unk',
  'unknown',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'not specified',
  'not available',
]);

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringifyValue(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => stringifyValue(item))
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
  }
  if (parsed && typeof parsed === 'object') {
    if (Object.prototype.hasOwnProperty.call(parsed, 'value')) {
      return stringifyValue(parsed.value);
    }
    return JSON.stringify(parsed);
  }
  return String(parsed ?? '').trim();
}

function hasMeaningfulValue(value) {
  const text = stringifyValue(value);
  if (!text) return false;
  return !UNKNOWN_TOKENS.has(text.toLowerCase());
}

function normalizeCompiledRules(compiledRules) {
  if (!compiledRules) return {};
  if (typeof compiledRules === 'string') {
    try {
      const parsed = JSON.parse(compiledRules);
      return parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    } catch {
      return {};
    }
  }
  return compiledRules?.fields && typeof compiledRules.fields === 'object'
    ? compiledRules.fields
    : {};
}

function readCompiledRulesFields(specDb) {
  if (typeof specDb?.getCompiledRules !== 'function') return {};
  return normalizeCompiledRules(specDb.getCompiledRules());
}

function pickTopResolved(rows = []) {
  return rows
    .filter((row) => row && String(row.status || '') === 'resolved')
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0] || null;
}

function readCandidateRows(specDb, productId, fieldKey, variantId) {
  if (typeof specDb?.getFieldCandidatesByProductAndField !== 'function') return [];
  return specDb.getFieldCandidatesByProductAndField(productId, fieldKey, variantId) || [];
}

function readDbResolvedFact({ specDb, productId, fieldKey, variantId }) {
  if (!productId || !fieldKey) return { found: false, value: null };

  const variantRows = variantId ? readCandidateRows(specDb, productId, fieldKey, variantId) : [];
  const variantResolved = pickTopResolved(variantRows);
  if (variantResolved) return { found: true, value: variantResolved.value };

  const productRows = readCandidateRows(specDb, productId, fieldKey, null);
  const productResolved = pickTopResolved(productRows);
  if (productResolved) return { found: true, value: productResolved.value };
  if (productRows.length > 0) return { found: true, value: null };

  if (typeof specDb?.getResolvedFieldCandidate === 'function') {
    const row = specDb.getResolvedFieldCandidate(productId, fieldKey);
    if (row && String(row.status || 'resolved') === 'resolved') {
      return { found: true, value: row.value };
    }
  }

  return { found: false, value: null };
}

function readProductJsonFieldValue(product, fieldKey) {
  const fields = product?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const row = fields[fieldKey];
  if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'value')) {
    return row.value;
  }
  return row ?? null;
}

function labelForRule(fieldKey, rule = {}) {
  return String(rule?.ui?.label || rule?.display_name || rule?.label || fieldKey);
}

function isProductImageDependent(rule = {}) {
  return rule?.product_image_dependent === true;
}

export function resolveProductImageIdentityFacts({
  specDb,
  product = {},
  variant = {},
} = {}) {
  const productId = product?.product_id || product?.id || '';
  const variantId = variant?.variant_id || variant?.variantId || '';
  const fields = readCompiledRulesFields(specDb);
  const facts = [];

  for (const [fieldKey, rule] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isProductImageDependent(rule)) continue;
    const dbFact = readDbResolvedFact({ specDb, productId, fieldKey, variantId });
    const rawValue = dbFact.found ? dbFact.value : readProductJsonFieldValue(product, fieldKey);
    if (!hasMeaningfulValue(rawValue)) continue;
    facts.push({
      fieldKey,
      label: labelForRule(fieldKey, rule),
      value: stringifyValue(rawValue),
    });
  }

  return facts;
}

export function formatProductImageIdentityFactsBlock(facts = [], { mode = 'discovery' } = {}) {
  const usableFacts = (facts || [])
    .filter((fact) => fact?.fieldKey && hasMeaningfulValue(fact.value))
    .map((fact) => ({
      fieldKey: String(fact.fieldKey),
      value: stringifyValue(fact.value),
    }));
  if (usableFacts.length === 0) return '';

  const lines = usableFacts.map((fact) => `- ${fact.fieldKey}: ${fact.value}`);
  if (mode === 'eval') {
    return [
      'Product image identity guardrails:',
      ...lines,
      'Use these facts to detect clear visual or source conflict with the exact product. If a candidate clearly conflicts, flag it as "wrong_product". If a fact is not visually testable or is ambiguous in the pixels, do not reject solely on that fact; use it as a source-identity and tie-break signal.',
    ].join('\n');
  }

  return [
    'Product image identity facts:',
    ...lines,
    'Use these facts as search and source-identity filters for the exact product. Prefer sources and images matching them, but do not omit otherwise exact-product images when a fact is not visually testable from pixels.',
  ].join('\n');
}
