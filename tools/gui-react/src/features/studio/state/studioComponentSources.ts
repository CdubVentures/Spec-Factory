import {
  DEFAULT_PRIORITY_PROFILE,
  normalizeAiAssistConfig,
} from "./studioPriority.ts";
import type { ComponentSource, FieldRule } from "../../../types/studio.ts";

export interface PropertyMapping {
  field_key: string;
  variance_policy:
    | "authoritative"
    | "upper_bound"
    | "lower_bound"
    | "range"
    | "override_allowed";
  tolerance: number | null;
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

const LEGACY_PROPERTY_MAP: Record<string, string> = {
  max_dpi: "dpi",
  max_ips: "ips",
  max_acceleration: "acceleration",
  switch_force: "click_force",
  polling_rate: "polling_rate",
};

export function migrateProperty(
  property: Record<string, unknown>,
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
  // WHY: Only carry the flag when explicitly true so the default shape stays
  // minimal — legacy round-trip tests assert the 3-key default form.
  if (property.component_only === true) out.component_only = true;
  return out;
}

export function createEmptyComponentSource(): ComponentSource {
  return {
    component_type: "",
    // Phase 3: default to mode=sheet + empty sheet so the inline gate fires
    // immediately on row creation (matches the back-end's normalizeSourceMode
    // default and forces the author to fill the sheet name before save).
    mode: "sheet",
    sheet: "",
    roles: {
      maker: "yes",
      aliases: [],
      links: [],
      properties: [],
    },
    priority: { ...DEFAULT_PRIORITY_PROFILE },
    ai_assist: normalizeAiAssistConfig(undefined),
  };
}
