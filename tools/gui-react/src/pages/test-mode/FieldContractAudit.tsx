import { useState } from 'react';
import { btnSecondary } from '../../shared/ui/buttonClasses.ts';
import type { FieldContractAuditResult, FieldAuditResult, AuditCheck } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface FieldContractAuditProps {
  audit: FieldContractAuditResult;
}

// ── Component ────────────────────────────────────────────────────────

export function FieldContractAudit({ audit }: FieldContractAuditProps) {
  const [filter, setFilter] = useState<'all' | 'failures'>('all');

  const filtered = filter === 'failures'
    ? audit.results.filter(r => r.checks.some(c => !c.pass))
    : audit.results;

  const { totalFields, totalChecks, passCount, failCount } = audit.summary;

  return (
    <div className="sf-surface-card border sf-border-default rounded-lg overflow-hidden">
      {/* Summary bar */}
      <div className="flex gap-px bg-[rgb(var(--sf-color-border-default-rgb))]">
        <MetricCell label="Fields" value={String(totalFields)} color="sf-text-primary" />
        <MetricCell label="Checks" value={String(totalChecks)} color="sf-text-primary" />
        <MetricCell label="Passed" value={String(passCount)} color="sf-status-text-success" />
        <MetricCell label="Failed" value={String(failCount)} color={failCount > 0 ? 'sf-status-text-danger' : 'sf-text-muted'} />
      </div>

      {/* Filter + heading */}
      <div className="px-4 py-2.5 flex items-center gap-2.5 border-b sf-border-default">
        <span className="text-[13px] font-semibold sf-text-primary">Field Contract Audit</span>
        <span className="text-[10px] sf-text-subtle">Every field key, every failure point, every prompt</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`${btnSecondary} ${filter === 'all' ? 'sf-chip-info' : ''}`}
          >All ({audit.results.length})</button>
          <button
            onClick={() => setFilter('failures')}
            className={`${btnSecondary} ${filter === 'failures' ? 'sf-chip-danger' : ''}`}
          >Failures ({audit.results.filter(r => r.checks.some(c => !c.pass)).length})</button>
        </div>
      </div>

      {/* Field table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="sf-text-subtle sf-surface-elevated border-b sf-border-default">
              <th className="text-left py-1.5 px-2.5 text-[9px] uppercase tracking-wider font-semibold min-w-[160px]">Field</th>
              <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider font-semibold text-center w-16">Checks</th>
              <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider font-semibold text-center w-14">Good</th>
              <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider font-semibold text-center w-16">Rejects</th>
              <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider font-semibold text-center w-16">Repairs</th>
              <th className="py-1.5 px-2 text-[9px] uppercase tracking-wider font-semibold text-center w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(field => (
              <FieldRow key={field.fieldKey} field={field} />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="px-4 py-6 text-center text-sm sf-text-muted">
          {filter === 'failures' ? 'No failures — all field checks pass.' : 'No audit results.'}
        </div>
      )}
    </div>
  );
}

// ── MetricCell ───────────────────────────────────────────────────────

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 bg-[rgb(var(--sf-color-surface-elevated-rgb))] text-center py-2 px-3.5">
      <div className={`text-base font-bold tracking-tight ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider sf-text-subtle mt-0.5">{label}</div>
    </div>
  );
}

// ── FieldRow ─────────────────────────────────────────────────────────

function FieldRow({ field }: { field: FieldAuditResult }) {
  const { fieldKey, checks } = field;
  const total = checks.length;
  const pass = checks.filter(c => c.pass).length;
  const allPass = pass === total;
  const goodCheck = checks.find(c => c.type === 'good');
  const rejectChecks = checks.filter(c => c.type === 'reject');
  const repairChecks = checks.filter(c => c.type === 'repair');
  const rejectPass = rejectChecks.filter(c => c.pass).length;
  const repairPass = repairChecks.filter(c => c.pass).length;

  return (
    <>
      <tr className="border-b sf-border-default hover:sf-bg-surface-soft">
        <td className="py-2 px-2.5" colSpan={6}>
          <details>
            <summary className="cursor-pointer select-none flex items-center gap-2">
              <span className="font-mono font-semibold sf-text-primary text-xs min-w-[160px]">{fieldKey}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${allPass ? 'sf-chip-success' : 'sf-chip-danger'}`}>
                {pass}/{total}
              </span>
              <span className={`text-[10px] ${goodCheck?.pass ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                {goodCheck?.pass ? '\u2713' : '\u2717'} good
              </span>
              <span className={`text-[10px] ${rejectPass === rejectChecks.length ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                {rejectPass}/{rejectChecks.length} rejects
              </span>
              <span className={`text-[10px] ${repairPass === repairChecks.length ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                {repairPass}/{repairChecks.length} repairs
              </span>
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${allPass ? 'sf-chip-success' : 'sf-chip-danger'}`}>
                {allPass ? 'PASS' : 'FAIL'}
              </span>
            </summary>

            {/* Expanded: check sub-table */}
            <div className="mt-2 ml-2 mb-1">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="sf-text-subtle border-b sf-border-default">
                    <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold w-16">Type</th>
                    <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Input</th>
                    <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Parameter</th>
                    <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Expected</th>
                    <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Actual</th>
                    <th className="text-center py-1 px-2 text-[9px] uppercase tracking-wider font-semibold w-14">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check, i) => (
                    <CheckRow key={i} check={check} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}

