// WHY: Single predicate consumed by Key Navigator (DraggableKeyList),
// Review Grid (ReviewMatrix.FieldHeaderCell), and Studio Workbench
// (FieldNameCell). Boundary contract — the icon strip on every surface
// derives from this function so the three views never drift on what a
// key visually IS.
//
// `shared/` cannot import from `features/`, so the small predicate atoms
// below mirror the canonical owners:
//   - VARIANT_GENERATOR_FIELD_KEYS  ← features/review/selectors/overrideFormState.ts
//   - component-self / identity-projection lock detection
//                                   ← features/studio/state/componentLockClient.ts
// If those contracts change, update here too.

export type KeyTypeIconKind =
  | 'variant'
  | 'pif'
  | 'component_self'
  | 'component_identity_projection'
  | 'component_attribute';

export interface DeriveKeyTypeIconsInput {
  readonly rule: Record<string, unknown> | null | undefined;
  readonly fieldKey: string;
  readonly belongsToComponent: string;
  // WHY: defensive fallback. A field that's declared as a component_type in
  // studioMap.component_sources but whose enum.source hasn't been set to
  // component_db.<self> yet is still semantically a component. Surfaces that
  // can resolve component_sources should pass this set so the icon fires.
  readonly knownComponentTypes?: ReadonlySet<string>;
}

const VARIANT_GENERATOR_FIELD_KEYS = new Set(['colors', 'editions']);
const IDENTITY_PROJECTION_FACETS = new Set(['brand', 'link']);

function readEnumSource(rule: Record<string, unknown>): string {
  const enumBlock = rule.enum;
  if (enumBlock && typeof enumBlock === 'object') {
    const nested = (enumBlock as { source?: unknown }).source;
    if (typeof nested === 'string') return nested;
  }
  const flat = rule.enum_source;
  if (typeof flat === 'string') return flat;
  if (flat && typeof flat === 'object') {
    const ref = (flat as { type?: unknown; ref?: unknown });
    if (ref.type === 'component_db' && typeof ref.ref === 'string') {
      return `component_db.${ref.ref}`;
    }
  }
  return '';
}

function isComponentSelfLocked(
  rule: Record<string, unknown>,
  fieldKey: string,
  knownComponentTypes?: ReadonlySet<string>,
): boolean {
  if (!fieldKey) return false;
  if (readEnumSource(rule) === `component_db.${fieldKey}`) return true;
  if (knownComponentTypes && knownComponentTypes.has(fieldKey)) return true;
  return false;
}

function readIdentityProjectionComponentType(rule: Record<string, unknown>): string {
  const projection = rule.component_identity_projection;
  if (!projection || typeof projection !== 'object') return '';
  const componentType = (projection as { component_type?: unknown }).component_type;
  const facet = (projection as { facet?: unknown }).facet;
  if (typeof componentType !== 'string') return '';
  const trimmed = componentType.trim();
  if (!trimmed) return '';
  if (typeof facet !== 'string') return '';
  if (!IDENTITY_PROJECTION_FACETS.has(facet.trim().toLowerCase())) return '';
  return trimmed;
}

function isComponentIdentityProjectionLocked(rule: Record<string, unknown>): boolean {
  const projection = rule.component_identity_projection;
  if (!projection || typeof projection !== 'object') return false;
  const componentType = (projection as { component_type?: unknown }).component_type;
  const facet = (projection as { facet?: unknown }).facet;
  if (typeof componentType !== 'string' || !componentType.trim()) return false;
  if (typeof facet !== 'string') return false;
  return IDENTITY_PROJECTION_FACETS.has(facet.trim().toLowerCase());
}

export function deriveKeyTypeIcons(input: DeriveKeyTypeIconsInput): readonly KeyTypeIconKind[] {
  const rule = input.rule && typeof input.rule === 'object' ? input.rule : {};
  const kinds: KeyTypeIconKind[] = [];

  // 1. variant — the rule flag OR the variant-generator key set
  const variantFlag = rule.variant_dependent === true;
  const variantGenerator = VARIANT_GENERATOR_FIELD_KEYS.has(input.fieldKey);
  if (variantFlag || variantGenerator) kinds.push('variant');

  // 2. pif
  if (rule.product_image_dependent === true) kinds.push('pif');

  // 3. component lineage — at most one of these three fires:
  //    - component_self (the field IS a component)
  //    - component_identity_projection (force-made <component>_brand / _link)
  //    - component_attribute (sibling subfield via component_sources)
  // self wins over attribute; identity_projection suppresses attribute too,
  // since the projection icon already implies component lineage.
  if (isComponentSelfLocked(rule, input.fieldKey, input.knownComponentTypes)) {
    kinds.push('component_self');
  } else if (isComponentIdentityProjectionLocked(rule)) {
    kinds.push('component_identity_projection');
  } else if (input.belongsToComponent && input.belongsToComponent.trim()) {
    kinds.push('component_attribute');
  }

  return kinds;
}

// WHY: which component does this key belong to? The icon strip uses this
// to color-tint every related icon (self + identity_projection + attribute)
// with one shared hue per component.
export function deriveOwningComponent(input: DeriveKeyTypeIconsInput): string {
  const rule = input.rule && typeof input.rule === 'object' ? input.rule : {};
  if (isComponentSelfLocked(rule, input.fieldKey, input.knownComponentTypes)) {
    return input.fieldKey;
  }
  const projectionType = readIdentityProjectionComponentType(rule);
  if (projectionType) return projectionType;
  if (input.belongsToComponent && input.belongsToComponent.trim()) {
    return input.belongsToComponent.trim();
  }
  return '';
}
