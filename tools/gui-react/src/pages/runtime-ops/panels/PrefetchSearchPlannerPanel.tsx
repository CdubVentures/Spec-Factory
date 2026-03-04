import { useMemo, useState } from 'react';
import type { PrefetchLlmCall, SearchPlanPass, PrefetchLiveSettings, PrefetchSearchResult } from '../types';
import { llmCallStatusBadgeClass, formatMs } from '../helpers';
import { VerticalStepper, Step } from '../components/VerticalStepper';
import { formatTooltip, UiTooltip, TooltipBadge } from '../components/PrefetchTooltip';
import { StatCard } from '../components/StatCard';
import { Tip } from '../../../components/common/Tip';

interface PrefetchSearchPlannerPanelProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  liveSettings?: PrefetchLiveSettings;
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
  if (normalized === 'discovery_planner_primary') return 'sf-chip-info';
  if (normalized === 'discovery_planner_fast') return 'sf-chip-accent';
  if (normalized === 'discovery_planner_reason') return 'sf-chip-accent';
  if (normalized === 'discovery_planner_validate') return 'sf-chip-success';
  return 'sf-chip-neutral';
}

function reasonLabel(reason: string): string {
  const normalized = String(reason || '').trim().toLowerCase();
  if (normalized === 'discovery_planner_primary') return 'Primary';
  if (normalized === 'discovery_planner_fast') return 'Fast';
  if (normalized === 'discovery_planner_reason') return 'Reason';
  if (normalized === 'discovery_planner_validate') return 'Validate';
  return normalized ? normalized.replace(/_/g, ' ') : 'unknown';
}

function plannerReasonBadgeKey(reason: string): string {
  const normalized = String(reason || '').trim().toLowerCase();
  if (normalized === 'discovery_planner_primary') return normalized;
  if (normalized === 'discovery_planner_fast') return normalized;
  if (normalized === 'discovery_planner_reason') return normalized;
  if (normalized === 'discovery_planner_validate') return normalized;
  return 'other';
}

function normalizeQuery(query: string): string {
  return String(query || '').trim();
}

const DEFAULT_VISIBLE_QUERIES = 6;


