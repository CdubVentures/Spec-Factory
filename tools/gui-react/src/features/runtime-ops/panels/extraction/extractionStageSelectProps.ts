import type { ExtractionTabKey } from './extractionStageKeys.ts';

export interface ExtractionPanelContext {
  data: unknown;
  persistScope: string;
}

export const EXTRACTION_SELECT_PROPS: Record<ExtractionTabKey, (ctx: ExtractionPanelContext) => Record<string, unknown>> = {
  placeholder: (ctx) => ({ persistScope: ctx.persistScope }),
};
