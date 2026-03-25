import type { FetchTabKey } from './fetchStageKeys.ts';
import type { FetchPhasesResponse, FetchStealthData } from '../../types.ts';

export interface FetchPanelContext {
  data: FetchPhasesResponse | undefined;
  persistScope: string;
}

const EMPTY_STEALTH: FetchStealthData = {
  patches: [],
  injections: [],
  total_injected: 0,
  total_failed: 0,
};

export const FETCH_SELECT_PROPS: Record<FetchTabKey, (ctx: FetchPanelContext) => Record<string, unknown>> = {
  stealth: (ctx) => ({
    data: ctx.data?.stealth ?? EMPTY_STEALTH,
    persistScope: ctx.persistScope,
  }),
  auto_scroll: (ctx) => ({ persistScope: ctx.persistScope, toolKey: 'playwright', toolCategory: 'script' }),
  dom_expansion: (ctx) => ({ persistScope: ctx.persistScope, toolKey: 'playwright', toolCategory: 'script' }),
  css_override: (ctx) => ({ persistScope: ctx.persistScope, toolKey: 'playwright', toolCategory: 'script' }),
};
