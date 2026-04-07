/**
 * Token map lookup. Exact match only (post-normalization).
 * @param {string} value
 * @param {Record<string, string>|null|undefined} tokenMap
 * @returns {string}
 */
export function applyTokenMap(value, tokenMap) {
  if (!tokenMap || typeof tokenMap !== 'object') return value;
  return Object.prototype.hasOwnProperty.call(tokenMap, value) ? tokenMap[value] : value;
}

/**
 * Core normalization chain for a single string atom.
 * Steps A-G per SSOT Section 5 (lines 693-703).
 */
function normalizeAtom(raw, tokenMap) {
  let v = raw;
  v = v.trim();                   // A: trim
  v = v.toLowerCase();            // B: lowercase
  v = v.replace(/\s+/g, '-');     // C: spaces -> hyphens
  v = v.replace(/_/g, '-');       // D: underscores -> hyphens
  v = v.replace(/-{2,}/g, '-');   // E: collapse multiple hyphens
  v = v.replace(/^-|-$/g, '');    // F: trim leading/trailing hyphens
  v = applyTokenMap(v, tokenMap); // G: token map lookup
  return v;
}

/**
 * String normalization chain (Step 5 in the 12-step pipeline).
 * Handles multi-part + tokens per SSOT Section 5, lines 761-777.
 * Non-strings pass through unchanged.
 *
 * @param {*} value - Raw field value
 * @param {object|null|undefined} fieldRule - Field rule (reads parse.token_map)
 * @returns {*} Normalized value
 */
export function normalizeValue(value, fieldRule) {
  if (typeof value !== 'string') return value;

  const tokenMap = fieldRule?.parse?.token_map;

  if (value.includes('+')) {
    return value
      .split('+')
      .map(atom => normalizeAtom(atom, tokenMap))
      .join('+');
  }

  return normalizeAtom(value, tokenMap);
}
