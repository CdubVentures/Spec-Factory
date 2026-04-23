// Pure selector: decides what manual-override UI the drawer should render
// for a given field. Kept side-effect-free so root-project node --test can
// exercise it via loadBundledModule without React or Radix dependencies.

export type OverrideFormMode = 'suppressed' | 'scalar' | 'variant';

export interface VariantOption {
  id: string;
  label: string;
}

export interface VariantInput {
  variant_id: string;
  variant_label?: string | null;
}

export interface FieldRuleLike {
  variant_dependent?: boolean;
}

export interface OverrideFormState {
  mode: OverrideFormMode;
  variantOptions: VariantOption[];
}

export interface DeriveOverrideFormStateInput {
  fieldKey: string;
  fieldRule: FieldRuleLike | null | undefined;
  moduleClass: string | null | undefined;
  variants: VariantInput[];
}

// WHY: Shared across the drawer (OverrideAndClearSection suppression) and the
// matrix (inline-edit block). Keep as a set so lookups are O(1) and the list
// lives in one place. If another variant-generator field is added, update here.
export const VARIANT_GENERATOR_FIELD_KEYS = new Set<string>(['colors', 'editions']);

export function isVariantGeneratorField(fieldKey: string): boolean {
  return VARIANT_GENERATOR_FIELD_KEYS.has(fieldKey);
}

// WHY: variantGenerator (colors, editions) is CEF-authoritative — manual
// override here would desync the variants table and every variant_dependent
// field downstream, so suppress the UI entirely. Otherwise variant_dependent
// fields render a variant selector above the input; everything else is a
// plain scalar input.
export function deriveOverrideFormState(
  input: DeriveOverrideFormStateInput,
): OverrideFormState {
  if (input.moduleClass === 'variantGenerator') {
    return { mode: 'suppressed', variantOptions: [] };
  }
  if (input.fieldRule?.variant_dependent === true) {
    const variantOptions: VariantOption[] = (input.variants ?? []).map((v) => ({
      id: String(v.variant_id),
      label: String(v.variant_label ?? v.variant_id),
    }));
    return { mode: 'variant', variantOptions };
  }
  return { mode: 'scalar', variantOptions: [] };
}

// WHY: The drawer variant dropdown must survive tab-away / remount. The
// persisted id may be stale (catalog reshuffled, variant removed) so resolve
// against the current option list and fall back to the first option.
export function resolveSelectedVariantId(input: {
  mode: OverrideFormMode;
  variantOptions: VariantOption[];
  storedVariantId: string;
}): string {
  if (input.mode !== 'variant') return '';
  if (input.variantOptions.length === 0) return '';
  if (input.storedVariantId) {
    const match = input.variantOptions.find((opt) => opt.id === input.storedVariantId);
    if (match) return match.id;
  }
  return input.variantOptions[0].id;
}
