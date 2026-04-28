import type {
  PriorityProfile,
  AiAssistConfig,
  StudioConfig,
} from "../../../types/studio.ts";

export interface DataListEntry {
  field: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
}

export interface FieldStudioMapValidationResponse {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: StudioConfig | null;
}

export {
  btnPrimary,
  btnAction,
  btnSecondary,
  btnDanger,
  sectionCls,
  actionBtnWidth,
} from '../../../shared/ui/buttonClasses.ts';
export { btnDangerSolid } from '../../../shared/ui/buttonClasses.ts';
