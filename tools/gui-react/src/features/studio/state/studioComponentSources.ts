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
  return {
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
}

export function createEmptyComponentSource(): ComponentSource {
  return {
    component_type: "",
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
