import { runConsensusEngine, applySelectionPolicyReducers } from '../scoring/consensusEngine.js';
import { applyListUnionReducers } from '../scoring/listUnionReducer.js';
import { applyCoreDeepGates } from '../features/indexing/discovery/index.js';

export function executeConsensusPhase({
  sourceResults,
  categoryConfig,
  fieldOrder,
  anchors,
  identityLock,
  productId,
  category,
  config,
  fieldRulesEngine
}) {
  const consensus = runConsensusEngine({
    sourceResults,
    categoryConfig,
    fieldOrder,
    anchors,
    identityLock,
    productId,
    category,
    config,
    fieldRulesEngine
  });

  if (fieldRulesEngine) {
    const reduced = applySelectionPolicyReducers({
      fields: consensus.fields,
      candidates: consensus.candidates,
      fieldRulesEngine
    });
    Object.assign(consensus.fields, reduced.fields);
  }

  if (fieldRulesEngine) {
    const unionResult = applyListUnionReducers({
      fields: consensus.fields,
      candidates: consensus.candidates,
      fieldRulesEngine
    });
    Object.assign(consensus.fields, unionResult.fields);
  }

  // WHY: Core/deep gates reject low-tier evidence for core facts, cluster deep numerics
  if (fieldRulesEngine) {
    applyCoreDeepGates({ consensus, fieldRulesEngine, config });
  }

  return consensus;
}
