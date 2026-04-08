import type { CoverageMatrix, ValidationResult } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface CoverageMatricesProps {
  matrices: {
    fieldRules: CoverageMatrix;
    components: CoverageMatrix;
    listsEnums: CoverageMatrix;
  };
  validationResult: ValidationResult | null;
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  summaryLine?: string;
}

interface MatrixTableProps {
  matrix: CoverageMatrix;
  validationResult: ValidationResult | null;
  collapsed: boolean;
  onToggle: () => void;
}

// ── CoverageMatrices wrapper ─────────────────────────────────────────

export function CoverageMatrices({
  matrices,
  validationResult,
  collapsed,
  onToggle,
  summaryLine,
}: CoverageMatricesProps) {
  return (
    <div className="space-y-3">
      {summaryLine && (
        <div className="text-xs sf-text-subtle">{summaryLine}</div>
      )}
      <MatrixTable
        matrix={matrices.fieldRules}
        validationResult={validationResult}
        collapsed={collapsed.fieldRules ?? true}
        onToggle={() => onToggle('fieldRules')}
      />
      <MatrixTable
        matrix={matrices.components}
        validationResult={validationResult}
        collapsed={collapsed.components ?? true}
        onToggle={() => onToggle('components')}
      />
      <MatrixTable
        matrix={matrices.listsEnums}
        validationResult={validationResult}
        collapsed={collapsed.listsEnums ?? true}
        onToggle={() => onToggle('listsEnums')}
      />
    </div>
  );
}

// ── MatrixTable ──────────────────────────────────────────────────────

function MatrixTable({ matrix, validationResult, collapsed, onToggle }: MatrixTableProps) {
  const rowsWithStatus = matrix.rows.map(row => {
    if (!validationResult) return row;
    const relevant = validationResult.results.filter(r =>
      row.testNumbers.some(t => r.testCaseId === t)
    );
    if (relevant.length === 0) return row;
    const allPass = relevant.every(r => r.pass);
    const anyFail = relevant.some(r => !r.pass);
    return {
      ...row,
      validationStatus: anyFail ? 'fail' as const : allPass ? 'pass' as const : 'pending' as const,
    };
  });

  const passCount = rowsWithStatus.filter(r => r.validationStatus === 'pass').length;
  const failCount = rowsWithStatus.filter(r => r.validationStatus === 'fail').length;

  return (
    <div className="sf-surface-card border sf-border-default rounded-lg overflow-hidden">
      {/* Header (clickable) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:sf-bg-surface-soft transition-colors"
      >
        <span className="text-[11px] font-mono sf-text-subtle w-3.5">{collapsed ? '+' : '-'}</span>
        <span className="text-[13px] font-semibold sf-text-primary">{matrix.title}</span>
        <span className="text-[10px] sf-text-subtle">{matrix.rows.length} rows</span>
        {validationResult && (
          <span className="text-[10px] ml-1">
            {passCount > 0 && <span className="sf-status-text-success mr-1">{passCount} pass</span>}
            {failCount > 0 && <span className="sf-status-text-danger">{failCount} fail</span>}
          </span>
        )}
        <span className="ml-auto flex gap-3 text-[10px] sf-text-subtle">
          {Object.entries(matrix.summary).map(([k, v]) => (
            <span key={k} className="font-mono">{k}: {v}</span>
          ))}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left sf-text-subtle border-b sf-border-default">
                {validationResult && <th className="pb-1.5 pr-2 w-6" />}
                {matrix.columns.map(col => (
                  <th
                    key={col.key}
                    className="pb-1.5 pr-2 whitespace-nowrap"
                    style={{ minWidth: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsWithStatus.map(row => (
                <tr key={row.id} className="border-b sf-border-default hover:sf-bg-surface-soft">
                  {validationResult && (
                    <td className="py-1 pr-2">
                      {row.validationStatus === 'pass' && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full sf-metric-fill-success" title="All linked checks passed" />
                      )}
                      {row.validationStatus === 'fail' && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full sf-metric-fill-danger" title="One or more linked checks failed" />
                      )}
                      {row.validationStatus === 'pending' && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full sf-metric-fill-info" title="No validation run yet" />
                      )}
                    </td>
                  )}
                  {matrix.columns.map(col => (
                    <td key={col.key} className="py-1 pr-2 font-mono sf-text-muted whitespace-nowrap">
                      {col.key === 'testNumbers' || col.key === 'testScenario'
                        ? String(row.cells[col.key] ?? row.testNumbers?.join(', ') ?? '-')
                        : col.key === 'expectedBehavior'
                          ? <span className="whitespace-normal max-w-[250px] inline-block">{row.expectedBehavior}</span>
                          : String(row.cells[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
