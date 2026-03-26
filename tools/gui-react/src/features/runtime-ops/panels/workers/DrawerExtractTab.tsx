import { useMemo } from 'react';
import type { WorkerExtractionField, ExtractionPluginEvent } from '../../types.ts';
import { EXTRACTION_STAGE_KEYS, EXTRACTION_STAGE_META } from '../extraction/extractionStageKeys.generated.ts';

interface DrawerExtractTabProps {
  fields: WorkerExtractionField[];
  extractionPlugins: ExtractionPluginEvent[];
  workerState: string;
}

type PluginStatus = 'pending' | 'completed' | 'failed';

const STATUS_BADGE: Record<PluginStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'sf-chip-neutral' },
  completed: { label: 'Done', className: 'sf-chip-success' },
  failed: { label: 'Failed', className: 'sf-chip-danger' },
};

function pluginLabel(name: string): string {
  const meta = (EXTRACTION_STAGE_META as Record<string, { label: string }>)[name];
  return meta?.label ?? name;
}

export function DrawerExtractTab({ fields, extractionPlugins, workerState }: DrawerExtractTabProps) {
  // WHY: Derive per-plugin status from events. Multiple events per plugin
  // (one per URL) are rolled up — if any failed, show failed; else completed.
  const pluginStatusMap = useMemo(() => {
    const map = new Map<string, PluginStatus>();

    // Seed with registered stage keys so they always appear
    for (const key of EXTRACTION_STAGE_KEYS) {
      map.set(key, 'pending');
    }

    // Apply actual events (last-write-wins per plugin, failed overrides completed)
    for (const evt of extractionPlugins) {
      const current = map.get(evt.plugin);
      if (evt.status === 'failed' || current !== 'failed') {
        map.set(evt.plugin, evt.status);
      }
    }

    // If worker is done and plugin is still pending → mark failed (never ran)
    if (workerState !== 'running' && workerState !== 'stuck' && workerState !== 'queued') {
      for (const [key, status] of map) {
        if (status === 'pending') map.set(key, 'failed');
      }
    }

    return map;
  }, [extractionPlugins, workerState]);

  const isWorkerActive = workerState === 'running' || workerState === 'stuck';

  return (
    <div className="space-y-3">
      {/* Extraction plugin status */}
      <div className="sf-surface-elevated overflow-hidden rounded">
        {Array.from(pluginStatusMap.entries()).map(([name, status], i) => {
          const badge = STATUS_BADGE[status];
          return (
            <div
              key={name}
              className={`flex items-center justify-between px-3 py-2 text-xs ${i > 0 ? 'border-t sf-border-soft' : ''}`}
            >
              <span className="font-medium sf-text-primary">{pluginLabel(name)}</span>
              <span className={`px-2 py-0.5 rounded font-medium ${badge.className}`}>
                {isWorkerActive && status === 'pending' ? 'Running...' : badge.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Field summary */}
      {fields.length > 0 && (
        <>
          <div className="text-xs sf-text-muted">{fields.length} field{fields.length !== 1 ? 's' : ''} extracted</div>
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
        </>
      )}
    </div>
  );
}
