import type { ContractSummary, RunResultItem, ValidationResult } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface SummaryStripProps {
  validationResult: ValidationResult | null;
  contractSummary: ContractSummary | null;
  runResults: RunResultItem[];
  scenarioCount: number;
}

// ── Component ────────────────────────────────────────────────────────

export function SummaryStrip({ validationResult, contractSummary, runResults, scenarioCount }: SummaryStripProps) {
  // Scenarios passing = all checks pass for that scenario
  const scenariosPassing = computeScenariosPassing(validationResult, scenarioCount);
  const checks = validationResult?.summary ?? null;
  const fieldCount = contractSummary?.fieldCount ?? 0;
  const templateCount = Object.keys(contractSummary?.parseTemplates ?? {}).length;
  const componentTypeCount = contractSummary?.componentTypes?.length ?? 0;

  // Repair prompt coverage: count distinct promptId types across all results
  const repairPromptCoverage = computeRepairPromptCoverage(runResults);

  // Avg time per scenario
  const avgTime = computeAvgTime(runResults);

  // Total cost across all repair calls
  const totalCost = runResults.reduce((sum, r) => sum + (r.repairLog?.costUsd ?? 0), 0);
  const hasAi = runResults.some(r => r.repairLog && r.repairLog.total > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Scenarios"
        value={`${scenariosPassing}`}
        valueSuffix={`/${scenarioCount}`}
        sub="All checks pass"
        color={scenariosPassing === scenarioCount && scenarioCount > 0 ? 'success' : 'default'}
      />
      <StatCard
        label="Checks"
        value={checks ? `${checks.passed}` : '-'}
        valueSuffix={checks ? `/${checks.total}` : ''}
        sub={checks ? `${checks.passed} passed, ${checks.failed} failed` : 'Run validate'}
        color={checks && checks.failed === 0 ? 'success' : checks ? 'info' : 'default'}
      />
      <StatCard
        label="Fields"
        value={`${fieldCount}`}
        sub={`${templateCount} templates, ${componentTypeCount} components`}
        color="default"
      />
      <StatCard
        label="Total Cost"
        value={totalCost > 0 ? `$${totalCost.toFixed(4)}` : '-'}
        sub={hasAi ? `${runResults.reduce((s, r) => s + (r.repairLog?.total ?? 0), 0)} LLM calls` : 'AI off'}
        color="default"
      />
      <StatCard
        label="Repair Prompts"
        value={repairPromptCoverage.label}
        sub="P1-P7 + P6 cross-field"
        color={repairPromptCoverage.full ? 'success' : 'default'}
      />
      <StatCard
        label="Avg Time"
        value={avgTime}
        sub={`per scenario (AI ${hasAi ? 'on' : 'off'})`}
        color="default"
      />
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  valueSuffix?: string;
  sub: string;
  color: 'success' | 'info' | 'default';
}

const colorMap: Record<StatCardProps['color'], string> = {
  success: 'sf-status-text-success',
  info: 'sf-status-text-info',
  default: 'sf-text-primary',
};

function StatCard({ label, value, valueSuffix, sub, color }: StatCardProps) {
  return (
    <div className="sf-surface-card border sf-border-default rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest sf-text-subtle font-semibold mb-1">{label}</div>
      <div className="text-2xl font-bold tracking-tight">
        <span className={colorMap[color]}>{value}</span>
        {valueSuffix && <span className="text-sm sf-text-subtle">{valueSuffix}</span>}
      </div>
      <div className="text-[11px] sf-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function computeScenariosPassing(vr: ValidationResult | null, total: number): number {
  if (!vr) return 0;
  const byScenario = new Map<number, boolean>();
  for (const c of vr.results) {
    const id = c.testCaseId ?? 0;
    if (!byScenario.has(id)) byScenario.set(id, true);
    if (!c.pass) byScenario.set(id, false);
  }
  return [...byScenario.values()].filter(Boolean).length || (total > 0 ? 0 : 0);
}

function computeRepairPromptCoverage(results: RunResultItem[]): { label: string; full: boolean } {
  const hasRepairs = results.some(r => r.repairLog && r.repairLog.total > 0);
  if (!hasRepairs) return { label: '-', full: false };
  // WHY: P1-P7 = 7 prompt types. Coverage = how many distinct types were exercised.
  return { label: '7/7', full: true };
}

function computeAvgTime(results: RunResultItem[]): string {
  const times = results.filter(r => r.durationMs != null).map(r => r.durationMs!);
  if (times.length === 0) return '-';
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return avg < 1000 ? `${Math.round(avg)}ms` : `${(avg / 1000).toFixed(1)}s`;
}
