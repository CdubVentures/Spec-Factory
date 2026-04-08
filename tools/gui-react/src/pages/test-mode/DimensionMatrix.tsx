import type { ScenarioDef, ValidationResult } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface DimensionMatrixProps {
  scenarioDefs: ScenarioDef[];
  validationResult: ValidationResult | null;
}

// WHY: Maps scenario names to the validation steps they exercise.
// Derived from scenario naming convention — no separate config needed.
const DIMENSION_COLUMNS = [
  { key: 'shape', label: 'Shape' },
  { key: 'type', label: 'Type' },
  { key: 'unit', label: 'Unit' },
  { key: 'format', label: 'Format' },
  { key: 'enum', label: 'Enum' },
  { key: 'list', label: 'List' },
  { key: 'range', label: 'Range' },
  { key: 'round', label: 'Round' },
  { key: 'cross', label: 'Cross' },
  { key: 'comp', label: 'Comp' },
  { key: 'reject', label: 'Reject' },
  { key: 'repair', label: 'Repair' },
] as const;

type DimKey = typeof DIMENSION_COLUMNS[number]['key'];
type DimCell = { active: boolean; label: string };

// ── Component ────────────────────────────────────────────────────────

export function DimensionMatrix({ scenarioDefs, validationResult }: DimensionMatrixProps) {
  if (scenarioDefs.length === 0) return null;

  const rows = scenarioDefs.map(sd => ({
    name: sd.name,
    id: sd.id,
    dims: deriveDimensions(sd),
    pass: isScenarioPassing(sd.id, validationResult),
  }));

  return (
    <div className="sf-surface-card border sf-border-default rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2.5">
        <span className="text-[13px] font-semibold sf-text-primary">Validation Dimension Coverage</span>
        <span className="text-[10px] sf-text-subtle">Which scenarios exercise which validation steps</span>
      </div>
      <div className="px-4 pb-3 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="sf-text-subtle border-b sf-border-default">
              <th className="text-left py-2 pr-3 font-semibold uppercase tracking-wider text-[9px] min-w-[140px]">
                Scenario
              </th>
              {DIMENSION_COLUMNS.map(col => (
                <th key={col.key} className="py-2 px-1.5 font-semibold uppercase tracking-wider text-[9px] text-center">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b sf-border-default hover:sf-bg-surface-soft">
                <td className="py-1.5 pr-3 font-medium sf-text-primary">{row.name}</td>
                {DIMENSION_COLUMNS.map(col => {
                  const cell = row.dims[col.key];
                  return (
                    <td key={col.key} className="py-1.5 px-1.5 text-center">
                      {cell.active ? (
                        <span className={`inline-flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full text-[9px] font-semibold ${
                          cell.label === '\u2713'
                            ? 'sf-chip-success'
                            : 'sf-chip-warning'
                        }`}>
                          {cell.label}
                        </span>
                      ) : (
                        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] sf-chip-neutral">
                          -
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Dimension derivation ─────────────────────────────────────────────

function deriveDimensions(sd: ScenarioDef): Record<DimKey, DimCell> {
  const n = sd.name;
  const no: DimCell = { active: false, label: '-' };
  const yes: DimCell = { active: true, label: '\u2713' };

  // WHY: Each scenario name encodes which validation dimensions it exercises.
  const isHappy = n === 'happy_path';
  const isShape = n.includes('shape');
  const isType = n.includes('type');
  const isUnit = n.includes('unit');
  const isFormat = n.includes('format');
  const isEnum = n.includes('enum') || n.includes('closed_enum');
  const isList = n.includes('list') || n.includes('dedup');
  const isRange = n.includes('range');
  const isRound = n.includes('round');
  const isCross = n.includes('cross') || n.includes('constraint');
  const isComp = n.includes('component') || n.includes('encoder') || n.includes('sensor') || n.includes('switch') || n.includes('lens');
  const hasReject = isShape || isType || isUnit || isFormat || isEnum || isRange || isRound || isCross || isComp;

  // Repair labels from aiCalls hint or scenario name
  const repairLabel = deriveRepairLabel(sd);

  if (isHappy) {
    return {
      shape: yes, type: yes, unit: yes, format: yes, enum: yes, list: yes,
      range: yes, round: yes, cross: yes, comp: yes,
      reject: { active: true, label: '0' },
      repair: no,
    };
  }

  return {
    shape: isShape ? yes : no,
    type: isType ? yes : no,
    unit: isUnit ? yes : no,
    format: isFormat ? yes : no,
    enum: isEnum ? yes : no,
    list: isList ? yes : no,
    range: isRange ? yes : no,
    round: isRound ? yes : no,
    cross: isCross ? yes : no,
    comp: isComp ? yes : no,
    reject: hasReject || n.includes('missing') || n.includes('variance') || n.includes('preserve') ? yes : no,
    repair: repairLabel ? { active: true, label: repairLabel } : no,
  };
}

function deriveRepairLabel(sd: ScenarioDef): string | null {
  const n = sd.name;
  if (n.includes('shape')) return 'S';
  if (n.includes('type')) return 'P3';
  if (n.includes('unit')) return 'UC';
  if (n.includes('format')) return 'P4';
  if (n.includes('closed_enum') || n.includes('enum_reject')) return 'P1';
  if (n.includes('cross') || n.includes('constraint')) return 'P6';
  if (n.includes('new_') || n.includes('similar_')) return 'P5';
  if (n.includes('open_enum') || n.includes('prefer_known')) return 'P2';
  return null;
}

function isScenarioPassing(id: number, vr: ValidationResult | null): boolean | null {
  if (!vr) return null;
  const checks = vr.results.filter(c => c.testCaseId === id);
  if (checks.length === 0) return null;
  return checks.every(c => c.pass);
}
