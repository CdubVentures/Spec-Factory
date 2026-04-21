import { memo } from 'react';
import { SettingRow } from '../../pipeline-settings/index.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';

export interface AxisPointTableProps {
  rowKeys: readonly string[];
  values: Readonly<Record<string, number>>;
  onRowChange: (rowKey: string, value: number) => void;
  rowLabel?: (rowKey: string) => string;
  rowTip?: (rowKey: string) => string | undefined;
  min?: number;
  max?: number;
}

function defaultLabel(rowKey: string): string {
  return rowKey.replace(/_/g, ' ');
}

export const AxisPointTable = memo(function AxisPointTable({
  rowKeys,
  values,
  onRowChange,
  rowLabel = defaultLabel,
  rowTip,
  min = 0,
  max = 99,
}: AxisPointTableProps) {
  return (
    <>
      {rowKeys.map((key) => (
        <SettingRow key={key} label={rowLabel(key)} tip={rowTip?.(key) ?? ''}>
          <NumberStepper
            value={String(values[key] ?? 0)}
            onChange={(next) => {
              const parsed = Number(next);
              if (Number.isFinite(parsed)) onRowChange(key, Math.trunc(parsed));
            }}
            min={min}
            max={max}
            step={1}
            ariaLabel={`${rowLabel(key)} points`}
            className="w-28"
          />
        </SettingRow>
      ))}
    </>
  );
});
