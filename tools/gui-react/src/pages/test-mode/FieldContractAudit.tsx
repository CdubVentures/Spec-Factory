import { useState } from 'react';
import { btnSecondary } from '../../shared/ui/buttonClasses.ts';
import type { FieldContractAuditResult, FieldAuditResult, FieldKnob, AuditCheck, ValidatorOutput, PhaseInfo } from './types.ts';

// ── Component ────────────────────────────────────────────────────────

interface FieldContractAuditProps {
  audit: FieldContractAuditResult;
}

export function FieldContractAudit({ audit }: FieldContractAuditProps) {
  const [filter, setFilter] = useState<'all' | 'failures'>('all');

  const filtered = filter === 'failures'
    ? audit.results.filter(r => r.checks.some(c => !c.pass))
    : audit.results;

  const { totalFields, totalChecks, passCount, failCount } = audit.summary;

  // WHY: Build step→phase lookup once for tooltip access in knob rows.
  const phaseByStep = new Map<number, PhaseInfo>();
  for (const p of (audit.phases ?? [])) phaseByStep.set(p.order, p);

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
        <span className="text-[10px] sf-text-subtle">Every field key — every parameter — every failure code</span>
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

      {/* Field rows */}
      <div className="overflow-x-auto">
        {filtered.map(field => (
          <FieldRow key={field.fieldKey} field={field} phaseByStep={phaseByStep} />
        ))}
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

function FieldRow({ field, phaseByStep }: { field: FieldAuditResult; phaseByStep: Map<number, PhaseInfo> }) {
  const { fieldKey, checks, knobs } = field;
  const total = checks.length;
  const pass = checks.filter(c => c.pass).length;
  const allPass = pass === total;
  const goodCheck = checks.find(c => c.type === 'good');

  // WHY: Link each knob to the check that exercises it.
  // Reject knobs match by code, repair knobs match by knob name.
  const knobCheckMap = buildKnobCheckMap(knobs, checks);

  return (
    <div className="border-b sf-border-default">
      <details>
        <summary className="cursor-pointer select-none flex items-center gap-2 px-2.5 py-2 hover:sf-bg-surface-soft">
          <span className="font-mono font-semibold sf-text-primary text-xs min-w-[160px]">{fieldKey}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${allPass ? 'sf-chip-success' : 'sf-chip-danger'}`}>
            {pass}/{total}
          </span>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${allPass ? 'sf-chip-success' : 'sf-chip-danger'}`}>
            {allPass ? 'PASS' : 'FAIL'}
          </span>
        </summary>

        <div className="px-2 py-1">
          {/* Good value row */}
          {goodCheck && (
            <div className="mb-2 px-2 py-1.5 sf-surface-elevated rounded border sf-border-default">
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold sf-chip-success`}>good</span>
                <span className="font-mono sf-text-muted" title={JSON.stringify(goodCheck.value)}>
                  {truncate(JSON.stringify(goodCheck.value), 60)}
                </span>
                <span className="sf-text-subtle text-[10px]">{goodCheck.description ?? ''}</span>
                <span className={`ml-auto text-[10px] font-bold ${goodCheck.pass ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                  {goodCheck.pass ? '\u2713 valid' : '\u2717 ' + goodCheck.detail}
                </span>
              </div>
              {goodCheck.validatorOutput && !goodCheck.pass && (
                <ValidatorTrace output={goodCheck.validatorOutput} />
              )}
            </div>
          )}

          {/* Unified knobs + checks table */}
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="sf-text-subtle border-b sf-border-default">
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Knob</th>
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Config</th>
                <th className="text-center py-1 px-2 text-[9px] uppercase tracking-wider font-semibold w-10">Step</th>
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Action</th>
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Test Input</th>
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Output</th>
                <th className="text-left py-1 px-2 text-[9px] uppercase tracking-wider font-semibold">Result</th>
                <th className="text-center py-1 px-2 text-[9px] uppercase tracking-wider font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {knobs.map((knob, i) => {
                const check = knobCheckMap.get(knob);
                return <KnobCheckRow key={i} knob={knob} check={check ?? null} phase={phaseByStep.get(knob.step) ?? null} />;
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ── KnobCheckRow — unified knob + check ─────────────────────────────

const ACTION_CLS: Record<string, string> = {
  'reject': 'sf-chip-danger',
  'soft_reject': 'sf-chip-warning',
  'deterministic': 'sf-chip-success',
  'dispatch': 'sf-chip-info',
  'pass-through': 'sf-chip-success',
  'info': 'sf-chip-neutral',
};

const ACTION_LABEL: Record<string, string> = {
  'reject': 'Reject',
  'soft_reject': 'Soft Reject',
  'deterministic': 'Deterministic',
  'dispatch': 'Dispatch',
  'pass-through': 'Pass-through',
  'info': 'Config',
};

function KnobCheckRow({ knob, check, phase }: { knob: FieldKnob; check: AuditCheck | null; phase: PhaseInfo | null }) {
  const hasTest = check !== null;
  const tooltip = phase ? `${phase.title}\n${phase.description}\n${phase.behaviorNote}` : '';

  return (
    <>
      <tr className="border-b sf-border-default hover:sf-bg-surface-soft">
        {/* Knob name — tooltip shows phase description */}
        <td className="py-1.5 px-2 font-mono font-semibold sf-text-primary text-[10px] cursor-help" title={tooltip}>{knob.knob}</td>
        {/* Config value */}
        <td className="py-1.5 px-2 font-mono sf-text-muted text-[10px] max-w-[120px] truncate" title={knob.value}>
          {truncate(knob.value, 30)}
        </td>
        {/* Step — tooltip shows phase title */}
        <td className="py-1.5 px-2 text-center sf-text-subtle text-[10px] cursor-help" title={phase?.title ?? ''}>{knob.step}</td>
        {/* Action */}
        <td className="py-1.5 px-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${ACTION_CLS[knob.action] ?? 'sf-chip-neutral'}`}>
            {ACTION_LABEL[knob.action] ?? knob.action}
          </span>
        </td>
        {/* Test input */}
        <td className="py-1.5 px-2 font-mono sf-text-muted text-[10px] max-w-[160px] truncate" title={hasTest ? JSON.stringify(check.value) : ''}>
          {hasTest ? truncate(JSON.stringify(check.value), 35) : <span className="sf-text-subtle">—</span>}
        </td>
        {/* Output — final value after validator */}
        <td className="py-1.5 px-2 font-mono text-[10px] max-w-[140px] truncate" title={hasTest && check.validatorOutput ? JSON.stringify(check.validatorOutput.value) : ''}>
          {hasTest && check.validatorOutput
            ? <span className="sf-status-text-info">{truncate(JSON.stringify(check.validatorOutput.value), 30)}</span>
            : <span className="sf-text-subtle">—</span>
          }
        </td>
        {/* Result */}
        <td className="py-1.5 px-2 text-[10px] max-w-[180px]">
          {hasTest
            ? <span className={`font-mono ${check.pass ? 'sf-text-muted' : 'sf-status-text-danger'}`}>
                {truncate(check.detail, 45)}
              </span>
            : <span className="sf-text-subtle">—</span>
          }
        </td>
        {/* Status */}
        <td className="py-1.5 px-2 text-center">
          {hasTest
            ? <span className={`text-[10px] font-bold ${check.pass ? 'sf-status-text-success' : 'sf-status-text-danger'}`}>
                {check.pass ? '\u2713' : '\u2717'}
              </span>
            : <span className="sf-text-subtle text-[10px]">—</span>
          }
        </td>
      </tr>
      {/* Expandable: validator trace */}
      {hasTest && check.validatorOutput && (
        <tr>
          <td colSpan={8} className="px-2 pb-0.5">
            <details>
              <summary className="text-[9px] sf-text-subtle cursor-pointer font-semibold select-none py-0.5 hover:sf-status-text-info">
                Validator trace ({check.validatorOutput.repairs.length} repairs, {check.validatorOutput.rejections.length} rejections)
              </summary>
              <div className="sf-surface-elevated border sf-border-default rounded-md px-3 py-2 mt-1 mb-1">
                <ValidatorTrace output={check.validatorOutput} />
              </div>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

// ── ValidatorTrace — shows repairs + rejections from the actual run ──

function ValidatorTrace({ output }: { output: ValidatorOutput }) {
  const { repairs, rejections, value, valid } = output;
  if (repairs.length === 0 && rejections.length === 0) {
    return <div className="text-[10px] sf-text-subtle">No repairs or rejections. Final value: {JSON.stringify(value)}</div>;
  }

  return (
    <div className="text-[10px] space-y-1 mt-1">
      {repairs.length > 0 && (
        <div>
          <span className="font-semibold sf-text-subtle">Repairs:</span>
          {repairs.map((r, i) => (
            <div key={i} className="ml-2 font-mono sf-text-muted">
              <span className="sf-status-text-info">[{r.step}]</span>{' '}
              {truncate(JSON.stringify(r.before), 25)} → {truncate(JSON.stringify(r.after), 25)}{' '}
              <span className="sf-text-subtle">({r.rule})</span>
            </div>
          ))}
        </div>
      )}
      {rejections.length > 0 && (
        <div>
          <span className="font-semibold sf-text-subtle">Rejections:</span>
          {rejections.map((r, i) => (
            <div key={i} className="ml-2 font-mono sf-status-text-danger">
              {r.reason_code}
            </div>
          ))}
        </div>
      )}
      <div className="sf-text-subtle">
        Final: <span className="font-mono">{truncate(JSON.stringify(value), 40)}</span>
        {' '}<span className={valid ? 'sf-status-text-success' : 'sf-status-text-danger'}>{valid ? 'valid' : 'invalid'}</span>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

/**
 * Link knobs to checks. Reject knobs match by failure code.
 * Repair knobs match by knob name (last segment of dotted knob path).
 */
function buildKnobCheckMap(knobs: FieldKnob[], checks: AuditCheck[]): Map<FieldKnob, AuditCheck> {
  const rejectChecks = checks.filter(c => c.type === 'reject');
  const repairChecks = checks.filter(c => c.type === 'repair');
  const map = new Map<FieldKnob, AuditCheck>();

  for (const knob of knobs) {
    // Try matching reject check by failure code
    if (knob.code) {
      const match = rejectChecks.find(c => c.expectedCode === knob.code);
      if (match) { map.set(knob, match); continue; }
    }

    // Try matching repair check by knob name
    const shortName = knob.knob.split('.').pop() ?? '';
    const repairMatch = repairChecks.find(c =>
      c.knob === shortName || c.knob === knob.knob,
    );
    if (repairMatch) { map.set(knob, repairMatch); continue; }
  }

  return map;
}
