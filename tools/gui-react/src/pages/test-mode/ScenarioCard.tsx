import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import type {
  TestCase,
  RunResultItem,
  ValidationCheck,
  RepairEntry,
  RepairProgress,
  RepairsResponse,
} from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface ScenarioCardProps {
  testCase: TestCase;
  runResult: RunResultItem | undefined;
  checks: ValidationCheck[];
  testCategory: string;
  isRunning: boolean;
  activeProductId: string | null;
  repairProgress: RepairProgress | null;
  onRunOne: (productId: string) => void;
}

// ── Reason code → color class mapping ────────────────────────────────

const reasonColorMap: Record<string, string> = {
  wrong_shape: 'sf-llm-soft-badge',
  wrong_type: 'sf-chip-info',
  wrong_unit: 'sf-chip-warning',
  bad_format: 'sf-chip-danger',
  enum_not_allowed: 'sf-chip-success',
  unknown_enum_prefer_known: 'sf-chip-success',
  out_of_range: 'sf-chip-warning',
  rounding_exceeded: 'sf-chip-neutral',
  component_not_found: 'sf-llm-soft-badge',
  cross_field: 'sf-llm-soft-badge',
};

const statusPillMap: Record<string, string> = {
  valid: 'sf-chip-success',
  repaired: 'sf-chip-success',
  pending_llm: 'sf-chip-info',
  still_failed: 'sf-chip-danger',
  prompt_skipped: 'sf-chip-warning',
  rerun_recommended: 'sf-chip-warning',
};

// ── Component ────────────────────────────────────────────────────────

export function ScenarioCard({
  testCase,
  runResult,
  checks,
  testCategory,
  isRunning,
  activeProductId,
  repairProgress,
  onRunOne,
}: ScenarioCardProps) {
  const productId = runResult?.productId ?? testCase.productId ?? '';
  const isThisRunning = activeProductId === productId && Boolean(productId);
  const passChecks = checks.filter(c => c.pass).length;
  const failChecks = checks.filter(c => !c.pass).length;
  const allPass = checks.length > 0 && failChecks === 0;
  const hasRepairs = (runResult?.repairLog?.total ?? 0) > 0;

  // Fetch repair data lazily when repairs exist
  const { data: repairData } = useQuery({
    queryKey: ['test-mode', 'repairs', testCategory, productId],
    queryFn: () => api.get<RepairsResponse>(
      `/test-mode/field-test-repairs?category=${encodeURIComponent(testCategory)}&productId=${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(testCategory && productId && hasRepairs),
    staleTime: 60_000,
  });
  const repairs = repairData?.repairs ?? [];

  return (
    <div className={`sf-surface-card border sf-border-default rounded-lg overflow-hidden ${
      checks.length > 0
        ? allPass
          ? 'border-l-[3px] border-l-[var(--sf-state-success-fg)]'
          : 'border-l-[3px] border-l-[var(--sf-state-danger-fg)]'
        : ''
    }`}>
      {/* Top: name + description + badge */}
      <div className="px-4 pt-3.5 pb-2 flex justify-between items-start gap-3">
        <div>
          <div className="text-sm font-semibold sf-text-primary">
            #{testCase.id} {testCase.name.replace(/_/g, ' ')}
          </div>
          <div className="text-[11px] sf-text-muted mt-0.5">{testCase.description}</div>
        </div>
        {checks.length > 0 && (
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
            allPass ? 'sf-chip-success' : 'sf-chip-danger'
          }`}>
            {passChecks}/{passChecks + failChecks}
          </span>
        )}
        {checks.length === 0 && !isThisRunning && runResult && (
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
            runResult.status === 'error' ? 'sf-chip-danger' :
            runResult.status === 'complete' ? 'sf-chip-success' :
            'sf-chip-neutral'
          }`}>
            {runResult.status}
          </span>
        )}
        {isThisRunning && (
          <span className="text-[10px] px-2 py-0.5 rounded font-medium sf-chip-info animate-pulse">
            running
          </span>
        )}
      </div>

      {/* Live repair progress — shows each LLM call as it happens */}
      {isThisRunning && repairProgress && (
        <LiveRepairFeed progress={repairProgress} />
      )}

      {/* Running indicator without repair progress (deterministic mode) */}
      {isThisRunning && !repairProgress && (
        <div className="px-4 py-2.5 flex items-center gap-2 text-[11px] sf-text-muted border-b sf-border-default">
          <Spinner className="h-3.5 w-3.5" />
          <span className="font-medium">Running pipeline...</span>
        </div>
      )}

      {/* Metrics row */}
      {runResult && runResult.status === 'complete' && (
        <MetricsRow runResult={runResult} />
      )}

      {/* Inline violation table */}
      {repairs.length > 0 && (
        <ViolationTable repairs={repairs} />
      )}

      {/* Loading state for repairs */}
      {hasRepairs && !repairData && !isThisRunning && (
        <div className="px-4 py-2 flex items-center gap-2 text-[10px] sf-text-muted">
          <Spinner className="h-3 w-3" />
          Loading violations...
        </div>
      )}

      {/* Check results */}
      {checks.length > 0 && (
        <div className="px-4 py-2.5 space-y-0.5">
          {checks.map((ck, i) => (
            <div key={i} className="flex items-center gap-2 py-[3px] text-xs">
              <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] flex-shrink-0 ${
                ck.pass ? 'sf-chip-success' : 'sf-chip-danger'
              }`}>
                {ck.pass ? '\u2713' : '\u2717'}
              </span>
              <span className={`text-[11px] ${ck.pass ? 'sf-text-muted' : 'sf-status-text-danger font-medium'}`}>
                {ck.check}
              </span>
              <span className={`text-[10px] ml-auto ${ck.pass ? 'sf-text-subtle' : 'sf-status-text-danger'}`}>
                {ck.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Run button (when no results yet) */}
      {!runResult && (
        <div className="px-4 py-2 border-t sf-border-default">
          <button
            onClick={() => onRunOne(productId)}
            disabled={isRunning || !productId}
            className="text-[10px] px-2 py-1 rounded sf-icon-button transition-colors disabled:opacity-50"
          >
            Run
          </button>
        </div>
      )}
    </div>
  );
}

