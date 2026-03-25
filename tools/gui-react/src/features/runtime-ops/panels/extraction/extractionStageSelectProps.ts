import type { ExtractionTabKey } from './extractionStageKeys.generated.ts';
import type { ExtractionPhasesResponse, ExtractionScreenshotData } from '../../types.ts';

export interface ExtractionPanelContext {
  data: ExtractionPhasesResponse | undefined;
  persistScope: string;
}

const EMPTY_SCREENSHOT: ExtractionScreenshotData = {
  entries: [],
  total_screenshots: 0,
  total_bytes: 0,
};

export const EXTRACTION_SELECT_PROPS: Record<ExtractionTabKey, (ctx: ExtractionPanelContext) => Record<string, unknown>> = {
  screenshot: (ctx) => ({
    data: ctx.data?.screenshot ?? EMPTY_SCREENSHOT,
    persistScope: ctx.persistScope,
  }),
};
