import type { ColorMatrix } from '../utils/buildColorMatrix.ts';
import { ColorCard } from './ColorCard.tsx';
import { EmptyColorSlot } from './EmptyColorSlot.tsx';

interface ColorMatrixViewProps {
  readonly matrix: ColorMatrix;
  readonly onAddColor: (name: string, hex: string) => void;
  readonly onUpdateHex: (name: string, hex: string) => void;
  readonly onDelete: (name: string) => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ColorMatrixView({
  matrix,
  onAddColor,
  onUpdateHex,
  onDelete,
}: ColorMatrixViewProps) {
  const columnKeys = ['base', ...matrix.prefixes];

  return (
    <div className="sf-surface-elevated rounded border sf-border-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b-[1.5px] border-[var(--sf-token-text-primary)]">
              {columnKeys.map((key) => (
                <th
                  key={key}
                  className="text-left px-4 py-3 text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary whitespace-nowrap"
                >
                  {key === 'base' ? 'Base Colors' : capitalize(key)}
                  <span className="ml-2 text-[10px] font-normal sf-text-subtle">
                    {matrix.rows.filter((r) => r.cells[key] !== null).length}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => {
              const baseEntry = row.cells['base'];
              const baseHex = baseEntry?.hex ?? '#808080';

              return (
                <tr key={row.baseName} className="border-b sf-border-soft last:border-b-0">
                  {columnKeys.map((key) => {
                    const entry = row.cells[key];
                    const variantName = key === 'base' ? row.baseName : `${key}-${row.baseName}`;

                    return (
                      <td key={key} className="align-top p-0">
                        {entry ? (
                          <ColorCard
                            entry={entry}
                            onUpdateHex={onUpdateHex}
                            onDelete={onDelete}
                          />
                        ) : (
                          <EmptyColorSlot
                            colorName={variantName}
                            defaultHex={baseHex}
                            onAdd={onAddColor}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {matrix.rows.length === 0 && (
        <p className="text-center sf-text-subtle text-sm py-8">
          No colors to display
        </p>
      )}
    </div>
  );
}
