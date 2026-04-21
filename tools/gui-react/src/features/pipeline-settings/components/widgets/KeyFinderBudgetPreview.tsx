import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

const DIFFICULTY_ROWS = ['easy', 'medium', 'hard', 'very_hard'] as const;
const DIFFICULTY_LABELS: Record<(typeof DIFFICULTY_ROWS)[number], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  very_hard: 'Very hard',
};

const AVAILABILITY_COLS = ['always', 'sometimes', 'rare'] as const;
const AVAILABILITY_LABELS: Record<(typeof AVAILABILITY_COLS)[number], string> = {
  always: 'Always',
  sometimes: 'Sometimes',
  rare: 'Rare',
};

function parseMap(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) out[k] = Math.round(n);
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function parseInt32(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

interface BudgetMatrixProps {
  title: string;
  requiredPts: number;
  availabilityMap: Record<string, number>;
  difficultyMap: Record<string, number>;
  floor: number;
}

function BudgetMatrix({ title, requiredPts, availabilityMap, difficultyMap, floor }: BudgetMatrixProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="sf-text-caption sf-text-primary"
        style={{ fontWeight: 600, marginBottom: '0.25rem' }}
      >
        {title}
      </div>
      <table
        style={{
          borderCollapse: 'collapse',
          fontSize: '0.75rem',
          border: '1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.42)',
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                padding: '3px 6px',
                textAlign: 'left',
                borderBottom: '1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.42)',
                background: 'rgb(var(--sf-color-text-primary-rgb) / 0.04)',
                fontWeight: 500,
              }}
              className="sf-text-muted"
            />
            {AVAILABILITY_COLS.map((col) => (
              <th
                key={col}
                style={{
                  padding: '3px 10px',
                  textAlign: 'center',
                  borderBottom: '1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.42)',
                  background: 'rgb(var(--sf-color-text-primary-rgb) / 0.04)',
                  fontWeight: 500,
                }}
                className="sf-text-muted"
              >
                {AVAILABILITY_LABELS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIFFICULTY_ROWS.map((row) => (
            <tr key={row}>
              <td
                style={{
                  padding: '3px 10px 3px 6px',
                  borderBottom: '1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.28)',
                  whiteSpace: 'nowrap',
                }}
                className="sf-text-primary"
              >
                {DIFFICULTY_LABELS[row]}
              </td>
              {AVAILABILITY_COLS.map((col) => {
                const diffPts = difficultyMap[row] ?? 0;
                const availPts = availabilityMap[col] ?? 0;
                const sum = requiredPts + availPts + diffPts;
                const flooredAt = floor > sum;
                const budget = Math.max(floor, sum);
                return (
                  <td
                    key={col}
                    style={{
                      padding: '3px 10px',
                      textAlign: 'center',
                      borderBottom: '1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.28)',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                      color: flooredAt
                        ? 'rgb(var(--sf-color-text-muted-rgb))'
                        : 'rgb(var(--sf-color-text-primary-rgb))',
                    }}
                    title={
                      flooredAt
                        ? `${sum} points (clamped to floor ${floor})`
                        : `${requiredPts} + ${availPts} + ${diffPts} = ${budget}`
                    }
                  >
                    {budget}
                    {flooredAt ? '*' : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyFinderBudgetPreview({ allSettings }: FinderSettingWidgetProps) {
  const required = parseMap(allSettings.budgetRequiredPoints);
  const availability = parseMap(allSettings.budgetAvailabilityPoints);
  const difficulty = parseMap(allSettings.budgetDifficultyPoints);
  const floor = parseInt32(allSettings.budgetFloor, 0);

  const mandatoryPts = required.mandatory ?? 0;
  const nonMandatoryPts = required.non_mandatory ?? 0;

  return (
    <div>
      <div
        className="sf-text-caption sf-text-muted"
        style={{ marginBottom: '0.5rem', lineHeight: 1.35 }}
      >
        Live budget per difficulty × availability (one-variant product).
        Values marked <code>*</code> are clamped by the floor.
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <BudgetMatrix
          title="Mandatory"
          requiredPts={mandatoryPts}
          availabilityMap={availability}
          difficultyMap={difficulty}
          floor={floor}
        />
        <BudgetMatrix
          title="Non-mandatory"
          requiredPts={nonMandatoryPts}
          availabilityMap={availability}
          difficultyMap={difficulty}
          floor={floor}
        />
      </div>
    </div>
  );
}
