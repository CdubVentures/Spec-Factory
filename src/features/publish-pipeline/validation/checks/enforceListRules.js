/**
 * List rules enforcement (Step 7). Dedupe, sort, min/max items.
 * Order: dedupe → sort → max_items → min_items check.
 *
 * @param {*} values - Array of validated elements
 * @param {{ dedupe?: boolean, sort?: 'none'|'alpha'|'numeric', min_items?: number, max_items?: number }|null} listRules
 * @returns {{ values: any[], repairs: { rule: string, [key: string]: any }[] }}
 */
export function enforceListRules(values, listRules) {
  if (!Array.isArray(values)) return { values: [], repairs: [] };
  if (!listRules) return { values: [...values], repairs: [] };

  let result = [...values];
  const repairs = [];

  // 1. Dedupe (preserve first occurrence)
  if (listRules.dedupe) {
    const seen = new Set();
    const before = result.length;
    result = result.filter(v => {
      if (seen.has(v)) return false;
      seen.add(v);
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

  // 3. Max items
  if (listRules.max_items && result.length > listRules.max_items) {
    repairs.push({ rule: 'max_items', truncatedFrom: result.length, to: listRules.max_items });
    result = result.slice(0, listRules.max_items);
  }

  // 4. Min items (flag only — cannot auto-add values)
  if (listRules.min_items && result.length < listRules.min_items) {
    repairs.push({ rule: 'min_items_violation', have: result.length, need: listRules.min_items });
  }

  return { values: result, repairs };
}