// ── CheckRow ─────────────────────────────────────────────────────────

const TYPE_CHIP: Record<AuditCheck['type'], string> = {
  good: 'sf-chip-success',
  reject: 'sf-chip-warning',
  repair: 'sf-chip-info',
};

function CheckRow({ check }: { check: AuditCheck }) {
  const param = check.type === 'reject'
    ? check.expectedCode ?? '—'
    : check.type === 'repair'
      ? check.knob ?? '—'
      : '—';

  const expected = check.type === 'good'
    ? 'valid'
    : check.type === 'reject'
      ? check.expectedCode ?? '—'
      : truncate(JSON.stringify(check.expectedRepair));

  const actual = check.type === 'good'
    ? check.detail
    : check.type === 'reject'
      ? (check.actualCodes ?? []).join(', ') || '—'
      : truncate(JSON.stringify(check.actualValue));

  return (
    <>
      <tr className="border-b sf-border-default hover:sf-bg-surface-soft">
        <td className="py-1.5 px-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${TYPE_CHIP[check.type]}`}>
            {check.type}
          </span>
        </td>
        <td className="py-1.5 px-2 font-mono sf-text-muted max-w-[200px] truncate" title={JSON.stringify(check.value)}>
          {truncate(JSON.stringify(check.value))}
        </td>
        <td className="py-1.5 px-2 font-mono font-semibold sf-text-primary">{param}</td>
        <td className="py-1.5 px-2 font-mono sf-text-muted">{expected}</td>
        <td className="py-1.5 px-2 font-mono sf-text-muted">{actual}</td>
        <td className="py-1.5 px-2 text-center">
          <span className={`text-[10px] font-bold ${check.pass ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
            {check.pass ? '\u2713' : '\u2717'}
          </span>
        </td>
      </tr>
      {/* Prompt expansion for reject checks with prompts */}
      {check.type === 'reject' && check.prompt && (
        <tr>
          <td colSpan={6} className="px-2 pb-1.5">
            <details>
              <summary className="text-[9px] sf-text-subtle cursor-pointer font-semibold select-none py-0.5 hover:sf-status-text-info">
                Prompt: {check.prompt.promptId}
              </summary>
              <pre className="sf-surface-elevated border sf-border-default rounded-md px-3 py-2 mt-1 text-[10px] font-mono leading-relaxed sf-text-muted whitespace-pre-wrap max-h-48 overflow-y-auto">
                {`SYSTEM:\n${check.prompt.system}\n\nUSER:\n${check.prompt.user}`}
              </pre>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}
