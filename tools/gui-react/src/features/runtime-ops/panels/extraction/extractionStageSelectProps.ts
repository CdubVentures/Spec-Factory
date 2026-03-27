import type { ExtractionTabKey } from './extractionStageKeys.generated.ts';
import type { ExtractionPhasesResponse, ExtractionPluginData } from '../../types.ts';

export interface ExtractionPanelContext {
  data: ExtractionPhasesResponse | undefined;
  persistScope: string;
  runId?: string;
}

const EMPTY_PLUGIN: ExtractionPluginData = {
  entries: [],
  total: 0,
};

export const EXTRACTION_SELECT_PROPS: Record<ExtractionTabKey, (ctx: ExtractionPanelContext) => Record<string, unknown>> = {
  screenshot: (ctx) => ({
    data: ctx.data?.plugins?.screenshot ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
    runId: ctx.runId ?? '',
  }),
};
