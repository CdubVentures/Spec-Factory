import {
  str,
  unique,
  firstFieldValue,
  firstFieldValueMatching,
} from './identityGatePrimitives.js';
import { isPlausibleDimensionValue } from './identityGateConflicts.js';

export function canonicalSourceId(source = {}, index = 0) {
  if (source.source_id) {
    return String(source.source_id);
  }
  if (source.sourceId) {
    return String(source.sourceId);
  }
  if (source.rootDomain) {
    return String(source.rootDomain);
  }
  if (source.host) {
    return String(source.host);
  }
  return `source_${String(index + 1).padStart(3, '0')}`;
}

function roundIdentityNumber(value) {
  const parsed = Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number.parseFloat(parsed.toFixed(6));
}

function summarizeIdentitySource(source = {}, index = 0, extra = {}) {
  const identity = source.identity || {};
  return {
    sourceId: canonicalSourceId(source, index),
    url: source.finalUrl || source.url || '',
    host: String(source.host || '').trim(),
    rootDomain: String(source.rootDomain || '').trim(),
    role: String(source.role || '').trim(),
    tier: Number.parseInt(String(source.tier ?? 0), 10) || 0,
    candidateBrand: String(source.identityCandidates?.brand || '').trim(),
    candidateModel: String(source.identityCandidates?.model || '').trim(),
    identityScore: roundIdentityNumber(identity.score),
    identityConfidence: roundIdentityNumber(identity.confidence ?? identity.score),
    reasonCodes: unique([
      ...(identity.reasonCodes || []),
      ...(identity.criticalConflicts || []),
    ]),
    ...extra,
  };
}

export function summarizeIdentitySourceSnake(source = {}, index = 0, extra = {}) {
  const summary = summarizeIdentitySource(source, index);
  return {
    source_id: summary.sourceId,
    url: summary.url,
    host: summary.host,
    root_domain: summary.rootDomain,
    role: summary.role,
    tier: summary.tier,
    candidate_brand: summary.candidateBrand,
    candidate_model: summary.candidateModel,
    identity_score: summary.identityScore,
    identity_confidence: summary.identityConfidence,
    reason_codes: summary.reasonCodes,
    ...extra,
  };
}

function isRejectedSiblingIdentitySource(source = {}) {
  if (source.discoveryOnly) {
    return false;
  }
  const identity = source.identity || {};
  if (identity.match) {
    return false;
  }
  const hasModelSignal = Boolean(
    str(source.identityCandidates?.model)
    || str(source.title)
    || str(source.url),
  );
  if (!hasModelSignal) {
    return false;
  }
  const reasonCodes = new Set(unique([
    ...(identity.reasonCodes || []),
    ...(identity.criticalConflicts || []),
  ]));
  return (
    reasonCodes.has('model_mismatch')
    || reasonCodes.has('negative_token_present')
    || reasonCodes.has('unexpected_variant_token')
    || reasonCodes.has('model_numeric_range_out_of_range')
    || (identity.matchedNegativeTokens || []).length > 0
    || (identity.missingRequiredTokens || []).length > 0
  );
}

export function buildAcceptedSourceRows(accepted = [], sourceResults = []) {
  return accepted.map((source) => summarizeIdentitySource(source, sourceResults.indexOf(source)));
}

export function buildRejectedSiblingSourceRows(sourceResults = []) {
  return sourceResults
    .filter((source) => isRejectedSiblingIdentitySource(source))
    .map((source, index) => summarizeIdentitySource(source, index));
}

function buildAggregateContradictionContributors(accepted = [], conflict = '') {
  if (conflict === 'connection_class_conflict') {
    return accepted.filter((source) => firstFieldValue(source, 'connection'));
  }
  if (conflict === 'sku_conflict') {
    return accepted.filter((source) => str(source.identityCandidates?.sku));
  }
  if (conflict === 'size_class_conflict') {
    return accepted.filter((source) => (
      firstFieldValueMatching(source, 'lngth', (value) => isPlausibleDimensionValue('lngth', value))
      || firstFieldValueMatching(source, 'width', (value) => isPlausibleDimensionValue('width', value))
      || firstFieldValueMatching(source, 'height', (value) => isPlausibleDimensionValue('height', value))
    ));
  }
  return [];
}

function buildContradictionContributorRows(sourceResults = [], accepted = [], contradiction = {}) {
  if (String(contradiction?.source || '') === 'aggregate') {
    return buildAggregateContradictionContributors(accepted, contradiction?.conflict);
  }
  const targetUrl = String(contradiction?.source || '').trim();
  if (!targetUrl) {
    return [];
  }
  return sourceResults.filter((source) => String(source.finalUrl || source.url || '').trim() === targetUrl);
}

export function buildAcceptedConflictContributorRows(sourceResults = [], accepted = [], contradictions = []) {
  const contributorMap = new Map();
  for (const contradiction of contradictions) {
    const conflict = String(contradiction?.conflict || '').trim();
    if (!conflict) continue;
    for (const source of buildContradictionContributorRows(sourceResults, accepted, contradiction)) {
      if (!accepted.includes(source)) continue;
      const url = String(source.finalUrl || source.url || '').trim();
      if (!url) continue;
      if (!contributorMap.has(url)) {
        contributorMap.set(url, {
          source,
          conflicts: new Set(),
        });
      }
      contributorMap.get(url).conflicts.add(conflict);
    }
  }
  return [...contributorMap.values()].map(({ source, conflicts }) => summarizeIdentitySource(
    source,
    sourceResults.indexOf(source),
    { contributingConflicts: [...conflicts].sort() },
  ));
}

export function buildFirstConflictTrigger(sourceResults = [], accepted = [], contradictions = []) {
  const first = contradictions[0];
  if (!first) {
    return null;
  }
  const contributors = buildContradictionContributorRows(sourceResults, accepted, first)
    .map((source) => summarizeIdentitySource(source, sourceResults.indexOf(source)));
  return {
    source: String(first.source || '').trim(),
    conflict: String(first.conflict || '').trim(),
    contributors,
  };
}
