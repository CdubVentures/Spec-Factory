import {
  applyComponentLibraryPriors,
  loadComponentLibrary,
} from '../../../../components/library.js';

export async function runComponentPriorPhase({
  identityGate = { validated: false },
  storage = null,
  normalized = { fields: {} },
  provenance = {},
  fieldOrder = [],
  logger = null,
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  loadComponentLibraryFn = loadComponentLibrary,
  applyComponentLibraryPriorsFn = applyComponentLibraryPriors,
} = {}) {
  let componentPriorFilledFields = [];
  let componentPriorMatches = [];
  let nextFieldsBelowPassTarget = fieldsBelowPassTarget;
  let nextCriticalFieldsBelowPassTarget = criticalFieldsBelowPassTarget;

  if (!identityGate.validated) {
    return {
      componentPriorFilledFields,
      componentPriorMatches,
      fieldsBelowPassTarget: nextFieldsBelowPassTarget,
      criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
    };
  }

  const componentLibrary = await loadComponentLibraryFn({ storage });
  const componentPrior = applyComponentLibraryPriorsFn({
    normalized,
    provenance,
    library: componentLibrary,
    fieldOrder,
    logger,
  });
  componentPriorFilledFields = componentPrior.filled_fields || [];
  componentPriorMatches = componentPrior.matched_components || [];

  if (componentPriorFilledFields.length > 0) {
    const belowSet = new Set(fieldsBelowPassTarget || []);
    const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
    for (const field of componentPriorFilledFields) {
      belowSet.delete(field);
      criticalSet.delete(field);
    }
    nextFieldsBelowPassTarget = [...belowSet];
    nextCriticalFieldsBelowPassTarget = [...criticalSet];
  }

  return {
    componentPriorFilledFields,
    componentPriorMatches,
    fieldsBelowPassTarget: nextFieldsBelowPassTarget,
    criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
  };
}
