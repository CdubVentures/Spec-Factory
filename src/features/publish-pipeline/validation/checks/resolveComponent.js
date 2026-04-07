/**
 * Component DB resolution (Step 11).
 * Resolves a component name against the component database.
 * Order: exact name → case-insensitive name → alias (case-insensitive).
 *
 * @param {*} value - Component name from LLM
 * @param {string} componentType - e.g. 'sensor', 'switch', 'encoder', 'material'
 * @param {{ items: { name: string, aliases?: string[] }[] }|null} componentDb
 * @returns {{ pass: boolean, canonical?: string, repaired?: boolean, reason?: string }}
 */
export function resolveComponent(value, componentType, componentDb) {
  if (typeof value !== 'string') return { pass: true };
  if (value === 'unk') return { pass: true };
  if (!componentDb || !componentDb.items || componentDb.items.length === 0) return { pass: true };

  const items = componentDb.items;

  // 1. Exact name match
  const exact = items.find(e => e.name === value);
  if (exact) return { pass: true, canonical: exact.name };

  // 2. Case-insensitive name match
  const valueLower = value.toLowerCase();
  const caseMatch = items.find(e => e.name.toLowerCase() === valueLower);
  if (caseMatch) return { pass: true, canonical: caseMatch.name, repaired: true };

  // 3. Alias match (case-insensitive)
  const aliased = items.find(e =>
    e.aliases?.some(a => a.toLowerCase() === valueLower)
  );
  if (aliased) return { pass: true, canonical: aliased.name, repaired: true };

  // 4. No match
  return { pass: false, reason: 'not_in_component_db' };
}
