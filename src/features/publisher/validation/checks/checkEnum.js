// WHY: Collapse hyphens, underscores, and spaces for alias matching.
// "3-zone-(rgb)" should match "3 Zone (RGB)" after normalization.
function normForCompare(s) {
  return String(s || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

/**
 * Attempt alias resolution: exact → case-insensitive → normalized.
 * Returns the canonical known value if matched, or null.
 * @param {string} v - incoming value
 * @param {string[]} knownValues - canonical values
 * @param {Map<string, string>} lowerMap - lowercase → canonical
 * @param {Map<string, string>} normMap - normalized → canonical
 * @returns {string|null}
 */
function aliasResolve(v, knownValues, lowerMap, normMap) {
  // 1. Case-insensitive
  const lower = v.toLowerCase();
  if (lowerMap.has(lower)) return lowerMap.get(lower);
  // 2. Normalized (collapse hyphens/underscores/spaces)
  const norm = normForCompare(v);
  if (normMap.has(norm)) return normMap.get(norm);
  return null;
}

/**
 * Enum policy enforcement (Step 9).
 * Three policies: closed (reject unknown), open_prefer_known (flag unknown), open (all pass).
 * Policy determines matching: closed = exact, open_prefer_known = alias resolution.
 *
 * @param {*} value - Normalized field value (string, string[], or non-string)
 * @param {'closed'|'open_prefer_known'|'open'|null} policy
 * @param {string[]|null} knownValues - from known_values.enums[fieldKey].values
 * @returns {{ pass: boolean, known: string[], unknown: string[], needsReview: boolean, repaired?: *,  reason?: string }}
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

  const useAlias = policy === 'open_prefer_known';
  const knownSet = new Set(knownValues);

  // WHY: Pre-build lookup maps once for alias strategy (O(n) build, O(1) per lookup).
  let lowerMap, normMap;
  if (useAlias) {
    lowerMap = new Map();
    normMap = new Map();
    for (const kv of knownValues) {
      const l = kv.toLowerCase();
      if (!lowerMap.has(l)) lowerMap.set(l, kv);
      const n = normForCompare(kv);
      if (!normMap.has(n)) normMap.set(n, kv);
    }
  }

  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

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

      for (const a of atoms) {
        if (knownSet.has(a)) {
          resolvedAtoms.push(a);
        } else if (useAlias) {
          const canonical = aliasResolve(a, knownValues, lowerMap, normMap);
          if (canonical) {
            resolvedAtoms.push(canonical);
            atomRepaired = true;
          } else {
            unknownAtoms.push(a);
          }
        } else {
          unknownAtoms.push(a);
        }
      }

      if (unknownAtoms.length > 0 && policy !== 'open') {
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

    if (knownSet.has(v) || policy === 'open') {
      known.push(v);
      repairedValues.push(v);
    } else if (useAlias) {
      const canonical = aliasResolve(v, knownValues, lowerMap, normMap);
      if (canonical) {
        known.push(canonical);
        repairedValues.push(canonical);
        anyRepaired = true;
      } else {
        unknown.push(v);
        repairedValues.push(v);
      }
    } else {
      unknown.push(v);
      repairedValues.push(v);
    }
  }

  const needsReview = unknown.length > 0 && policy !== 'open';
  const pass = policy === 'closed' ? unknown.length === 0 : true;

  const result = {
    pass,
    known,
    unknown,
    needsReview,
    ...(unknown.length > 0 && !pass ? { reason: `enum_value_not_allowed: ${unknown.join(', ')}` } : {}),
  };

  // WHY: Only set repaired when alias matching actually changed a value.
  if (anyRepaired) {
    result.repaired = isArray ? repairedValues : repairedValues[0];
  }

  return result;
}
