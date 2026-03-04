import { Tip } from '../../../components/common/Tip';
import { usePersistedToggle } from '../../../stores/collapseStore';
import {
  formatNumber,
  formatDateTime,
} from '../helpers';

interface LlmMetricsRunRow {
  run_id?: string | null;
  calls?: number;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface LlmMetricsByModelRow {
  provider?: string;
  model?: string;
  calls?: number;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface LlmPricingRow {
  knob: string;
  provider: string;
  model: string;
  token_cap: number;
  default_model?: string | null;
  uses_default_model?: boolean;
  default_token_cap?: number | null;
  uses_default_token_cap?: boolean;
  input_per_1m: number;
  output_per_1m: number;
  cached_input_per_1m: number;
}

interface LlmMetricsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  indexingLlmMetrics: {
    generated_at?: string;
    total_calls?: number;
    total_cost_usd?: number;
    total_prompt_tokens?: number;
    total_completion_tokens?: number;
    by_model?: LlmMetricsByModelRow[];
  } | null | undefined;
  selectedRunLlmMetrics: LlmMetricsRunRow | null;
  selectedLlmPricingRows: LlmPricingRow[];
  indexingLlmConfig: {
    pricing_meta?: {
      as_of?: string | null;
      sources?: Record<string, string>;
    };
  } | null | undefined;
}

export function LlmMetricsPanel({
  collapsed,
  onToggle,
  indexingLlmMetrics,
  selectedRunLlmMetrics,
  selectedLlmPricingRows,
  indexingLlmConfig,
}: LlmMetricsPanelProps) {
  const [activeModelPricingCollapsed, toggleActiveModelPricing] = usePersistedToggle('indexing:llmMetrics:pricing', true);

  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 90 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>LLM Runtime Metrics</span>
          <Tip text="Live call/cost/token counters from ledger + pricing rows for all currently selected route/fallback models." />
        </div>
        <div className="sf-text-caption sf-text-muted">
          updated {formatDateTime(indexingLlmMetrics?.generated_at || null)}
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sf-text-caption">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">selected run calls</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(selectedRunLlmMetrics?.calls || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">selected run cost</div>
              <div className="font-semibold sf-text-primary">${formatNumber(Number(selectedRunLlmMetrics?.cost_usd || 0), 6)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">selected run prompt</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(selectedRunLlmMetrics?.prompt_tokens || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">selected run completion</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(selectedRunLlmMetrics?.completion_tokens || 0))}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sf-text-caption">
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">period calls</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(indexingLlmMetrics?.total_calls || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">period cost</div>
              <div className="font-semibold sf-text-primary">${formatNumber(Number(indexingLlmMetrics?.total_cost_usd || 0), 6)}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">period prompt</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(indexingLlmMetrics?.total_prompt_tokens || 0))}</div>
            </div>
            <div className="sf-surface-elevated px-2 py-1">
              <div className="sf-text-muted">period completion</div>
              <div className="font-semibold sf-text-primary">{formatNumber(Number(indexingLlmMetrics?.total_completion_tokens || 0))}</div>
            </div>
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 sf-text-caption font-semibold sf-text-primary">
              <div className="flex items-center gap-1.5">
                <span>Active Model Pricing ({formatNumber(selectedLlmPricingRows.length)} rows)</span>
                <Tip text="Per-knob model pricing used for live cost estimation. Rows also show whether the current model matches the default role model." />
                {indexingLlmConfig?.pricing_meta?.as_of ? (
                  <span className="sf-text-caption sf-text-muted">
                    as of {indexingLlmConfig.pricing_meta.as_of}
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => toggleActiveModelPricing()}
                className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
                title={activeModelPricingCollapsed ? 'Open pricing table' : 'Close pricing table'}
              >
                {activeModelPricingCollapsed ? '+' : '-'}
              </button>
            </div>
            {!activeModelPricingCollapsed ? (
              <>
                <div className="mt-1 sf-text-label sf-text-muted">
                  sources:
                  {Object.entries(indexingLlmConfig?.pricing_meta?.sources || {}).map(([provider, link]) => (
                    <span key={`pricing-source:${provider}`} className="ml-2">
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline sf-link-accent"
                      >
                        {provider}
                      </a>
                    </span>
                  ))}
                </div>
                <div className="mt-2 sf-table-shell">
                  <table className="min-w-full sf-text-caption">
                    <thead className="sf-table-head border-b sf-border-soft">
                      <tr>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">knob<Tip text="The lane/control that owns this model selection." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">provider<Tip text="Resolved provider by selected model name (openai/gemini/deepseek)." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">model<Tip text="Current selected model with default-model linkage badge." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">token cap<Tip text="Current max output tokens for this knob (compared to default cap)." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">input / 1M<Tip text="USD per 1M input tokens." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">output / 1M<Tip text="USD per 1M output tokens." /></span>
                        </th>
                        <th className="py-1 pr-3 sf-table-head-cell">
                          <span className="inline-flex items-center">cached / 1M<Tip text="USD per 1M cached-input tokens (cache-hit pricing)." /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLlmPricingRows.length === 0 && (
                        <tr>
                          <td className="py-2 sf-text-muted" colSpan={7}>no selected model pricing rows</td>
                        </tr>
                      )}
                      {selectedLlmPricingRows.map((row) => (
                        <tr key={`selected-pricing:${row.knob}:${row.model}`} className="sf-table-row border-b sf-border-soft">
                          <td className="py-1 pr-3 sf-text-subtle">{row.knob}</td>
                          <td className="py-1 pr-3 sf-text-subtle">{row.provider}</td>
                          <td className="py-1 pr-3 font-mono sf-text-primary">
                            <span>{row.model}</span>
                            {row.default_model ? (
                              <span className={`ml-1 px-1.5 py-0.5 sf-text-caption ${row.uses_default_model ? 'sf-chip-success' : 'sf-chip-warning'}`}>
                                {row.uses_default_model ? 'default' : `default ${row.default_model}`}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-3 sf-text-subtle">
                            <span>{formatNumber(Number(row.token_cap || 0))}</span>
                            {row.default_token_cap ? (
                              <span className={`ml-1 px-1.5 py-0.5 sf-text-caption ${row.uses_default_token_cap ? 'sf-chip-success' : 'sf-chip-warning'}`}>
                                {row.uses_default_token_cap ? 'default' : `default ${formatNumber(Number(row.default_token_cap || 0))}`}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-3 sf-text-subtle">${formatNumber(row.input_per_1m, 4)}</td>
                          <td className="py-1 pr-3 sf-text-subtle">${formatNumber(row.output_per_1m, 4)}</td>
                          <td className="py-1 pr-3 sf-text-subtle">${formatNumber(row.cached_input_per_1m, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
          <div className="sf-surface-elevated p-2 overflow-x-auto">
            <div className="sf-text-caption font-semibold sf-text-primary">
              By Model ({formatNumber((indexingLlmMetrics?.by_model || []).length)} rows)
            </div>
            <div className="mt-2 sf-table-shell">
              <table className="min-w-full sf-text-caption">
                <thead className="sf-table-head border-b sf-border-soft">
                  <tr>
                    <th className="py-1 pr-3 sf-table-head-cell">provider</th>
                    <th className="py-1 pr-3 sf-table-head-cell">model</th>
                    <th className="py-1 pr-3 sf-table-head-cell">calls</th>
                    <th className="py-1 pr-3 sf-table-head-cell">cost usd</th>
                    <th className="py-1 pr-3 sf-table-head-cell">prompt</th>
                    <th className="py-1 pr-3 sf-table-head-cell">completion</th>
                  </tr>
                </thead>
                <tbody>
                  {(indexingLlmMetrics?.by_model || []).length === 0 && (
                    <tr>
                      <td className="py-2 sf-text-muted" colSpan={6}>no llm usage rows yet</td>
                    </tr>
                  )}
                  {(indexingLlmMetrics?.by_model || []).slice(0, 12).map((row, idx) => (
                    <tr key={`${row.provider || 'unknown'}:${row.model || 'model'}:${idx}`} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 sf-text-subtle">{row.provider || '-'}</td>
                      <td className="py-1 pr-3 font-mono sf-text-primary">{row.model || '-'}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.calls || 0))}</td>
                      <td className="py-1 pr-3 sf-text-subtle">${formatNumber(Number(row.cost_usd || 0), 6)}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.prompt_tokens || 0))}</td>
                      <td className="py-1 pr-3 sf-text-subtle">{formatNumber(Number(row.completion_tokens || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
