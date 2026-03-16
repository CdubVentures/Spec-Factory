// WHY: Pure-computation plan diff — compares two indexing runs field-by-field
// to show which run produced better evidence for each field.

import { toTierNumber } from '../../../utils/tierHelpers.js';

/**
 * Build a field map from an item-indexing-extraction packet.
 * Returns { [fieldKey]: { value, host, tier, confidence, found } }
 */
export function buildFieldMapFromPacket(packet) {
  const result = {};
  const sourceIndex = packet?.field_source_index ?? {};
  const candidateRows = packet?.sql_projection?.candidate_rows ?? [];

  const valueMap = new Map();
  for (const row of candidateRows) {
    const key = String(row?.field_key || '').trim();
    if (key) valueMap.set(key, row.value ?? null);
  }

  const allKeys = new Set([...Object.keys(sourceIndex), ...valueMap.keys()]);

  for (const key of allKeys) {
    const src = sourceIndex[key] ?? {};
    const value = valueMap.get(key) ?? null;
    const host = src.host ?? null;
    const tier = src.tier ?? null;
    const confidence = src.confidence ?? 0;
    const found = value !== null || host !== null;
    result[key] = { value, host, tier, confidence, found };
  }

  return result;
}

/**
 * Compare two runs field-by-field.
 * Winner logic (priority order):
 * 1. Neither found → 'neither'
 * 2. Only one found → that run wins
 * 3. Both found, different tier (null → 99) → lower tier wins
 * 4. Same tier, different confidence → higher confidence wins
 * 5. Same tier + confidence → 'tie'
 */
export function diffRunPlans({ run1Summary, run2Summary }) {
  const r1 = run1Summary ?? {};
  const r2 = run2Summary ?? {};
  const r1Fields = r1.fields ?? {};
  const r2Fields = r2.fields ?? {};

  const allKeys = new Set([...Object.keys(r1Fields), ...Object.keys(r2Fields)]);
  const fields = [];
  let run1Wins = 0;
  let run2Wins = 0;
  let ties = 0;
  let neither = 0;

  for (const key of allKeys) {
    const f1 = r1Fields[key] ?? { value: null, host: null, tier: null, confidence: 0, found: false };
    const f2 = r2Fields[key] ?? { value: null, host: null, tier: null, confidence: 0, found: false };

    let winner;
    let reason;

    if (!f1.found && !f2.found) {
      winner = 'neither';
      reason = 'Not found in either run';
      neither++;
    } else if (f1.found && !f2.found) {
      winner = 'run1';
      reason = 'run1 found, other did not';
      run1Wins++;
    } else if (!f1.found && f2.found) {
      winner = 'run2';
      reason = 'run2 found, other did not';
      run2Wins++;
    } else {
      const t1 = toTierNumber(f1.tier) ?? 99;
      const t2 = toTierNumber(f2.tier) ?? 99;

      if (t1 < t2) {
        winner = 'run1';
        reason = 'Lower tier (run1)';
        run1Wins++;
      } else if (t2 < t1) {
        winner = 'run2';
        reason = 'Lower tier (run2)';
        run2Wins++;
      } else if (f1.confidence > f2.confidence) {
        winner = 'run1';
        reason = 'Higher confidence (run1)';
        run1Wins++;
      } else if (f2.confidence > f1.confidence) {
        winner = 'run2';
        reason = 'Higher confidence (run2)';
        run2Wins++;
      } else {
        winner = 'tie';
        reason = 'Same tier and confidence';
        ties++;
      }
    }

    fields.push({
      field: key,
      run1: f1,
      run2: f2,
      winner,
      reason,
    });
  }

  return {
    run1_id: r1.run_id ?? null,
    run2_id: r2.run_id ?? null,
    fields,
    run1_wins: run1Wins,
    run2_wins: run2Wins,
    ties,
    neither,
  };
}
