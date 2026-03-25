import type { ValidationTabKey } from './validationStageKeys.ts';

export interface ValidationPanelContext {
  data: unknown;
  persistScope: string;
}

export const VALIDATION_SELECT_PROPS: Record<ValidationTabKey, (ctx: ValidationPanelContext) => Record<string, unknown>> = {
  placeholder: (ctx) => ({ persistScope: ctx.persistScope }),
};
