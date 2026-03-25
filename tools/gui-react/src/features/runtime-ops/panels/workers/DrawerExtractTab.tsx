import type { WorkerExtractionField } from '../../types.ts';

interface DrawerExtractTabProps {
  fields: WorkerExtractionField[];
  workerState: string;
}

type ExtractionStatus = 'pending' | 'extracting' | 'done' | 'failed';

function deriveStatus(workerState: string, fieldCount: number): ExtractionStatus {
  if (workerState === 'running' || workerState === 'stuck') {
    return fieldCount > 0 ? 'extracting' : 'pending';
  }
  return fieldCount > 0 ? 'done' : 'failed';
}

const STATUS_BADGE: Record<ExtractionStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'sf-chip-neutral' },
  extracting: { label: 'Extracting', className: 'sf-chip-info' },
  done: { label: 'Done', className: 'sf-chip-success' },
  failed: { label: 'No Fields', className: 'sf-chip-danger' },
};

export function DrawerExtractTab({ fields, workerState }: DrawerExtractTabProps) {
  const status = deriveStatus(workerState, fields.length);
  const badge = STATUS_BADGE[status];

  return (
    <div className="space-y-3">
      {/* Status summary */}
      <div className="sf-surface-elevated p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className={`px-2 py-1 rounded font-medium ${badge.className}`}>{badge.label}</span>
          <span className="sf-text-muted font-mono">{fields.length} fields</span>
        </div>
        {status === 'pending' && (
          <div className="sf-text-subtle">Waiting for extraction to begin...</div>
        )}
        {status === 'extracting' && (
          <div className="sf-text-subtle">Extraction in progress...</div>
        )}
      </div>

      {/* Field list — simple name + value */}
      {fields.length > 0 && (
        <div className="sf-surface-elevated overflow-hidden rounded">
          {fields.map((f, i) => (
            <div
              key={`${f.field}-${i}`}
              className={`flex items-center justify-between px-3 py-1.5 text-xs ${i > 0 ? 'border-t sf-border-soft' : ''}`}
            >
              <span className="font-mono font-medium sf-text-primary">{f.field}</span>
              <span className="font-mono sf-text-muted truncate max-w-[14rem] text-right" title={f.value ?? undefined}>
                {f.value ?? '\u2013'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
