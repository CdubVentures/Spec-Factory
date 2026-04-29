import { normalizeKnownValueMatchKey } from '../../../../shared/primitives.js';

function canonicalKnownValues(knownValues = []) {
  const seen = new Set();
  const canonical = [];
  for (const rawValue of knownValues || []) {
    const value = String(rawValue ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    canonical.push(value);
  }
  return canonical;
}

function buildKnownValueResolver(knownValues = []) {
  const canonical = canonicalKnownValues(knownValues);
  const exactSet = new Set(canonical);
  const byMatchKey = new Map();

  for (const value of canonical) {
    const key = normalizeKnownValueMatchKey(value);
    if (!key) continue;
    const matches = byMatchKey.get(key) || [];
    matches.push(value);
    byMatchKey.set(key, matches);
  }

  return {
    resolve(value) {
      const input = String(value ?? '').trim();
      if (exactSet.has(input)) {
        return {
          matched: true,
          value: input,
          repaired: input !== value,
        };
      }

      const matches = byMatchKey.get(normalizeKnownValueMatchKey(value)) || [];
      if (matches.length !== 1) {
        return {
          matched: false,
          value: input || String(value ?? ''),
        };
      }

      return {
        matched: true,
        value: matches[0],
        repaired: matches[0] !== value,
      };
    },
  };
}

/**
 * Enum policy enforcement (Step 9).
 * Three policies: closed (reject unknown), open_prefer_known (flag unknown), open (all pass).
 * Non-open policies use a system-owned hidden match key and repair to canonical display values.
 *
 * @param {*} value - Normalized field value (string, string[], or non-string)
 * @param {'closed'|'closed_with_curation'|'open_prefer_known'|'open'|null} policy
 * @param {string[]|null} knownValues - from known_values.enums[fieldKey].values
 * @returns {{ pass: boolean, known: string[], unknown: string[], needsReview: boolean, repaired?: *, reason?: string }}
 */
export function checkEnum(value, policy, knownValues) {
  if (!policy || !knownValues) {
    return { pass: true, known: [], unknown: [], needsReview: false };
  }

  if (value === null) {
    return { pass: true, known: [], unknown: [], needsReview: false };
  }

  if (typeof value !== 'string' && !Array.isArray(value)) {
    return { pass: true, known: [], unknown: [], needsReview: false };
  }

  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

  if (policy === 'open') {
    return { pass: true, known: values, unknown: [], needsReview: false };
  }

  const resolver = buildKnownValueResolver(knownValues);
  const known = [];
  const unknown = [];
  const repairedValues = [];
  let anyRepaired = false;

  for (const v of values) {
    if (typeof v !== 'string') {
      known.push(v);
      repairedValues.push(v);
      continue;
    }

    if (v.includes('+')) {
      const atoms = v.split('+');
      const resolvedAtoms = [];
      const unknownAtoms = [];
      let atomRepaired = false;

      for (const atom of atoms) {
        const resolved = resolver.resolve(atom);
        if (resolved.matched) {
          resolvedAtoms.push(resolved.value);
          if (resolved.repaired) atomRepaired = true;
          continue;
        }
        unknownAtoms.push(String(atom ?? '').trim() || atom);
      }

      if (unknownAtoms.length > 0) {
        unknown.push(...unknownAtoms);
        repairedValues.push(v);
      } else {
        const joined = resolvedAtoms.join('+');
        known.push(joined);
        repairedValues.push(joined);
        if (atomRepaired) anyRepaired = true;
      }
      continue;
    }

    const resolved = resolver.resolve(v);
    if (resolved.matched) {
      known.push(resolved.value);
      repairedValues.push(resolved.value);
      if (resolved.repaired) anyRepaired = true;
      continue;
    }

    unknown.push(resolved.value);
    repairedValues.push(v);
  }

  const needsReview = unknown.length > 0 && policy !== 'open';
  const pass = policy === 'closed' || policy === 'closed_with_curation'
    ? unknown.length === 0
    : true;

  const result = {
    pass,
    known,
    unknown,
    needsReview,
    ...(unknown.length > 0 && !pass ? { reason: `enum_value_not_allowed: ${unknown.join(', ')}` } : {}),
  };

  if (anyRepaired) {
    result.repaired = isArray ? repairedValues : repairedValues[0];
  }

  return result;
}
