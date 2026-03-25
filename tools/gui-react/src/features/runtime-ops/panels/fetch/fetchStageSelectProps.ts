import type { FetchTabKey } from './fetchStageKeys.generated.ts';
import type { FetchPhasesResponse, FetchStealthData, FetchAutoScrollData, FetchDomExpansionData, FetchCssOverrideData } from '../../types.ts';

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

const EMPTY_AUTO_SCROLL: FetchAutoScrollData = {
  scroll_records: [],
  total_scrolled: 0,
  total_skipped: 0,
};

const EMPTY_DOM_EXPANSION: FetchDomExpansionData = {
  expansion_records: [],
  total_expanded: 0,
  total_skipped: 0,
  total_clicks: 0,
  total_found: 0,
};

const EMPTY_CSS_OVERRIDE: FetchCssOverrideData = {
  override_records: [],
  total_overridden: 0,
  total_skipped: 0,
  total_elements_revealed: 0,
};

export const FETCH_SELECT_PROPS: Record<FetchTabKey, (ctx: FetchPanelContext) => Record<string, unknown>> = {
  stealth: (ctx) => ({
    data: ctx.data?.stealth ?? EMPTY_STEALTH,
    persistScope: ctx.persistScope,
  }),
  auto_scroll: (ctx) => ({
    data: ctx.data?.auto_scroll ?? EMPTY_AUTO_SCROLL,
    persistScope: ctx.persistScope,
  }),
  dom_expansion: (ctx) => ({
    data: ctx.data?.dom_expansion ?? EMPTY_DOM_EXPANSION,
    persistScope: ctx.persistScope,
  }),
  css_override: (ctx) => ({
    data: ctx.data?.css_override ?? EMPTY_CSS_OVERRIDE,
    persistScope: ctx.persistScope,
  }),
};
