/**
 * Enum policy enforcement (Step 6).
 * Three policies: closed (reject unknown), open_prefer_known (flag unknown), open (all pass).
 *
 * @param {*} value - Normalized field value (string, string[], or non-string)
 * @param {'closed'|'open_prefer_known'|'open'|null} policy
 * @param {string[]|null} knownValues - from known_values.enums[fieldKey].values
 * @returns {{ pass: boolean, known: string[], unknown: string[], needsLlm: boolean, reason?: string }}
 */
export function checkEnum(value, policy, knownValues) {
  if (!policy || !knownValues) {
    return { pass: true, known: [], unknown: [], needsLlm: false };
  }

  if (value === 'unk') {
    return { pass: true, known: [], unknown: [], needsLlm: false };
  }

  if (typeof value !== 'string' && !Array.isArray(value)) {
    return { pass: true, known: [], unknown: [], needsLlm: false };
  }

  const knownSet = new Set(knownValues);
  const values = Array.isArray(value) ? value : [value];

  const known = [];
  const unknown = [];

  for (const v of values) {
    if (typeof v !== 'string') {
      known.push(v);
      continue;
    }

    if (v.includes('+')) {
      const atoms = v.split('+');
      const unknownAtoms = atoms.filter(a => !knownSet.has(a));
      if (unknownAtoms.length > 0 && policy !== 'open') {
        unknown.push(...unknownAtoms);
      } else {
        known.push(v);
      }
      continue;
    }

    if (knownSet.has(v) || policy === 'open') {
      known.push(v);
    } else {
      unknown.push(v);
    }
  }

  const needsLlm = unknown.length > 0 && policy !== 'open';
  const pass = policy === 'closed' ? unknown.length === 0 : true;

  return {
    pass,
    known,
    unknown,
    needsLlm,
    ...(unknown.length > 0 && !pass ? { reason: `enum_value_not_allowed: ${unknown.join(', ')}` } : {}),
  };
}