function TagList({
  items,
  prefix,
  className = 'sf-chip-neutral',
  itemTooltip,
}: {
  items: string[];
  prefix: string;
  className?: string;
  itemTooltip?: string | ((item: string) => string);
}) {
  if (!items.length) {
    return <div className="sf-text-caption sf-text-subtle">none</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 18).map((item) => {
        const tipText = typeof itemTooltip === 'function'
          ? itemTooltip(item)
          : itemTooltip
            ? `${item}. ${itemTooltip}`
            : formatTooltip({
              what: `Planner input value: ${item}.`,
              effect: 'This value was included in planner context for this run.',
              setBy: 'Derived from planner payload; not set directly here.',
            });
        return (
          <UiTooltip key={`${prefix}:${item}`} text={tipText}>
            <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${className}`}>
              {item}
            </span>
          </UiTooltip>
        );
      })}
      {items.length > 18 && <span className="sf-text-caption sf-text-muted">+{items.length - 18} more</span>}
    </div>
  );
}

function signalBadgeClass(active: boolean): string {
  return active
    ? 'sf-chip-success'
    : 'sf-chip-neutral';
}

function SignalBadge({
  active,
  label,
  tooltipOn,
  tooltipOff,
}: {
  active: boolean;
  label: string;
  tooltipOn: string;
  tooltipOff: string;
}) {
  return (
    <TooltipBadge
      className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${signalBadgeClass(active)}`}
      tooltip={active ? tooltipOn : tooltipOff}
    >
      {label}
    </TooltipBadge>
  );
}

function PlannerPassBadge({
  passKey,
  count,
  tooltipOn,
  tooltipOff,
}: {
  passKey: 'discovery_planner_primary' | 'discovery_planner_fast' | 'discovery_planner_reason' | 'discovery_planner_validate';
  count: number;
  tooltipOn: string;
  tooltipOff: string;
}) {
  const active = count > 0;
  const activeClass = reasonBadgeClass(passKey);
  const offClass = 'sf-chip-neutral';
  return (
    <TooltipBadge
      className={`px-2 py-0.5 rounded-full sf-text-label font-medium ${active ? activeClass : offClass}`}
      tooltip={active ? tooltipOn : tooltipOff}
    >
      {reasonLabel(passKey)}: {count}
    </TooltipBadge>
  );
}

export function PrefetchSearchPlannerPanel({
  calls,
  searchPlans,
  searchResults,
  liveSettings,
}: PrefetchSearchPlannerPanelProps) {
  const plannerEnabledLive = liveSettings?.phase2LlmEnabled;
  const [expandedPassQueries, setExpandedPassQueries] = useState<Record<string, boolean>>({});
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

  const hasPlannerRun = calls.length > 0;
  const reasonSummary = useMemo(() => {
    const out = {
      discovery_planner_primary: 0,
      discovery_planner_fast: 0,
      discovery_planner_reason: 0,
      discovery_planner_validate: 0,
      other: 0,
    };
    for (const call of calls) {
      const key = plannerReasonBadgeKey(call.reason);
      if (key === 'discovery_planner_primary') out.discovery_planner_primary += 1;
      else if (key === 'discovery_planner_fast') out.discovery_planner_fast += 1;
      else if (key === 'discovery_planner_reason') out.discovery_planner_reason += 1;
      else if (key === 'discovery_planner_validate') out.discovery_planner_validate += 1;
      else out.other += 1;
    }
    return out;
  }, [calls]);

  const totalTokens = calls.reduce((sum, call) => sum + (call.tokens?.input ?? 0) + (call.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, call) => sum + (call.duration_ms ?? 0), 0);
  const hasFailed = calls.some((call) => call.status === 'failed');
  const hasCalls = calls.length > 0;
  const hasStructured = plans.length > 0;
  const hasParsed = plannerInputSummary.callCountWithPayload > 0;
  const uniquePassNames = uniqueSorted(plans.map((plan) => String(plan.pass_name || '').trim()));
  const totalQueries = plans.reduce((sum, plan) => sum + (plan.queries_generated?.length || 0), 0);
  const missingCriticalCount = plannerInputSummary.missingCriticalFields.length;
  const plannerSignalState = {
    product: hasPlannerRun,
    criticalFields: hasPlannerRun,
    missingCriticalFields: hasPlannerRun,
    existingQueries: hasPlannerRun,
  };

  if (!hasCalls && !hasStructured) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Planner</h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128506;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for search plan</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Search plans will appear after the Planner LLM generates targeted queries across multiple passes
            (Primary, Fast, Reason, Validate) to close missing field coverage gaps identified by the NeedSet.
          </p>
          {liveSettings?.phase2LlmEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${liveSettings.phase2LlmEnabled ? 'sf-chip-neutral' : 'sf-chip-danger'}`}>
              LLM Planner: {liveSettings.phase2LlmEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold sf-text-primary">
          Search Planner
          <Tip text="The Search Planner LLM generates targeted queries in multiple passes (Primary, Fast, Reason, Validate) to close missing field coverage gaps identified by the NeedSet." />
        </h3>
        {plannerEnabledLive !== undefined && (
          <TooltipBadge
            className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
              plannerEnabledLive
                ? 'sf-chip-warning'
                : 'sf-chip-neutral'
            }`}
            tooltip={plannerEnabledLive
              ? formatTooltip({
                what: 'Planner LLM is enabled.',
                effect: 'Planner can add query ideas before search runs.',
                setBy: 'Runtime Settings > LLM Planner (phase2LlmEnabled / llmPlanDiscoveryQueries).',
              })
              : formatTooltip({
                what: 'Planner LLM is disabled.',
                effect: 'No planner-generated query ideas are added.',
                setBy: 'Runtime Settings > LLM Planner (phase2LlmEnabled / llmPlanDiscoveryQueries).',
              })}
          >
            LLM Planner: {plannerEnabledLive ? 'ON' : 'OFF'}
          </TooltipBadge>
        )}
        {hasCalls && (
          <TooltipBadge
            className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
              hasFailed ? 'sf-chip-danger' : 'sf-chip-success'
            }`}
            tooltip={hasFailed
              ? formatTooltip({
                what: 'Total planner calls for this run.',
                effect: 'At least one planner call failed.',
                setBy: 'Run outcome only; no direct knob.',
              })
              : formatTooltip({
                what: 'Total planner calls for this run.',
                effect: 'All planner calls completed successfully.',
                setBy: 'Run outcome only; no direct knob.',
              })}
          >
            {calls.length} call{calls.length > 1 ? 's' : ''}
          </TooltipBadge>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <TooltipBadge
          className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${hasParsed ? 'sf-chip-success' : 'sf-chip-neutral'}`}
          tooltip={hasParsed
            ? formatTooltip({
              what: 'Calls with parseable planner prompt payload.',
              effect: 'This panel can show which inputs reached the planner.',
              setBy: 'Trace payload capture settings; not a planner knob.',
            })
            : formatTooltip({
              what: 'No parseable prompt payload was captured.',
              effect: 'Planner input details are not inspectable in this view.',
              setBy: 'Trace payload capture settings; not a planner knob.',
            })}
        >
          Parsed prompts: {plannerInputSummary.callCountWithPayload}/{calls.length}
        </TooltipBadge>
        <TooltipBadge
          className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-info"
          tooltip={formatTooltip({
            what: 'Number of emitted planner pass events.',
            effect: 'Shows how many planning passes produced output.',
            setBy: 'Run behavior; not a direct knob.',
          })}
        >
          Passes: {plans.length}
        </TooltipBadge>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <PlannerPassBadge
          passKey="discovery_planner_primary"
          count={reasonSummary.discovery_planner_primary}
          tooltipOn={formatTooltip({
            what: `Primary pass ran ${reasonSummary.discovery_planner_primary} time(s).`,
            effect: 'Generates core query ideas from planner inputs.',
            setBy: 'phase2LlmEnabled + planner model (phase2LlmModel/llmModelPlan).',
          })}
          tooltipOff={formatTooltip({
            what: 'Primary pass not observed.',
            effect: 'No base planner output in this sample.',
            setBy: 'phase2LlmEnabled and phase2LlmModel/llmModelPlan.',
          })}
        />
        <PlannerPassBadge
          passKey="discovery_planner_fast"
          count={reasonSummary.discovery_planner_fast}
          tooltipOn={formatTooltip({
            what: `Fast pass ran ${reasonSummary.discovery_planner_fast} time(s).`,
            effect: 'Adds quick extra query ideas.',
            setBy: 'Aggressive mode + pass cap + llmModelFast.',
          })}
          tooltipOff={formatTooltip({
            what: 'Fast pass not observed.',
            effect: 'No fast extra-query pass output in this sample.',
            setBy: 'Aggressive mode, pass cap, and llmModelFast.',
          })}
        />
        <PlannerPassBadge
          passKey="discovery_planner_reason"
          count={reasonSummary.discovery_planner_reason}
          tooltipOn={formatTooltip({
            what: `Reason pass ran ${reasonSummary.discovery_planner_reason} time(s).`,
            effect: 'Adds deeper strategy-focused query ideas.',
            setBy: 'Aggressive mode + pass cap + llmModelReasoning.',
          })}
          tooltipOff={formatTooltip({
            what: 'Reason pass not observed.',
            effect: 'No deep-reasoning pass output in this sample.',
            setBy: 'Aggressive mode, pass cap, and llmModelReasoning.',
          })}
        />
        <PlannerPassBadge
          passKey="discovery_planner_validate"
          count={reasonSummary.discovery_planner_validate}
          tooltipOn={formatTooltip({
            what: `Validate pass ran ${reasonSummary.discovery_planner_validate} time(s).`,
            effect: 'Targets missing critical fields.',
            setBy: 'Aggressive mode + pass cap + llmModelValidate, and it requires missing critical fields.',
          })}
          tooltipOff={missingCriticalCount === 0
            ? formatTooltip({
              what: 'Validate pass did not run.',
              effect: 'No validate targeting was needed because there are no missing critical fields.',
              setBy: 'Computed needset gaps.',
            })
            : formatTooltip({
              what: 'Validate pass not observed.',
              effect: 'No validate pass output in this sample.',
              setBy: 'Aggressive mode, pass cap, and llmModelValidate.',
            })}
        />
        {reasonSummary.other > 0 && (
          <TooltipBadge
            className={`px-2 py-0.5 rounded-full sf-text-label font-medium ${reasonBadgeClass('other')}`}
            tooltip={formatTooltip({
              what: 'Planner calls with non-standard reason labels.',
              effect: 'Diagnostic signal only.',
              setBy: 'Run output; not a direct knob.',
            })}
          >
            Other: {reasonSummary.other}
          </TooltipBadge>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="Input + output tokens across calls." />
        <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock total across calls." />
        <StatCard label="Queries generated" value={totalQueries} tip="From plan events for this run." />
        <StatCard label="Input pass names" value={uniquePassNames.length ? uniquePassNames.join(', ') : 'n/a'} tip="Planner output pass labels." />
      </div>

      <div className="flex flex-wrap items-center gap-2 sf-text-caption sf-text-muted">
        <span>Signals fed to planner prompt:</span>
        <SignalBadge
          active={plannerSignalState.product}
          label="product"
          tooltipOn={formatTooltip({
            what: `Product identity is sent (${plannerInputSummary.products.join(', ') || 'present'}).`,
            effect: 'Keeps query ideas tied to the correct product.',
            setBy: 'Identity lock and upstream identity data; no direct planner knob.',
          })}
          tooltipOff={formatTooltip({
            what: 'Product identity was not seen in captured prompt payload.',
            effect: 'Cannot verify product signal in this trace.',
            setBy: 'Trace capture and upstream identity data.',
          })}
        />
        <SignalBadge
          active={plannerSignalState.criticalFields}
          label="criticalFields"
          tooltipOn={formatTooltip({
            what: `Critical field list is sent (${plannerInputSummary.criticalFields.join(', ') || 'present'}).`,
            effect: 'Planner prioritizes high-importance fields.',
            setBy: 'Field rules critical priority; not a runtime planner toggle.',
          })}
          tooltipOff={formatTooltip({
            what: 'criticalFields was not seen in captured prompt payload.',
            effect: 'Cannot verify critical targeting in this trace.',
            setBy: 'Trace capture and field-rule output.',
          })}
        />
        <SignalBadge
          active={plannerSignalState.missingCriticalFields}
          label="missingCriticalFields"
          tooltipOn={formatTooltip({
            what: `Missing critical fields are sent${plannerInputSummary.missingCriticalFields.length ? `: ${plannerInputSummary.missingCriticalFields.join(', ')}` : '.'}`,
            effect: 'Planner focuses on unresolved critical gaps.',
            setBy: 'Computed needset/evidence gaps; no direct knob.',
          })}
          tooltipOff={formatTooltip({
            what: 'missingCriticalFields was not seen in captured prompt payload.',
            effect: 'Cannot verify gap-targeting input in this trace.',
            setBy: 'Trace capture and computed needset gaps.',
          })}
        />
        <SignalBadge
          active={plannerSignalState.existingQueries}
          label="existingQueries"
          tooltipOn={formatTooltip({
            what: `Existing queries are sent (${plannerInputSummary.existingQueries.length} captured).`,
            effect: 'Planner avoids duplicates and adds new angles.',
            setBy: 'Search profile/query generation knobs; no single planner toggle.',
          })}
          tooltipOff={formatTooltip({
            what: 'existingQueries was not seen in captured prompt payload.',
            effect: 'Cannot verify de-dup context in this trace.',
            setBy: 'Trace capture and search-profile generation.',
          })}
        />
      </div>

      {plannerInputSummary.products.length > 0 && (
        <details className="sf-text-caption">
          <summary className="sf-summary-toggle font-medium">Product identities passed</summary>
          <div className="mt-2">
            <TagList
              items={plannerInputSummary.products}
              prefix="planner-product"
              itemTooltip={formatTooltip({
                what: 'Sent to planner as product identity.',
                effect: 'Narrows query ideas to this exact product.',
                setBy: 'Upstream product identity resolution.',
              })}
            />
          </div>
        </details>
      )}

      <details className="sf-text-caption">
        <summary className="sf-summary-toggle font-medium">
          Missing critical fields ({plannerInputSummary.missingCriticalFields.length})
        </summary>
        <div className="mt-2">
          <TagList
            items={plannerInputSummary.missingCriticalFields}
            prefix="planner-missing"
            itemTooltip={formatTooltip({
              what: 'Sent to planner as a missing critical field.',
              effect: 'Planner prioritizes queries to close this gap.',
              setBy: 'Computed needset/evidence gaps.',
            })}
          />
        </div>
      </details>

      <details className="sf-text-caption">
        <summary className="sf-summary-toggle font-medium">
          Existing queries ({plannerInputSummary.existingQueries.length})
        </summary>
        <div className="mt-2">
          <TagList
            items={plannerInputSummary.existingQueries}
            prefix="planner-existing"
            itemTooltip={formatTooltip({
              what: 'Sent to planner as an existing query.',
              effect: 'Avoids duplicates and pushes new query angles.',
              setBy: 'Search profile/query generation.',
            })}
          />
        </div>
      </details>

      <details className="sf-text-caption">
        <summary className="sf-summary-toggle font-medium">
          Critical fields ({plannerInputSummary.criticalFields.length})
        </summary>
        <div className="mt-2">
          <TagList
            items={plannerInputSummary.criticalFields}
            prefix="planner-critical"
            itemTooltip={formatTooltip({
              what: 'Sent to planner as a critical field.',
              effect: 'Planner prioritizes queries for this field.',
              setBy: 'Field rules critical priority.',
            })}
          />
        </div>
      </details>

      {hasStructured && (
        <div className="rounded border sf-border-default p-2">
          <VerticalStepper>
            {plans.map((plan, i) => {
              const missingFields = plan.missing_critical_fields || [];
              const profileCoverage = plan.queries_generated.length;
              const passRowKey = `${plan.pass_index ?? i}-${plan.pass_name || 'pass'}`;
              const hasMoreQueries = plan.queries_generated.length > DEFAULT_VISIBLE_QUERIES;
              const queriesExpanded = Boolean(expandedPassQueries[passRowKey]);
              const shownQueries = queriesExpanded
                ? plan.queries_generated
                : plan.queries_generated.slice(0, DEFAULT_VISIBLE_QUERIES);
              const sentToSearchCount = plan.queries_generated.reduce((sum, query) => (
                executedQueryTokens.has(normalizeToken(normalizeQuery(query))) ? sum + 1 : sum
              ), 0);
              return (
                <Step
                  key={passRowKey}
                  index={plan.pass_index}
                  title={plan.pass_name || `Pass ${plan.pass_index + 1}`}
                  subtitle={plan.stop_condition}
                  isLast={i === plans.length - 1}
                >
                  <div className="mb-2 sf-text-caption sf-text-muted">
                    Inputs for this pass are from planner prompt payload plus pass output artifacts below.
                  </div>
                  <div className="sf-text-caption mb-2">
                    <TooltipBadge
                      className="px-2 py-0.5 rounded-full sf-chip-neutral"
                      tooltip={
                        String(plan.mode || 'standard').toLowerCase() === 'aggressive'
                          ? formatTooltip({
                            what: 'Aggressive planner mode is active for this pass.',
                            effect: 'Allows optional Fast, Reason, and Validate passes.',
                            setBy: 'Mode policy + AGGRESSIVE_LLM_DISCOVERY_PASSES + per-pass models.',
                          })
                          : formatTooltip({
                            what: 'Standard planner mode is active for this pass.',
                            effect: 'Typically runs the base Primary pass only.',
                            setBy: 'Upstream mode policy.',
                          })
                      }
                    >
                      Mode: {plan.mode || 'standard'}
                    </TooltipBadge>
                    <TooltipBadge
                      className="ml-2 px-2 py-0.5 rounded-full sf-chip-neutral"
                      tooltip={formatTooltip({
                        what: 'Number of queries generated in this pass.',
                        effect: 'Shows output size for this pass.',
                        setBy: 'Run result; not a knob.',
                      })}
                    >
                      Queries: {plan.queries_generated.length}
                    </TooltipBadge>
                    <TooltipBadge
                      className={`ml-2 px-2 py-0.5 rounded-full sf-text-caption font-medium ${reasonBadgeClass(planReason(plan.pass_name, i))}`}
                      tooltip={formatTooltip({
                        what: 'Planner pass reason label for this pass.',
                        effect: 'Shows which planner path produced this output.',
                        setBy: 'Run result.',
                      })}
                    >
                      Pass reason: {plan.pass_name || `pass-${i + 1}`}
                    </TooltipBadge>
                    <TooltipBadge
                      className={`ml-2 px-2 py-0.5 rounded-full sf-text-caption font-medium ${
                        sentToSearchCount > 0
                          ? 'sf-chip-success'
                          : 'sf-chip-neutral'
                      }`}
                      tooltip={sentToSearchCount > 0
                        ? formatTooltip({
                          what: `${sentToSearchCount} query ideas from this pass were sent to search.`,
                          effect: 'These rows are highlighted below.',
                          setBy: 'Matched planner outputs against executed search queries.',
                        })
                        : formatTooltip({
                          what: 'No query ideas from this pass have been observed in search execution yet.',
                          effect: 'This can happen when search has not started or this pass produced no executed query.',
                          setBy: 'Matched planner outputs against executed search queries.',
                        })}
                    >
                      Sent: {sentToSearchCount}/{plan.queries_generated.length}
                    </TooltipBadge>
                  </div>
                  <div className="sf-text-caption sf-text-muted">
                    Profile coverage map entries: {profileCoverage}
                  </div>
                  {missingFields.length > 0 && (
                    <div className="mt-1">
                      <div className="mb-1 sf-text-caption sf-text-muted">Missing critical fields in pass:</div>
                      <TagList
                        items={missingFields}
                        prefix={`plan-missing-${i}`}
                        itemTooltip={formatTooltip({
                          what: 'Field still missing after this pass.',
                          effect: 'Can trigger additional aggressive/validate planning when allowed.',
                          setBy: 'Pass outcome.',
                        })}
                      />
                    </div>
                  )}
                  <div className="mt-2 sf-text-caption sf-text-muted">
                    Rationale: {plan.plan_rationale || 'n/a'}
                  </div>
                  {plan.queries_generated.length > 0 && (
                    <div className="mt-2">
                      {shownQueries.map((query, qi) => {
                        const queryToken = normalizeToken(normalizeQuery(query));
                        const sentToSearch = executedQueryTokens.has(queryToken);
                        return (
                          <div
                            key={`${normalizeQuery(query)}-${qi}`}
                            className={`sf-text-label font-mono rounded px-1.5 py-1 mb-1 ${
                              sentToSearch
                                ? 'sf-callout sf-callout-success'
                                : 'sf-text-primary'
                            }`}
                          >
                            <span className="mr-1">{qi + 1}.</span>
                            <span>{query}</span>
                            {sentToSearch && (
                              <span className="ml-2 px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                                Sent to search
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {hasMoreQueries && (
                        <button
                          type="button"
                          onClick={() => setExpandedPassQueries((prev) => ({ ...prev, [passRowKey]: !queriesExpanded }))}
                          className="mt-1 inline-flex items-center gap-1 sf-text-label font-semibold sf-link-accent hover:underline"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full sf-icon-badge text-[12px] leading-none">
                            {queriesExpanded ? '\u2212' : '+'}
                          </span>
                          {queriesExpanded
                            ? 'Show fewer queries'
                            : `${plan.queries_generated.length - DEFAULT_VISIBLE_QUERIES} more queries in pass`}
                        </button>
                      )}
                    </div>
                  )}
                </Step>
              );
            })}
          </VerticalStepper>
        </div>
      )}

      {hasCalls && (
        <details className="sf-text-caption">
          <summary className="sf-summary-toggle">
            LLM calls (prompt/response)
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => {
              const parsed = callPayloads[i];
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TooltipBadge
                      className={`px-1.5 py-0.5 rounded sf-text-caption ${llmCallStatusBadgeClass(call.status)}`}
                      tooltip={formatTooltip({
                        what: 'Status of this planner LLM call.',
                        effect: 'Failed calls do not contribute usable planner output.',
                        setBy: 'Run result.',
                      })}
                    >
                      {call.status}
                    </TooltipBadge>
                    <TooltipBadge
                      className={`px-1.5 py-0.5 rounded sf-text-caption ${reasonBadgeClass(plannerReasonBadgeKey(call.reason))}`}
                      tooltip={formatTooltip({
                        what: 'Pass type for this LLM call (Primary/Fast/Reason/Validate).',
                        effect: 'Changes the style of query ideas produced.',
                        setBy: 'Planner mode and pass settings.',
                      })}
                    >
                      {reasonLabel(call.reason)}
                    </TooltipBadge>
                    <span className="sf-text-caption sf-text-muted">{call.model || '-'}</span>
                    <span className="sf-text-caption sf-text-muted">{call.provider || '-'}</span>
                    <span className="ml-auto sf-text-caption sf-text-muted">
                      {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : '-'}
                    </span>
                    <span className="sf-text-caption sf-text-muted">
                      {call.duration_ms ? `${formatMs(call.duration_ms)}` : '-'}
                    </span>
                  </div>
                  {parsed && (
                    <div className="pl-1 sf-text-caption sf-text-muted">
                      <div>Product fields: {parsed.product ? 'present' : 'missing'}</div>
                      <div>Missing critical fields: {parsed.missingCriticalFields?.length || 0}</div>
                      <div>Existing queries: {parsed.existingQueries?.length || 0}</div>
                    </div>
                  )}
                  {call.prompt_preview && (
                    <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded p-2 font-mono sf-text-caption sf-pre-block">
                      {call.prompt_preview}
                    </pre>
                  )}
                  {call.response_preview && (
                    <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded p-2 font-mono sf-text-caption sf-pre-block">
                      {call.response_preview}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <details className="sf-text-caption">
        <summary className="sf-summary-toggle">
          What is NOT in the planner prompt
        </summary>
        <div className="mt-2 sf-text-label sf-text-muted">
          This panel excludes these because they are applied earlier in search profile generation or execution:
          query_terms, domain_hints, content types, contract-derived hints, source_host, source tiers, and past search history.
        </div>
      </details>
    </div>
  );
}

function planReason(passName: string, index: number): string {
  const normalized = String(passName || '').trim().toLowerCase();
  if (normalized === 'primary' || normalized === 'pass_primary') return 'discovery_planner_primary';
  if (normalized.includes('fast')) return 'discovery_planner_fast';
  if (normalized.includes('reason')) return 'discovery_planner_reason';
  if (normalized.includes('validate')) return 'discovery_planner_validate';
  return `pass_${String(index + 1)}`;
}
