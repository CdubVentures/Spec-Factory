import type { ComponentSource, ComponentSourceProperty, FieldRule } from "../../../types/studio.ts";

export const COMPONENT_PROPERTY_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "url",
  "range",
  "mixed_number_range",
] as const;

export type ComponentPropertyType = (typeof COMPONENT_PROPERTY_TYPES)[number];

export interface PropertyMapping {
  field_key: string;
  type?: ComponentPropertyType;
  unit?: string;
  variance_policy:
    | "authoritative"
    | "upper_bound"
    | "lower_bound"
    | "range"
    | "override_allowed";
  tolerance: number | null;
  constraints?: string[];
  // WHY: When true, the property stays scoped to the component DB and never
  // appears as a product-level field (Key Navigator, Review grid). Optional so
  // legacy rows without the flag stay shape-compatible.
  component_only?: boolean;
}

export const VARIANCE_POLICIES = [
  { value: "authoritative", label: "Authoritative" },
  { value: "upper_bound", label: "Upper Bound" },
  { value: "lower_bound", label: "Lower Bound" },
  { value: "range", label: "Range (Ãƒâ€šÃ‚Â±tolerance)" },
] as const;

export function isComponentPropertyType(value: unknown): value is ComponentPropertyType {
  return COMPONENT_PROPERTY_TYPES.includes(value as ComponentPropertyType);
}

export function toComponentPropertyType(value: unknown): ComponentPropertyType {
  return isComponentPropertyType(value) ? value : "string";
}

export function isNumericComponentPropertyType(value: unknown): boolean {
  return value === "number" || value === "integer" || value === "range" || value === "mixed_number_range";
}

const LEGACY_PROPERTY_MAP: Record<string, string> = {
  max_dpi: "dpi",
  max_ips: "ips",
  max_acceleration: "acceleration",
  switch_force: "click_force",
  polling_rate: "polling_rate",
};

type LegacyPropertyInput = ComponentSourceProperty & {
  key?: unknown;
  property_key?: unknown;
};

export function migrateProperty(
  property: LegacyPropertyInput,
  _rules?: Record<string, FieldRule>,
): PropertyMapping {
  const legacyKey = String(property.key || property.field_key || "");
  const fieldKey = String(
    property.field_key || LEGACY_PROPERTY_MAP[legacyKey] || legacyKey,
  );
  const out: PropertyMapping = {
    field_key: fieldKey,
    variance_policy: ([
      "authoritative",
      "upper_bound",
      "lower_bound",
      "range",
      "override_allowed",
    ].includes(String(property.variance_policy || ""))
      ? String(property.variance_policy)
      : "authoritative") as PropertyMapping["variance_policy"],
    tolerance: property.tolerance != null ? Number(property.tolerance) : null,
  };
  if (isComponentPropertyType(property.type)) {
    out.type = property.type;
  }
  if (typeof property.unit === "string") out.unit = property.unit;
  if (Array.isArray(property.constraints) && property.constraints.length > 0) {
    out.constraints = property.constraints.map(String);
  }
  // WHY: Only carry the flag when explicitly true so the default shape stays
  // minimal — legacy round-trip tests assert the 3-key default form.
  if (property.component_only === true) out.component_only = true;
  return out;
}

export function createEmptyComponentSource(): ComponentSource {
  return {
    component_type: "",
    roles: {
      properties: [],
    },
  };
}
