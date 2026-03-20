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

export {
  btnPrimary,
  btnAction,
  btnSecondary,
  btnDanger,
  sectionCls,
  actionBtnWidth,
} from '../../../shared/ui/buttonClasses';
export { btnDangerSolid } from '../../../shared/ui/buttonClasses';
