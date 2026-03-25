import type { FetchTabKey } from './fetchStageKeys.ts';

export interface FetchPanelContext {
  data: unknown;
  persistScope: string;
}

export const FETCH_SELECT_PROPS: Record<FetchTabKey, (ctx: FetchPanelContext) => Record<string, unknown>> = {
  placeholder: (ctx) => ({ persistScope: ctx.persistScope }),
};
