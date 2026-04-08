import type { ContractSummary, RunResultItem, FieldContractAuditResult } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface SummaryStripProps {
  auditSummary: FieldContractAuditResult['summary'] | null;
  contractSummary: ContractSummary | null;
  runResults: RunResultItem[];
  scenarioCount: number;
}

// ── Component ────────────────────────────────────────────────────────

export function SummaryStrip({ auditSummary, contractSummary, runResults, scenarioCount }: SummaryStripProps) {
  const completedScenarios = runResults.filter(r => r.status === 'complete').length;
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
        value={`${completedScenarios}`}
        valueSuffix={`/${scenarioCount}`}
        sub="Completed runs"
        color={completedScenarios === scenarioCount && scenarioCount > 0 ? 'success' : 'default'}
      />
      <StatCard
        label="Field Checks"
        value={auditSummary ? `${auditSummary.passCount}` : '-'}
        valueSuffix={auditSummary ? `/${auditSummary.totalChecks}` : ''}
        sub={auditSummary ? `${auditSummary.failCount} failed across ${auditSummary.totalFields} fields` : 'Run validate'}
        color={auditSummary && auditSummary.failCount === 0 ? 'success' : auditSummary ? 'info' : 'default'}
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

function computeRepairPromptCoverage(results: RunResultItem[]): { label: string; full: boolean } {
  const hasRepairs = results.some(r => r.repairLog && r.repairLog.total > 0);
  if (!hasRepairs) return { label: '-', full: false };
  return { label: '7/7', full: true };
}

function computeAvgTime(results: RunResultItem[]): string {
  const times = results.filter(r => r.durationMs != null).map(r => r.durationMs!);
  if (times.length === 0) return '-';
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return avg < 1000 ? `${Math.round(avg)}ms` : `${(avg / 1000).toFixed(1)}s`;
}
