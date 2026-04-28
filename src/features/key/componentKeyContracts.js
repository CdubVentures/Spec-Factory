const COMPONENT_IDENTITY_FACETS = new Set(['brand', 'link']);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isComponentParentRule(fieldKey, rule = {}) {
  const key = clean(fieldKey);
  if (!key) return false;
  const nestedSource = clean(rule?.enum?.source);
  if (nestedSource === `component_db.${key}`) return true;
  const flatSource = rule?.enum_source;
  if (clean(flatSource) === `component_db.${key}`) return true;
  return Boolean(
    flatSource
      && typeof flatSource === 'object'
      && flatSource.type === 'component_db'
      && clean(flatSource.ref) === key,
  );
}

function readProjection(rule = {}) {
  const projection = rule?.component_identity_projection;
  if (!projection || typeof projection !== 'object') return null;
  const componentType = clean(projection.component_type);
  const facet = clean(projection.facet).toLowerCase();
  if (!componentType || !COMPONENT_IDENTITY_FACETS.has(facet)) return null;
  return { componentType, facet };
}

function isParentPublished({ specDb, productId, parentFieldKey }) {
  if (!specDb || !productId || !parentFieldKey) return false;
  if (typeof specDb.hasPublishedValue === 'function') {
    return Boolean(specDb.hasPublishedValue(productId, parentFieldKey));
  }
  if (typeof specDb.getResolvedFieldCandidate === 'function') {
    return Boolean(specDb.getResolvedFieldCandidate(productId, parentFieldKey));
  }
  return false;
}

export function resolveComponentKeyRunContract({
  fieldKey,
  fieldRule,
  specDb = null,
  productId = '',
} = {}) {
  const key = clean(fieldKey);
  if (!key || !fieldRule || typeof fieldRule !== 'object') {
    return {
      dedicated_run: false,
      component_run_kind: '',
      component_parent_key: '',
      component_dependency_satisfied: true,
      run_blocked_reason: '',
    };
  }

  if (isComponentParentRule(key, fieldRule)) {
    return {
      dedicated_run: true,
      component_run_kind: 'component',
      component_parent_key: key,
      component_dependency_satisfied: true,
      run_blocked_reason: '',
    };
  }

  const projection = readProjection(fieldRule);
  if (!projection) {
    return {
      dedicated_run: false,
      component_run_kind: '',
      component_parent_key: '',
      component_dependency_satisfied: true,
      run_blocked_reason: '',
    };
  }

  const dependencySatisfied = isParentPublished({
    specDb,
    productId,
    parentFieldKey: projection.componentType,
  });

  return {
    dedicated_run: true,
    component_run_kind: `component_${projection.facet}`,
    component_parent_key: projection.componentType,
    component_dependency_satisfied: dependencySatisfied,
    run_blocked_reason: dependencySatisfied ? '' : 'component_parent_unpublished',
  };
}

export function isDedicatedComponentKey(fieldKey, fieldRule) {
  return resolveComponentKeyRunContract({ fieldKey, fieldRule }).dedicated_run;
}

// WHY: studioMap.component_sources[].roles.properties[] declares which
// fields are sibling attributes of which component. Surfaces that need to
// flag component-attribute keys (KeyFinder summary, review grid, workbench)
// walk this same shape — keep the canonical walk here.
export function buildComponentPropertyOwnership(studioMap) {
  const map = new Map();
  if (!studioMap || typeof studioMap !== 'object') return map;
  const sources = Array.isArray(studioMap.component_sources) ? studioMap.component_sources : [];
  for (const src of sources) {
    const compType = clean(src?.component_type);
    if (!compType) continue;
    const props = Array.isArray(src?.roles?.properties) ? src.roles.properties : [];
    for (const prop of props) {
      const fieldKey = clean(prop?.field_key);
      if (!fieldKey || map.has(fieldKey)) continue;
      map.set(fieldKey, compType);
    }
  }
  return map;
}
