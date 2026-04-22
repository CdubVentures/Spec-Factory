import { useMemo } from 'react';
import type { WorkerExtractionField, ExtractionPluginEvent } from '../../types.ts';
import { EXTRACTION_STAGE_KEYS, EXTRACTION_STAGE_META } from '../extraction/extractionStageKeys.generated.ts';

interface DrawerExtractTabProps {
  fields: WorkerExtractionField[];
  extractionPlugins: ExtractionPluginEvent[];
  workerState: string;
  brightDataUnlocked?: boolean;
}

type PluginStatus = 'pending' | 'completed' | 'failed' | 'n_a';

const STATUS_BADGE: Record<PluginStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'sf-chip-neutral' },
  completed: { label: 'Success', className: 'sf-chip-success' },
  failed: { label: 'Failed', className: 'sf-chip-danger' },
  n_a: { label: 'API mode', className: 'sf-chip-accent' },
};

function pluginLabel(name: string): string {
  const meta = (EXTRACTION_STAGE_META as Record<string, { label: string }>)[name];
  return meta?.label ?? name;
}

export function DrawerExtractTab({ fields, extractionPlugins, workerState, brightDataUnlocked }: DrawerExtractTabProps) {
  // WHY: Plugin events are the ONLY source of truth for execution status.
  // extraction_plugin_completed → Success. extraction_plugin_failed → Failed.
  // No event → Pending. We do NOT guess from worker state.
  const pluginStatusMap = useMemo(() => {
    const map = new Map<string, PluginStatus>();

    // Seed with registered stage keys so they always appear
    for (const key of EXTRACTION_STAGE_KEYS) {
      map.set(key, 'pending');
    }

    // Apply actual plugin events — failed overrides completed (sticky failure)
    for (const evt of extractionPlugins) {
      const current = map.get(evt.plugin);
      if (current === 'failed') continue;
      map.set(evt.plugin, evt.status === 'failed' ? 'failed' : 'completed');
    }

    // WHY: BrightData API unlock succeeded without a browser session, so
    // screenshot/video plugins never ran and can never produce artifacts.
    // Flip remaining 'pending' stages to 'n_a' so users don't think the
    // run is still in progress.
    if (brightDataUnlocked) {
      for (const [key, status] of map.entries()) {
        if (status === 'pending') map.set(key, 'n_a');
      }
    }

    return map;
  }, [extractionPlugins, brightDataUnlocked]);

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
                {badge.label}
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
