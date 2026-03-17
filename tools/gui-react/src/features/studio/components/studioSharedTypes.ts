import type {
  PriorityProfile,
  AiAssistConfig,
  StudioConfig,
} from "../../../types/studio";

export interface DataListEntry {
  field: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
}

export interface ComponentSourceRoles {
  maker?: string;
  aliases?: string[];
  links?: string[];
  properties?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface FieldStudioMapValidationResponse {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: StudioConfig | null;
}

export const ROLE_DEFS = [
  { id: "aliases", label: "Name Variants (Aliases)" },
  { id: "maker", label: "Maker (Brand)" },
  { id: "links", label: "Reference URLs (Links)" },
  { id: "properties", label: "Attributes (Properties)" },
] as const;

export type RoleId = (typeof ROLE_DEFS)[number]["id"];

export const btnPrimary =
  "px-4 py-2 text-sm sf-primary-button transition-colors disabled:opacity-50";
export const btnAction =
  "px-3 py-1.5 text-sm sf-icon-button transition-colors disabled:opacity-50";
export const btnSecondary =
  "px-3 py-1.5 text-sm sf-icon-button transition-colors disabled:opacity-50";
export const btnDanger =
  "px-3 py-1.5 text-sm sf-danger-button transition-colors disabled:opacity-50";
export const sectionCls =
  "bg-white sf-dk-surface-800 rounded border sf-border-default p-4";
export const actionBtnWidth = "w-56";
