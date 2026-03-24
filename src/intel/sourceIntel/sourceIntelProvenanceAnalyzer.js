// Source Intel — Provenance analyzer
// Evidence indexing, field reward application, and helpfulness collection.
// Depends on reward engine for per-field reward updates.

import { updateFieldReward } from './sourceIntelRewardEngine.js';

export function normalizeSourcePath(url) {
  try {
    const parsed = new URL(url);
    const rawPath = String(parsed.pathname || '/')
      .toLowerCase()
      .replace(/\/+/g, '/');
    if (!rawPath || rawPath === '/') {
      return '/';
    }
    return rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  } catch {
    return '/';
  }
}

function isHelperDomainToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return token === 'helper-files.local' ||
    token === 'category-authority.local' ||    token.includes('category_authority://');
}

export function isHelperSourceRecord(source = {}) {
  if (source.helperSource) {
    return true;
  }
  return isHelperDomainToken(source.rootDomain) ||
    isHelperDomainToken(source.host) ||
    isHelperDomainToken(source.url) ||
    isHelperDomainToken(source.finalUrl);
}

function valueIsFilled(value) {
  const text = String(value || '').trim().toLowerCase();
  return text !== '' && text !== 'unk';
}

export function buildAcceptedEvidenceIndex(provenance) {
  const domainField = new Set();
  const domainFieldMethod = new Set();
  const domainPathField = new Set();
  const domainPathFieldMethod = new Set();

  for (const [field, row] of Object.entries(provenance || {})) {
    if (!valueIsFilled(row?.value)) {
      continue;
    }
    for (const evidence of row?.evidence || []) {
      const rootDomain = evidence?.rootDomain || evidence?.host || '';
      if (!rootDomain || isHelperDomainToken(rootDomain) || isHelperDomainToken(evidence?.url || '')) {
        continue;
      }
      const path = normalizeSourcePath(evidence?.url || '');
      const method = String(evidence?.method || 'unknown');

      domainField.add(`${rootDomain}||${field}`);
      domainFieldMethod.add(`${rootDomain}||${field}||${method}`);
      domainPathField.add(`${rootDomain}||${path}||${field}`);
      domainPathFieldMethod.add(`${rootDomain}||${path}||${field}||${method}`);
    }
  }

  return {
    domainField,
    domainFieldMethod,
    domainPathField,
    domainPathFieldMethod
  };
}

function sourceCandidateOutcome({
  rootDomain,
  pathKey,
  field,
  method,
  source,
  acceptedEvidenceIndex,
  contradictionFieldSet
}) {
  const domainFieldKey = `${rootDomain}||${field}`;
  const domainFieldMethodKey = `${rootDomain}||${field}||${method}`;
  const pathFieldKey = `${rootDomain}||${pathKey}||${field}`;
  const pathFieldMethodKey = `${rootDomain}||${pathKey}||${field}||${method}`;

  const accepted =
    acceptedEvidenceIndex.domainPathFieldMethod.has(pathFieldMethodKey) ||
    acceptedEvidenceIndex.domainPathField.has(pathFieldKey) ||
    acceptedEvidenceIndex.domainFieldMethod.has(domainFieldMethodKey) ||
    acceptedEvidenceIndex.domainField.has(domainFieldKey);
  if (accepted) {
    return 'success';
  }

  const hasAnchorConflict = (source.anchorCheck?.majorConflicts || [])
    .some((item) => String(item?.field || '').trim() === field);
  const hasGlobalContradiction = contradictionFieldSet.has(field);
  if (hasAnchorConflict || hasGlobalContradiction || source.identity?.match === false) {
    return 'contradiction';
  }

  return 'fail';
}

export function applyFieldRewardsForSource({
  source,
  rootDomain,
  pathKey,
  entry,
  brandStats,
  pathStats,
  acceptedEvidenceIndex,
  contradictionFieldSet,
  seenAt,
  halfLifeDays
}) {
  for (const candidate of source.fieldCandidates || []) {
    const field = String(candidate?.field || '').trim();
    if (!field || !valueIsFilled(candidate?.value)) {
      continue;
    }
    const method = String(candidate?.method || 'unknown').trim() || 'unknown';
    const outcome = sourceCandidateOutcome({
      rootDomain,
      pathKey,
      field,
      method,
      source,
      acceptedEvidenceIndex,
      contradictionFieldSet
    });

    updateFieldReward(entry, {
      field,
      method,
      outcome,
      seenAt,
      halfLifeDays
    });
    if (brandStats) {
      updateFieldReward(brandStats, {
        field,
        method,
        outcome,
        seenAt,
        halfLifeDays
      });
    }
    updateFieldReward(pathStats, {
      field,
      method,
      outcome,
      seenAt,
      halfLifeDays
    });
  }
}

export function collectAcceptedDomainHelpfulness(provenance, criticalFieldSet) {
  const map = {};

  for (const [field, row] of Object.entries(provenance || {})) {
    if (!valueIsFilled(row?.value)) {
      continue;
    }

    const evidence = row?.evidence || [];
    if (!evidence.length) {
      continue;
    }

    const uniqueDomainsForField = new Set();
    for (const item of evidence) {
      const rootDomain = item?.rootDomain || item?.host || '';
      if (!rootDomain || isHelperDomainToken(rootDomain) || isHelperDomainToken(item?.url || '')) {
        continue;
      }
      uniqueDomainsForField.add(rootDomain);
    }

    for (const rootDomain of uniqueDomainsForField) {
      if (!map[rootDomain]) {
        map[rootDomain] = {
          fieldsAccepted: 0,
          acceptedCriticalFields: 0,
          perField: {}
        };
      }

      map[rootDomain].fieldsAccepted += 1;
      map[rootDomain].perField[field] = (map[rootDomain].perField[field] || 0) + 1;
      if (criticalFieldSet.has(field)) {
        map[rootDomain].acceptedCriticalFields += 1;
      }
    }
  }

  return map;
}

export function collectAcceptedPathHelpfulness(provenance, criticalFieldSet) {
  const map = {};

  for (const [field, row] of Object.entries(provenance || {})) {
    if (!valueIsFilled(row?.value)) {
      continue;
    }

    const evidence = row?.evidence || [];
    if (!evidence.length) {
      continue;
    }

    const uniquePathEntries = new Set();
    for (const item of evidence) {
      const rootDomain = item?.rootDomain || item?.host || '';
      if (!rootDomain || isHelperDomainToken(rootDomain) || isHelperDomainToken(item?.url || '')) {
        continue;
      }
      const path = normalizeSourcePath(item?.url || '');
      uniquePathEntries.add(`${rootDomain}||${path}`);
    }

    for (const compositeKey of uniquePathEntries) {
      if (!map[compositeKey]) {
        map[compositeKey] = {
          fieldsAccepted: 0,
          acceptedCriticalFields: 0,
          perField: {}
        };
      }

      map[compositeKey].fieldsAccepted += 1;
      map[compositeKey].perField[field] = (map[compositeKey].perField[field] || 0) + 1;
      if (criticalFieldSet.has(field)) {
        map[compositeKey].acceptedCriticalFields += 1;
      }
    }
  }

  return map;
}
