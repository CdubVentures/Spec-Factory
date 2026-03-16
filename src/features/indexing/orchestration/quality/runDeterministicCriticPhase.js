import { runDeterministicCritic } from '../../validation/critic.js';

export function runDeterministicCriticPhase({
  normalized = { fields: {} },
  provenance = {},
  categoryConfig = { criticalFieldSet: new Set() },
  learnedConstraints = {},
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  runDeterministicCriticFn = runDeterministicCritic,
} = {}) {
  const criticDecisions = runDeterministicCriticFn({
    normalized,
    provenance,
    fieldReasoning: {},
    categoryConfig,
    constraints: learnedConstraints,
  });
  let nextFieldsBelowPassTarget = fieldsBelowPassTarget;
  let nextCriticalFieldsBelowPassTarget = criticalFieldsBelowPassTarget;

  if ((criticDecisions.reject || []).length > 0) {
    const belowSet = new Set(fieldsBelowPassTarget || []);
    const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
    for (const row of criticDecisions.reject || []) {
      if (!row?.field) {
        continue;
      }
      belowSet.add(row.field);
      if (categoryConfig.criticalFieldSet.has(row.field)) {
        criticalSet.add(row.field);
      }
    }
    nextFieldsBelowPassTarget = [...belowSet];
    nextCriticalFieldsBelowPassTarget = [...criticalSet];
  }

  return {
    criticDecisions,
    fieldsBelowPassTarget: nextFieldsBelowPassTarget,
    criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
  };
}
