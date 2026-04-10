/**
 * List rules enforcement (Step 7). Dedupe, sort.
 * Order: dedupe → sort.
 *
 * @param {*} values - Array of validated elements
 * @param {{ dedupe?: boolean, sort?: 'none'|'alpha'|'numeric' }|null} listRules
 * @returns {{ values: any[], repairs: { rule: string, [key: string]: any }[] }}
 */
export function enforceListRules(values, listRules) {
  if (!Array.isArray(values)) return { values: [], repairs: [] };
  if (!listRules) return { values: [...values], repairs: [] };

  let result = [...values];
  const repairs = [];

  // 1. Dedupe (preserve first occurrence)
  // WHY: Use JSON.stringify for object comparison — Set uses reference equality which misses duplicate objects
  if (listRules.dedupe) {
    const seen = new Set();
    const before = result.length;
    result = result.filter(v => {
      const key = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = before - result.length;
    if (removed > 0) repairs.push({ rule: 'dedupe', removed });
  }

  // 2. Sort
  if (listRules.sort === 'alpha') {
    result.sort();
    repairs.push({ rule: 'sort_alpha' });
  } else if (listRules.sort === 'numeric') {
    result.sort((a, b) => a - b);
    repairs.push({ rule: 'sort_numeric' });
  }
  // sort: 'none' or absent → preserve order

  return { values: result, repairs };
}
