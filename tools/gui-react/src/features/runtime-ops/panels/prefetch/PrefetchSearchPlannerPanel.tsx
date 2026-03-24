import { useMemo } from 'react';
import { usePersistedExpandMap } from '../../../../stores/tabStore';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import type { PrefetchLlmCall, SearchPlanPass, SearchPlanEnhancementRow, PrefetchLiveSettings, PrefetchSearchResult } from '../../types';
import { llmCallStatusBadgeClass, formatMs } from '../../helpers';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { LlmCallCard } from '../../components/LlmCallCard';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
import type { RuntimeIdxBadge } from '../../types';
import { classifyQueryTier, tierLabel as tierLabelSsot, tierChipClass } from '../../selectors/searchProfileTierHelpers.js';

interface PrefetchSearchPlannerPanelProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
  persistScope?: string;
}

interface PlannerPromptInput {
  criticalFields: string[];
  missingCriticalFields: string[];
  existingQueries: string[];
  product?: {
    category?: string;
    brand?: string;
    model?: string;
    variant?: string;
  };
}

interface PlannerInputSummary {
  callCountWithPayload: number;
  criticalFields: string[];
  missingCriticalFields: string[];
  existingQueries: string[];
  products: string[];
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeToken(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const token = normalizeToken(value);
    if (token) unique.add(token);
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePlannerPayload(promptPreview: string | null): PlannerPromptInput | null {
  if (!promptPreview) return null;
  const topLevel = safeParseJson(promptPreview);
  const parseObject = (value: unknown): PlannerPromptInput | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const candidate: PlannerPromptInput = {
      criticalFields: normalizeList(source.criticalFields),
      missingCriticalFields: normalizeList(source.missingCriticalFields),
      existingQueries: normalizeList(source.existingQueries),
      product:
        source.product && typeof source.product === 'object' && !Array.isArray(source.product)
          ? source.product as PlannerPromptInput['product']
          : undefined,
    };
    if (
      candidate.criticalFields.length > 0
      || candidate.missingCriticalFields.length > 0
      || candidate.existingQueries.length > 0
      || !!candidate.product
    ) {
      return candidate;
    }
    return null;
  };

  const direct = parseObject(topLevel);
  if (direct) return direct;

  const nestedUser = topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel)
    ? String((topLevel as Record<string, unknown>).user || '')
    : '';
  return parseObject(safeParseJson(nestedUser));
}

function reasonBadgeClass(reason: string): string {
  const normalized = String(reason || '').trim().toLowerCase();
  if (normalized.startsWith('discovery_planner')) return 'sf-chip-info';
  return 'sf-chip-neutral';
}

function normalizeQuery(query: string): string {
  return String(query || '').trim();
}

/* ── Theme-aligned helpers (Schema 4 view) ────────────────────────── */

function isSchema4PlannerPath(calls: PrefetchLlmCall[]): boolean {
  if (calls.length === 0) return false;
  return calls.some((call) => call.reason === 'needset_search_planner');
}


/* ── Schema 4 NeedSet Planner View ────────────────────────────────── */

