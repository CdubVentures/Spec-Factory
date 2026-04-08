import type { CoverageMatrix } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface CoverageMatricesProps {
  matrices: {
    fieldRules: CoverageMatrix;
    components: CoverageMatrix;
    listsEnums: CoverageMatrix;
  };
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  summaryLine?: string;
}

interface MatrixTableProps {
  matrix: CoverageMatrix;
  collapsed: boolean;
  onToggle: () => void;
}

// ── CoverageMatrices wrapper ─────────────────────────────────────────

export function CoverageMatrices({
  matrices,
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
        collapsed={collapsed.fieldRules ?? true}
        onToggle={() => onToggle('fieldRules')}
      />
      <MatrixTable
        matrix={matrices.components}
        collapsed={collapsed.components ?? true}
        onToggle={() => onToggle('components')}
      />
      <MatrixTable
        matrix={matrices.listsEnums}
        collapsed={collapsed.listsEnums ?? true}
        onToggle={() => onToggle('listsEnums')}
      />
    </div>
  );
}

// ── MatrixTable ──────────────────────────────────────────────────────

function MatrixTable({ matrix, collapsed, onToggle }: MatrixTableProps) {
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
              {matrix.rows.map(row => (
                <tr key={row.id} className="border-b sf-border-default hover:sf-bg-surface-soft">
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
