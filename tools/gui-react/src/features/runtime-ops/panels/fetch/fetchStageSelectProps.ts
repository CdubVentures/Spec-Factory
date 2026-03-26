import type { FetchTabKey } from './fetchStageKeys.generated.ts';
import type { FetchPhasesResponse, FetchPluginData } from '../../types.ts';

export interface FetchPanelContext {
  data: FetchPhasesResponse | undefined;
  persistScope: string;
}

// WHY: All panels read data.records (FetchPluginData shape from the generic builder).
// Domain-specific empty defaults caused crashes because they used custom field names
// (scroll_records, expansion_records, etc.) that panels don't read.
const EMPTY_PLUGIN: FetchPluginData = { records: [], total: 0 };

export const FETCH_SELECT_PROPS: Record<FetchTabKey, (ctx: FetchPanelContext) => Record<string, unknown>> = {
  stealth: (ctx) => ({
    data: ctx.data?.stealth ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
  }),
  cookie_consent: (ctx) => ({
    data: ctx.data?.cookie_consent ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
  }),
  auto_scroll: (ctx) => ({
    data: ctx.data?.auto_scroll ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
  }),
  dom_expansion: (ctx) => ({
    data: ctx.data?.dom_expansion ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
  }),
  css_override: (ctx) => ({
    data: ctx.data?.css_override ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
  }),
};
