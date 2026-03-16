import { buildCandidateFieldMap } from '../shared/candidateHelpers.js';
import { evaluateAnchorConflicts } from '../../validation/anchors.js';
import { evaluateSourceIdentity } from '../../validation/identityGate.js';
import { applyIdentityGateToCandidates } from '../../../../pipeline/identityGateExtraction.js';
import { computeParserHealth } from '../../../../intel/siteFingerprint.js';

export function runSourceIdentityEvaluationPhase({
  source = {},
  pageData = {},
  mergedIdentityCandidates = {},
  mergedFieldCandidatesWithEvidence = [],
  anchors = [],
  jobIdentityLock = {},
  config = {},
  categoryConfig = { criticalFieldSet: new Set() },
  endpointIntel = {},
  buildCandidateFieldMapFn = buildCandidateFieldMap,
  evaluateAnchorConflictsFn = evaluateAnchorConflicts,
  evaluateSourceIdentityFn = evaluateSourceIdentity,
  applyIdentityGateToCandidatesFn = applyIdentityGateToCandidates,
  computeParserHealthFn = computeParserHealth,
} = {}) {
  const candidateFieldMap = buildCandidateFieldMapFn(mergedFieldCandidatesWithEvidence);
  const anchorCheck = evaluateAnchorConflictsFn(anchors, candidateFieldMap);
  const identity = evaluateSourceIdentityFn(
    {
      ...source,
      title: pageData.title,
      identityCandidates: mergedIdentityCandidates,
      connectionHint: candidateFieldMap.connection
    },
    jobIdentityLock || {},
    {
      identityGateBaseMatchThreshold: config.identityGateBaseMatchThreshold,
    }
  );

  const identityGatedCandidates = applyIdentityGateToCandidatesFn(
    mergedFieldCandidatesWithEvidence,
    identity
  );
  const anchorStatus =
    anchorCheck.majorConflicts.length > 0
      ? 'failed_major_conflict'
      : anchorCheck.conflicts.length > 0
        ? 'minor_conflicts'
        : 'pass';
  const manufacturerBrandMismatch =
    source.role === 'manufacturer' &&
    source.approvedDomain &&
    Array.isArray(identity.criticalConflicts) &&
    identity.criticalConflicts.includes('brand_mismatch') &&
    !(identity.reasons || []).includes('brand_match');
  const parserHealth = computeParserHealthFn({
    source,
    mergedFieldCandidates: mergedFieldCandidatesWithEvidence,
    identity,
    anchorCheck,
    criticalFieldSet: categoryConfig.criticalFieldSet,
    endpointSignals: endpointIntel.endpointSignals
  });

  return {
    anchorCheck,
    identity,
    identityGatedCandidates,
    anchorStatus,
    manufacturerBrandMismatch,
    parserHealth,
  };
}