// ── MetricsRow ───────────────────────────────────────────────────────
// WHY: Uses gap-based dividers (like the HTML mockup), not cell borders

function MetricsRow({ runResult }: { runResult: RunResultItem }) {
  const repair = runResult.repairLog;
  const hasPending = (repair?.pendingLlm ?? 0) > 0;
  const hasLlmResults = (repair?.repaired ?? 0) > 0 || (repair?.failed ?? 0) > 0;

  const metrics = hasPending
    ? [
        // Deterministic audit mode
        { label: 'Fields', value: String(repair?.total ?? 0), color: 'sf-text-primary' },
        { label: 'Valid', value: String(repair?.valid ?? 0), color: 'sf-status-text-success' },
        { label: 'Pending LLM', value: String(repair?.pendingLlm ?? 0), color: 'sf-status-text-info' },
        { label: 'Time', value: fmtTime(runResult.durationMs), color: 'sf-text-primary' },
      ]
    : hasLlmResults
    ? [
        // AI-on repair mode
        { label: 'Rejections', value: String((repair?.total ?? 0) - (repair?.valid ?? 0)), color: 'sf-status-text-danger' },
        { label: 'Repaired', value: String(repair?.repaired ?? 0), color: 'sf-status-text-success' },
        { label: 'Set to unk', value: String((repair?.failed ?? 0) + (repair?.promptSkipped ?? 0)), color: 'sf-status-text-warning' },
        { label: 'Time', value: fmtTime(runResult.durationMs), color: 'sf-text-primary' },
      ]
    : [
        // No repair data — traffic light
        { label: 'Green', value: String(runResult.trafficLight?.green ?? 0), color: 'sf-status-text-success' },
        { label: 'Yellow', value: String(runResult.trafficLight?.yellow ?? 0), color: 'sf-status-text-warning' },
        { label: 'Red', value: String(runResult.trafficLight?.red ?? 0), color: 'sf-status-text-danger' },
        { label: 'Conf', value: runResult.confidence != null ? runResult.confidence.toFixed(2) : '-', color: 'sf-status-text-info' },
      ];

  return (
    <div className="flex gap-px bg-[rgb(var(--sf-color-border-default-rgb))]">
      {metrics.map(m => (
        <div key={m.label} className="flex-1 bg-[rgb(var(--sf-color-surface-elevated-rgb))] text-center py-2 px-3.5">
          <div className={`text-base font-bold tracking-tight ${m.color}`}>{m.value}</div>
          <div className="text-[9px] uppercase tracking-wider sf-text-subtle mt-0.5">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── ViolationTable ───────────────────────────────────────────────────

function ViolationTable({ repairs }: { repairs: RepairEntry[] }) {
  const fieldRepairs = repairs.filter(r => r.field !== 'cross_field');
  if (fieldRepairs.length === 0) return null;

  const isAudit = fieldRepairs.some(r => r.status === 'valid' || r.status === 'pending_llm');
  const thCls = 'text-left py-1.5 px-2.5 text-[9px] uppercase tracking-wider font-semibold';
  const colSpan = 8;

  return (
    <div className="mx-4 mt-3 mb-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide sf-llm-soft-badge mb-2 flex items-center gap-1.5">
        <span>{isAudit ? '\u{1F50D}' : '\u2699'}</span> {isAudit ? 'Field Audit' : 'Per-Field Violations & Repairs'}
      </div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="sf-text-subtle sf-surface-elevated border-b sf-border-default">
            <th className={thCls}>Field</th>
            <th className={thCls}>Before</th>
            <th className={thCls}>Decision</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>After</th>
            <th className={thCls}>Model</th>
            <th className={thCls}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {fieldRepairs.map((r, i) => (
            <ViolationRow key={`${r.field}-${i}`} repair={r} colSpan={colSpan} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ViolationRow (unified — works for both deterministic and AI-on) ──

function ViolationRow({ repair, colSpan }: { repair: RepairEntry; colSpan: number }) {
  const isValid = repair.status === 'valid';
  const isPending = repair.status === 'pending_llm';
  const reasonCode = repair.rejections?.[0]?.reason_code ?? (isValid ? 'valid' : 'unknown');
  const decisionChip = isValid ? 'sf-chip-success' : (reasonColorMap[reasonCode] ?? 'sf-chip-neutral');
  const statusClass = statusPillMap[repair.status] ?? 'sf-chip-neutral';
  const cellCls = 'py-2 px-2.5';

  return (
    <>
      <tr className="border-b sf-border-default hover:sf-bg-surface-soft">
        <td className={`${cellCls} font-mono font-semibold text-[11px] sf-text-primary`}>{repair.field}</td>
        <td className={`${cellCls} font-mono text-[10px] sf-text-muted`}>
          {repair.value_before != null ? truncateValue(repair.value_before) : '-'}
        </td>
        <td className={cellCls}>
          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${decisionChip}`}>
            {isValid ? 'valid' : reasonCode}
          </span>
          {repair.promptId && (
            <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold sf-chip-info">
              {repair.promptId}
            </span>
          )}
        </td>
        <td className={cellCls}>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold ${statusClass}`}>
            {isPending ? 'pending' : repair.status}
          </span>
        </td>
        <td className={`${cellCls} font-mono text-[10px]`}>
          {isValid ? (
            <span className="sf-status-text-success">{truncateValue(repair.value_after)}</span>
          ) : isPending ? (
            <span className="sf-status-text-info italic">pending LLM</span>
          ) : repair.status === 'repaired' ? (
            <span className="sf-status-text-success">{truncateValue(repair.value_after)}</span>
          ) : (
            <span className="sf-status-text-warning">unk</span>
          )}
        </td>
        <td className={`${cellCls} text-[9px] sf-text-subtle font-mono`}>
          {repair.model || (repair.prompt_in ? 'LLM' : '-')}
        </td>
        <td className={`${cellCls} text-[9px] sf-text-subtle font-mono`}>
          {repair.cost_usd != null ? `$${repair.cost_usd.toFixed(4)}` : '-'}
        </td>
      </tr>
      {/* Expandable prompt/response */}
      {repair.prompt_in && (
        <tr>
          <td colSpan={colSpan} className="px-2.5 pb-2">
            <details>
              <summary className="text-[9px] sf-text-subtle cursor-pointer font-semibold select-none py-0.5 hover:sf-status-text-info">
                {repair.response_out != null ? 'Prompt & Response' : 'View Prompt'}
              </summary>
              <pre className="sf-surface-elevated border sf-border-default rounded-md px-3 py-2 mt-1 text-[10px] font-mono leading-relaxed sf-text-muted whitespace-pre-wrap max-h-48 overflow-y-auto">
                {repair.prompt_in.system && `SYSTEM: ${repair.prompt_in.system}\n\n`}
                {`USER: ${repair.prompt_in.user}`}
              </pre>
              {repair.response_out != null && (
                <pre className={`sf-surface-elevated border sf-border-default rounded-md px-3 py-2 mt-1 text-[10px] font-mono leading-relaxed sf-text-muted whitespace-pre-wrap max-h-48 overflow-y-auto ${
                  repair.status !== 'repaired' ? 'sf-border-danger-soft' : ''
                }`}>
                  {`RESPONSE:\n${typeof repair.response_out === 'string' ? repair.response_out : JSON.stringify(repair.response_out, null, 2)}`}
                </pre>
              )}
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

// ── LiveRepairFeed ───────────────────────────────────────────────────

function LiveRepairFeed({ progress }: { progress: RepairProgress }) {
  return (
    <div className="px-4 py-2.5 border-b sf-border-default sf-surface-elevated">
      <div className="flex items-center gap-2 text-[11px]">
        <Spinner className="h-3.5 w-3.5" />
        <span className="font-semibold sf-text-primary">
          AI Repair {progress.index + 1}/{progress.total}
        </span>
        <span className="font-mono sf-text-muted">{progress.field}</span>
        {progress.promptId && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold sf-chip-info">{progress.promptId}</span>
        )}
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
          progress.status === 'calling' ? 'sf-chip-info animate-pulse' :
          progress.status === 'repaired' ? 'sf-chip-success' :
          'sf-chip-danger'
        }`}>
          {progress.status === 'calling' ? 'calling LLM...' : progress.status}
        </span>
      </div>
      {/* Mini progress bar */}
      <div className="mt-1.5 h-1 rounded-full sf-surface-card overflow-hidden">
        <div
          className="h-full sf-metric-fill-info transition-all"
          role="progressbar"
          aria-valuenow={progress.index + 1}
          aria-valuemax={progress.total}
          /* WHY: Width as percentage — only case where dynamic style is needed for data-driven layout */
          /* eslint-disable-next-line react/forbid-dom-props */
          style={{ width: `${((progress.index + (progress.status === 'calling' ? 0.5 : 1)) / progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtTime(ms: number | undefined): string {
  if (ms == null) return '-';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function truncateValue(v: string | null | undefined): string {
  const s = String(v ?? 'unk');
  return s.length > 30 ? s.slice(0, 27) + '...' : s;
}
