import type { PrefetchLlmCall, SearchPlanPass } from '../types';
import { llmCallStatusBadgeClass, formatMs } from '../helpers';
import { VerticalStepper, Step } from '../components/VerticalStepper';

interface PrefetchSearchPlannerPanelProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

export function PrefetchSearchPlannerPanel({ calls, searchPlans }: PrefetchSearchPlannerPanelProps) {
  const plans = searchPlans || [];
  const hasStructured = plans.length > 0;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const totalQueries = plans.reduce((sum, p) => sum + p.queries_generated.length, 0);

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Search Planner</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No search planner calls yet. This multi-pass LLM step generates discovery queries.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Search Planner</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            calls.some((c) => c.status === 'failed')
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}>
            {calls.some((c) => c.status === 'failed') ? 'Error' : `${plans.length} pass${plans.length > 1 ? 'es' : ''}`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Passes" value={plans.length || calls.length} />
        <StatCard label="Queries Generated" value={totalQueries} />
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} />}
      </div>

      {/* Vertical Stepper */}
      {hasStructured && (
        <VerticalStepper>
          {plans.map((plan, i) => (
            <Step
              key={i}
              index={plan.pass_index}
              title={plan.pass_name || `Pass ${plan.pass_index + 1}`}
              subtitle={plan.stop_condition}
              isLast={i === plans.length - 1}
            >
              {plan.plan_rationale && (
                <div className="text-gray-500 dark:text-gray-400 mb-2 italic">{plan.plan_rationale}</div>
              )}
              {plan.queries_generated.length > 0 && (
                <div className="space-y-1">
                  {plan.queries_generated.map((q, qi) => (
                    <div key={qi} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono w-4 shrink-0">{qi + 1}.</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300 text-[11px]">{q}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                Stop: {plan.stop_condition}
              </div>
            </Step>
          ))}
        </VerticalStepper>
      )}

      {/* Plan Diff (when multiple passes) */}
      {plans.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            Plan diff between passes
          </summary>
          <div className="mt-2 space-y-2">
            {plans.slice(1).map((plan, i) => {
              const prev = plans[i];
              const added = plan.queries_generated.filter((q) => !prev.queries_generated.includes(q));
              const removed = prev.queries_generated.filter((q) => !plan.queries_generated.includes(q));
              return (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                  <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {prev.pass_name} → {plan.pass_name}
                  </div>
                  {added.length > 0 && (
                    <div className="text-green-600 dark:text-green-400">
                      {added.map((q, qi) => <div key={qi}>+ {q}</div>)}
                    </div>
                  )}
                  {removed.length > 0 && (
                    <div className="text-red-600 dark:text-red-400">
                      {removed.map((q, qi) => <div key={qi}>- {q}</div>)}
                    </div>
                  )}
                  {added.length === 0 && removed.length === 0 && (
                    <div className="text-gray-400">No changes</div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: LLM Prompt/Response
        </summary>
        <div className="mt-2 space-y-2">
          {calls.map((call, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${llmCallStatusBadgeClass(call.status)}`}>{call.status}</span>
                <span className="text-[10px] text-gray-400">{call.model} / {call.provider}</span>
              </div>
              {call.prompt_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
              )}
              {call.response_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