function Schema4PlannerView({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: PrefetchSearchPlannerPanelProps) {
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCalls:${persistScope}`, false);
  const plans = searchPlans || [];

  const totalQueries = plans.reduce((sum, plan) => sum + plan.queries_generated.length, 0);
  const focusGroupCount = plans.length;
  const familyCount = useMemo(() => {
    const families = new Set<string>();
    for (const plan of plans) {
      const name = String(plan.pass_name || '').trim().toLowerCase();
      if (name) families.add(name);
    }
    return families.size;
  }, [plans]);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const hasFailed = calls.some((c) => c.status === 'failed');
  const overallStatus = hasFailed ? 'failed' : 'finished';

  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((r) => normalizeToken(normalizeQuery(r.query))),
  ), [searchResults]);

  const allQueries = useMemo(() => {
    const rows: { query: string; family: string; targetFields: string[] }[] = [];
    for (const plan of plans) {
      for (const query of plan.queries_generated) {
        const fields = plan.query_target_map?.[query] || [];
        rows.push({ query, family: plan.pass_name || 'default', targetFields: fields });
      }
    }
    return rows;
  }, [plans]);

  const primaryCall = calls[0];

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">NeedSet Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Search Plan</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'finished' ? 'sf-chip-success' : 'sf-chip-danger'} />
        </>}
        trailing={<>
          <Chip label="Schema 4" className="sf-chip-info" />
          <Chip label="LLM" className="sf-chip-warning" />
          <Tip text="The NeedSet Planner generates targeted search queries to close field coverage gaps identified by the NeedSet. Schema 4 uses a single focused LLM call instead of multi-pass discovery." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={totalQueries} label="queries planned" />
          <HeroStat value={focusGroupCount} label="focus groups" />
          <HeroStat value={familyCount} label="families used" />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          NeedSet planner generated <strong className="sf-text-primary not-italic">{totalQueries}</strong> targeted
          {' '}queries across <strong className="sf-text-primary not-italic">{focusGroupCount}</strong> focus
          {' '}group{focusGroupCount !== 1 ? 's' : ''} to close field coverage gaps
          {totalTokens > 0 && (
            <> &mdash; used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>
      </HeroBand>

      {/* ── Query Plan ── */}
      <div>
        <SectionHeader>query plan</SectionHeader>
        {allQueries.length > 0 ? (
          <div className="overflow-x-auto overflow-y-auto max-h-[56rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['query', 'family', 'target fields'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allQueries.map((row, i) => {
                  const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(row.query)));
                  return (
                    <tr key={i} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                      <td className="py-1.5 px-4 font-mono sf-text-primary max-w-[24rem]">
                        {row.query}
                        {sentToSearch && (
                          <span className="ml-2 px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                            Sent to search
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-4">
                        <Chip label={row.family.replace(/_/g, ' ')} className="sf-chip-accent" />
                      </td>
                      <td className="py-1.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.targetFields.length > 0
                            ? row.targetFields.map((f) => <Chip key={f} label={f} className="sf-chip-success" />)
                            : <span className="sf-text-caption sf-text-subtle">&mdash;</span>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 text-center text-xs sf-text-muted">
            No query plan data available yet.
          </div>
        )}
      </div>

      {/* ── Planner Context ── */}
      {primaryCall && (
        <div>
          <SectionHeader>planner context</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Chip label={primaryCall.status} className={llmCallStatusBadgeClass(primaryCall.status)} />
              {primaryCall.model && <span className="text-[11px] font-mono sf-text-muted">{primaryCall.model}</span>}
              {primaryCall.provider && <span className="text-[11px] font-mono sf-text-subtle">{primaryCall.provider}</span>}
            </div>
            <div className="grid grid-cols-2 gap-1 sf-text-caption">
              <span className="sf-text-muted">Model</span>
              <span className="font-mono">{primaryCall.model || '-'}</span>
              <span className="sf-text-muted">Provider</span>
              <span className="font-mono">{primaryCall.provider || '-'}</span>
              {primaryCall.tokens && (
                <>
                  <span className="sf-text-muted">Tokens</span>
                  <span className="font-mono">{primaryCall.tokens.input}+{primaryCall.tokens.output}</span>
                </>
              )}
              {primaryCall.duration_ms !== undefined && (
                <>
                  <span className="sf-text-muted">Duration</span>
                  <span className="font-mono">{formatMs(primaryCall.duration_ms)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LLM Call Details (collapsible) ── */}
      {calls.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ── Tier Enhancement View (Search Planner before/after) ───────────── */

function isTierEnhancePath(plans: SearchPlanPass[]): boolean {
  return plans.some((p) => p.mode === 'tier_enhance');
}

// WHY: Use SSOT tier helpers — no local duplicates.

function TierEnhanceView({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: PrefetchSearchPlannerPanelProps) {
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCallsTier:${persistScope}`, false);
  const plans = searchPlans || [];

  const enhancePlan = plans.find((p) => p.mode === 'tier_enhance');
  const rows: SearchPlanEnhancementRow[] = enhancePlan?.enhancement_rows || [];
  const source = enhancePlan?.source || 'deterministic_fallback';
  const isLlm = source === 'llm';
  const totalRows = rows.length;
  const enhancedCount = rows.filter((r) => r.hint_source.endsWith('_llm')).length;
  const deterministicCount = totalRows - enhancedCount;

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const t = row.tier || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((r) => normalizeToken(normalizeQuery(r.query))),
  ), [searchResults]);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Query Enhancement</span>
          <Chip
            label={isLlm ? 'LLM ENHANCED' : 'DETERMINISTIC'}
            className={isLlm ? 'sf-chip-success' : 'sf-chip-neutral'}
          />
        </>}
        trailing={<>
          <Chip label="Search Planner" className="sf-chip-info" />
          {isLlm && <Chip label="LLM" className="sf-chip-warning" />}
          <Tip text="The Search Planner takes deterministic queries from Search Profile and optionally enhances them via LLM. Each row shows the original query and the enhanced version." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={totalRows} label="total queries" />
          <HeroStat value={enhancedCount} label="LLM enhanced" colorClass={enhancedCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={deterministicCount} label="unchanged" />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {isLlm ? (
            <>LLM enhanced <strong className="sf-text-primary not-italic">{enhancedCount}</strong> of <strong className="sf-text-primary not-italic">{totalRows}</strong> queries{totalTokens > 0 && <> &mdash; used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>}.</>
          ) : (
            <>Deterministic fallback &mdash; all <strong className="sf-text-primary not-italic">{totalRows}</strong> queries passed through unchanged (no LLM API key or model configured).</>
          )}
          {Object.keys(tierCounts).length > 0 && (
            <> Tier breakdown: {Object.entries(tierCounts).map(([t, c], i) => (
              <span key={t}>{i > 0 && ', '}<strong className="sf-text-primary not-italic">{c}</strong> {tierLabelSsot(classifyQueryTier({ query: '', tier: t })).toLowerCase()}</span>
            ))}.
            </>
          )}
        </div>
      </HeroBand>

      {/* ── Rationale ── */}
      {enhancePlan?.plan_rationale && (
        <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-3 text-xs sf-text-muted italic">
          {enhancePlan.plan_rationale}
        </div>
      )}

      {/* ── Before / After Enhancement Table ── */}
      <div>
        <SectionHeader>query enhancement{isLlm ? ' comparison' : ''} &middot; {totalRows} queries</SectionHeader>
        {rows.length > 0 ? (
          <div className="overflow-x-auto overflow-y-auto max-h-[56rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['#', 'tier', 'deterministic query', 'enhanced query', 'target fields'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const wasEnhanced = row.hint_source.endsWith('_llm');
                  const queryChanged = wasEnhanced && row.original_query !== row.query;
                  const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(row.query)));
                  return (
                    <tr key={i} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                      <td className="py-1.5 px-4 font-mono sf-text-subtle w-8">{i + 1}</td>
                      <td className="py-1.5 px-4">
                        <Chip label={tierLabelSsot(classifyQueryTier({ query: '', tier: row.tier }))} className={tierChipClass(classifyQueryTier({ query: '', tier: row.tier }))} />
                      </td>
                      <td className="py-1.5 px-4 font-mono sf-text-muted max-w-[22rem]">
                        {row.original_query || row.query}
                      </td>
                      <td className="py-1.5 px-4 font-mono max-w-[22rem]">
                        {queryChanged ? (
                          <span className="text-[var(--sf-state-success-fg)] font-medium">
                            {row.query}
                          </span>
                        ) : (
                          <span className="sf-text-subtle">
                            <Chip label="unchanged" className="sf-chip-neutral" />
                          </span>
                        )}
                        {sentToSearch && (
                          <span className="ml-2 px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                            Sent to search
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.target_fields.length > 0
                            ? row.target_fields.map((f) => <Chip key={f} label={f} className="sf-chip-success" />)
                            : <span className="sf-text-caption sf-text-subtle">&mdash;</span>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 text-center text-xs sf-text-muted">
            No enhancement data available.
          </div>
        )}
      </div>

      {/* ── LLM Call Details (collapsible) ── */}
      {calls.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ── */}
      <DebugJsonDetails label="raw search planner json" data={{ source, calls: calls.length, plans, enhancementRows: rows }} />
    </div>
  );
}


export function PrefetchSearchPlannerPanel({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: PrefetchSearchPlannerPanelProps) {
  const [expandedPassQueries, toggleExpandedPassQuery] = usePersistedExpandMap(`runtimeOps:searchPlanner:expandedPass:${persistScope}`);
  const plans = searchPlans || [];
  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((result) => normalizeToken(normalizeQuery(result.query))),
  ), [searchResults]);
  const callPayloads = useMemo(() => calls.map((call) => parsePlannerPayload(call.prompt_preview)), [calls]);
  const plannerInputSummary = useMemo(() => {
    const out: PlannerInputSummary = {
      callCountWithPayload: 0,
      criticalFields: [],
      missingCriticalFields: [],
      existingQueries: [],
      products: [],
    };
    const criticalFields: string[] = [];
    const missingFields: string[] = [];
    const existingQueries: string[] = [];
    const products: string[] = [];
    for (const payload of callPayloads) {
      if (!payload) continue;
      out.callCountWithPayload += 1;
      criticalFields.push(...normalizeList(payload.criticalFields));
      missingFields.push(...normalizeList(payload.missingCriticalFields));
      existingQueries.push(...normalizeList(payload.existingQueries));
      if (payload.product) {
        const product = payload.product || {};
        const category = normalizeToken(String(product.category || '').trim());
        const brand = String(product.brand || '').trim();
        const model = String(product.model || '').trim();
        const variant = String(product.variant || '').trim();
        const productId = [category, brand, model, variant].filter(Boolean).join(' : ').trim();
        if (productId) products.push(productId);
      }
    }
    out.criticalFields = uniqueSorted(criticalFields);
    out.missingCriticalFields = uniqueSorted(missingFields);
    out.existingQueries = uniqueSorted(existingQueries);
    out.products = uniqueSorted(products);
    return out;
  }, [callPayloads]);

  const tierEnhanceActive = useMemo(() => isTierEnhancePath(plans), [plans]);
  const schema4Active = useMemo(() => isSchema4PlannerPath(calls), [calls]);

  const totalTokens = calls.reduce((sum, call) => sum + (call.tokens?.input ?? 0) + (call.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, call) => sum + (call.duration_ms ?? 0), 0);
  const hasFailed = calls.some((call) => call.status === 'failed');
  const hasCalls = calls.length > 0;
  const hasStructured = plans.length > 0;
  const totalQueries = plans.reduce((sum, plan) => sum + (plan.queries_generated?.length || 0), 0);
  const overallStatus = hasFailed ? 'failed' : 'finished';

  const sentToSearchTotal = useMemo(() => {
    let count = 0;
    for (const plan of plans) {
      for (const query of plan.queries_generated) {
        if (executedQueryTokens.has(normalizeToken(normalizeQuery(query)))) count += 1;
      }
    }
    return count;
  }, [plans, executedQueryTokens]);

  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCallsLegacy:${persistScope}`, false);
  const [contextOpen, toggleContextOpen] = usePersistedToggle(`runtimeOps:searchPlanner:contextLegacy:${persistScope}`, true);

  if (tierEnhanceActive) {
    return <TierEnhanceView calls={calls} searchPlans={searchPlans} searchResults={searchResults} idxRuntime={idxRuntime} persistScope={persistScope} />;
  }

  if (schema4Active) {
    return <Schema4PlannerView calls={calls} searchPlans={searchPlans} searchResults={searchResults} idxRuntime={idxRuntime} persistScope={persistScope} />;
  }

  if (!hasCalls && !hasStructured) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Planner</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128506;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for search plan</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Search plans will appear after the planner generates targeted queries to close field coverage gaps identified by the NeedSet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Query Generation</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'finished' ? 'sf-chip-success' : 'sf-chip-danger'} />
        </>}
        trailing={<>
          <Chip label="LLM" className="sf-chip-warning" />
          <Tip text="The Search Planner LLM generates targeted queries in multiple passes (Primary, Fast, Reason, Validate) to close missing field coverage gaps identified by the NeedSet." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers */}
        <HeroStatGrid>
          <HeroStat value={totalQueries} label="queries generated" />
          <HeroStat value={plans.length} label="passes" />
          <HeroStat value={sentToSearchTotal} label="sent to search" colorClass={sentToSearchTotal > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          Planner generated <strong className="sf-text-primary not-italic">{totalQueries}</strong> targeted
          {' '}queries across <strong className="sf-text-primary not-italic">{plans.length}</strong> pass{plans.length !== 1 ? 'es' : ''}
          {sentToSearchTotal > 0 && (
            <> &mdash; <strong className="sf-text-primary not-italic">{sentToSearchTotal}</strong> sent to search</>
          )}
          {plannerInputSummary.missingCriticalFields.length > 0 && (
            <>, targeting <strong className="sf-text-primary not-italic">{plannerInputSummary.missingCriticalFields.length}</strong> missing critical field{plannerInputSummary.missingCriticalFields.length !== 1 ? 's' : ''}</>
          )}
          {totalTokens > 0 && (
            <>. Used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>
      </HeroBand>

      {/* ── Planner Context (collapsible) ── */}
      {plannerInputSummary.callCountWithPayload > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={contextOpen} onToggle={toggleContextOpen} summary={<>{plannerInputSummary.missingCriticalFields.length} missing &middot; {plannerInputSummary.existingQueries.length} existing &middot; {plannerInputSummary.criticalFields.length} critical</>}>planner context</CollapsibleSectionHeader>

          {contextOpen && (
            <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 mt-3 space-y-4">
              {plannerInputSummary.products.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">product identity</div>
                  <div className="flex flex-wrap gap-1.5">
                    {plannerInputSummary.products.map((p) => (
                      <Chip key={p} label={p} className="sf-chip-accent" />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
                  missing critical fields ({plannerInputSummary.missingCriticalFields.length})
                </div>
                {plannerInputSummary.missingCriticalFields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {plannerInputSummary.missingCriticalFields.map((f) => (
                      <Chip key={f} label={f} className="sf-chip-danger" />
                    ))}
                  </div>
                ) : (
                  <div className="sf-text-caption sf-text-subtle">none</div>
                )}
              </div>
              <div>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
                  critical fields ({plannerInputSummary.criticalFields.length})
                </div>
                {plannerInputSummary.criticalFields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {plannerInputSummary.criticalFields.map((f) => (
                      <Chip key={f} label={f} className="sf-chip-warning" />
                    ))}
                  </div>
                ) : (
                  <div className="sf-text-caption sf-text-subtle">none</div>
                )}
              </div>
              <div>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
                  existing queries ({plannerInputSummary.existingQueries.length})
                </div>
                {plannerInputSummary.existingQueries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {plannerInputSummary.existingQueries.slice(0, 18).map((q) => (
                      <Chip key={q} label={q} className="sf-chip-neutral" />
                    ))}
                    {plannerInputSummary.existingQueries.length > 18 && (
                      <span className="sf-text-caption sf-text-muted">+{plannerInputSummary.existingQueries.length - 18} more</span>
                    )}
                  </div>
                ) : (
                  <div className="sf-text-caption sf-text-subtle">none</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pass Results ── */}
      {hasStructured && (
        <div>
          <SectionHeader>pass results &middot; {plans.length} pass{plans.length !== 1 ? 'es' : ''} &middot; {totalQueries} queries</SectionHeader>
          <div className="space-y-2">
            {plans.map((plan, i) => {
              const missingFields = plan.missing_critical_fields || [];
              const passRowKey = `${plan.pass_index ?? i}-${plan.pass_name || 'pass'}`;
              const queriesExpanded = Boolean(expandedPassQueries[passRowKey]);
              const sentToSearchCount = plan.queries_generated.reduce((sum, query) => (
                executedQueryTokens.has(normalizeToken(normalizeQuery(query))) ? sum + 1 : sum
              ), 0);
              const isAggressive = String(plan.mode || 'standard').toLowerCase() === 'aggressive';
              return (
                <div key={passRowKey} className="sf-surface-elevated rounded-sm border sf-border-soft overflow-hidden">
                  {/* Pass header — clickable */}
                  <div
                    onClick={() => toggleExpandedPassQuery(passRowKey)}
                    className="grid gap-4 px-5 py-3.5 cursor-pointer select-none"
                    style={{ gridTemplateColumns: 'auto 1fr auto' }}
                  >
                    {/* Left: pass name pill */}
                    <div className="pt-0.5">
                      <Chip label={plan.pass_name || `pass ${plan.pass_index + 1}`} className={reasonBadgeClass(planReason(plan.pass_name, i))} />
                    </div>
                    {/* Center: metadata */}
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold sf-text-primary leading-tight">
                        {plan.pass_name?.replace(/_/g, ' ') || `Pass ${plan.pass_index + 1}`}
                      </div>
                      {plan.stop_condition && (
                        <div className="mt-0.5 text-xs sf-text-muted truncate">{plan.stop_condition}</div>
                      )}
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t sf-border-soft">
                        <Chip label={isAggressive ? 'aggressive' : 'standard'} className={isAggressive ? 'sf-chip-warning' : 'sf-chip-neutral'} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                          queries <strong className="sf-text-primary">{plan.queries_generated.length}</strong>
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                          sent <strong className={sentToSearchCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-primary'}>{sentToSearchCount}/{plan.queries_generated.length}</strong>
                        </span>
                        {missingFields.length > 0 && (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                            missing <strong className="text-[var(--sf-state-error-fg)]">{missingFields.length}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Right: expand indicator */}
                    <div className="text-right shrink-0 pt-1">
                      <span className="text-[11px] font-mono sf-text-subtle">
                        {queriesExpanded ? '\u25B4' : '\u25BE'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded: rationale + missing fields + query list */}
                  {queriesExpanded && (
                    <div className="border-t sf-border-soft px-5 py-3.5 space-y-3">
                      {plan.plan_rationale && (
                        <div className="text-xs sf-text-muted italic">{plan.plan_rationale}</div>
                      )}
                      {missingFields.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">missing critical fields in pass</div>
                          <div className="flex flex-wrap gap-1.5">
                            {missingFields.map((f) => (
                              <Chip key={f} label={f} className="sf-chip-danger" />
                            ))}
                          </div>
                        </div>
                      )}
                      {plan.queries_generated.length > 0 && (
                        <div className="overflow-x-auto border sf-border-soft rounded-sm">
                          <table className="min-w-full text-xs">
                            <thead className="sf-surface-elevated sticky top-0">
                              <tr>
                                {['#', 'query', 'status'].map((h) => (
                                  <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {plan.queries_generated.map((query, qi) => {
                                const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(query)));
                                return (
                                  <tr key={qi} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                                    <td className="py-1.5 px-4 font-mono sf-text-subtle w-8">{qi + 1}</td>
                                    <td className="py-1.5 px-4 font-mono sf-text-primary">{query}</td>
                                    <td className="py-1.5 px-4">
                                      {sentToSearch ? (
                                        <Chip label="sent to search" className="sf-chip-success" />
                                      ) : (
                                        <span className="sf-text-subtle">&mdash;</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LLM Call Details (collapsible) ── */}
      {calls.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ── */}
      {hasStructured && (
        <DebugJsonDetails label="raw search planner json" data={{ calls: calls.length, plans, plannerInputSummary }} />
      )}
    </div>
  );
}

function planReason(passName: string, index: number): string {
  const normalized = String(passName || '').trim().toLowerCase();
  if (normalized.startsWith('discovery_planner') || normalized === 'primary' || normalized === 'pass_primary') return 'discovery_planner_primary';
  return `pass_${String(index + 1)}`;
}
