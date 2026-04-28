import type { StudioConfig } from "../../../types/studio.ts";

export interface DataListEntry {
  field: string;
  label?: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
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
