import { useMemo } from 'react';
import type { WorkerDetailResponse, PhaseStats } from '../../types.ts';
import { methodBadgeClass, friendlyMethod } from '../../helpers.ts';
import { ConfidenceBar } from '../../components/ConfidenceBar.tsx';
import {
  PHASE_REGISTRY,
  CROSS_CUTTING_METHODS,
  computePhaseLineage,
  normalizePhaseLineagePhases,
} from '../../selectors/phaseLineageHelpers.ts';

interface DrawerPipelineTabProps {
  data: WorkerDetailResponse | undefined;
}

function phaseStatusClass(phase: PhaseStats): string {
  if (phase.field_count > 0) return 'sf-chip-success';
  if (phase.doc_count > 0) return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

function phaseStatusLabel(phase: PhaseStats): string {
  if (phase.field_count > 0) return 'active';
  if (phase.doc_count > 0) return 'docs-only';
  return 'inactive';
}

export function DrawerPipelineTab({ data }: DrawerPipelineTabProps) {
  const phases = useMemo((): PhaseStats[] => {
    if (data?.phase_lineage?.phases) return normalizePhaseLineagePhases(data.phase_lineage.phases);
    return normalizePhaseLineagePhases(computePhaseLineage(data?.extraction_fields ?? [], data?.documents ?? []));
  }, [data]);

  const summary = useMemo(() => {
    const parsingPhases = phases.filter((p) => p.phase_id !== 'cross_cutting');
    const activeCount = parsingPhases.filter((phase) => phase.field_count > 0 || phase.doc_count > 0).length;
    const allMethods = new Set<string>();
    for (const p of phases) {
      for (const m of p.methods_used) allMethods.add(m);
    }
    const totalMethods = PHASE_REGISTRY.reduce((s, pr) => s + pr.methods.length, 0) + CROSS_CUTTING_METHODS.length;
    let dominant: PhaseStats | null = null;
    for (const p of parsingPhases) {
      if (!dominant || p.field_count > dominant.field_count) dominant = p;
    }
    return { activeCount, observedMethods: allMethods.size, totalMethods, dominant };
  }, [phases]);

  const parsingPhases = phases.filter((p) => p.phase_id !== 'cross_cutting');
  const crossCutting = phases.find((p) => p.phase_id === 'cross_cutting');

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="sf-surface-elevated p-2 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="sf-text-subtle">
            <span className="font-mono sf-text-primary">{summary.activeCount}</span> / 10 phases used
          </span>
          <span className="sf-text-subtle">
            <span className="font-mono sf-text-primary">{summary.observedMethods}</span> / {summary.totalMethods} methods
          </span>
        </div>
        {summary.dominant && summary.dominant.field_count > 0 && (
          <div className="sf-text-muted">
            Dominant: <span className="sf-chip-success px-1 py-0.5 rounded">{summary.dominant.phase_label}</span>
          </div>
        )}
      </div>

      {/* Phase cards */}
      <div className="space-y-2">
        {parsingPhases.map((phase, idx) => {
          const phaseDef = PHASE_REGISTRY[idx];
          const phaseNum = String(idx + 1).padStart(2, '0');
          return (
            <div key={phase.phase_id} className="sf-surface-elevated rounded p-2 text-xs space-y-1.5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="sf-chip-neutral px-1.5 py-0.5 rounded font-mono font-medium">P{phaseNum}</span>
                <span className="sf-text-primary font-medium flex-1">{phase.phase_label}</span>
                <span className={`px-1.5 py-0.5 rounded ${phaseStatusClass(phase)}`}>{phaseStatusLabel(phase)}</span>
              </div>

              {/* Counts */}
              <div className="flex gap-3">
                <span className={phase.doc_count > 0 ? 'sf-text-primary font-mono' : 'sf-text-muted font-mono'}>
                  {phase.doc_count} docs
                </span>
                <span className={phase.field_count > 0 ? 'sf-text-primary font-mono' : 'sf-text-muted font-mono'}>
                  {phase.field_count} fields
                </span>
              </div>

              {/* Methods */}
              {phaseDef && (
                <div className="flex gap-1 flex-wrap">
                  {phaseDef.methods.map((m) => {
                    const observed = phase.methods_used.includes(m);
                    return (
                      <span
                        key={m}
                        className={`px-1 py-0.5 rounded ${methodBadgeClass(m)} ${observed ? '' : 'opacity-40'}`}
                      >
                        {friendlyMethod(m)}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Confidence */}
              {phase.field_count > 0 && (
                <ConfidenceBar value={phase.confidence_avg} />
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-cutting section */}
      {crossCutting && (
        <div className="space-y-2">
          <div className="sf-text-subtle font-medium text-xs px-1">Post-Processing Methods</div>
          <div className="sf-surface-elevated rounded p-2 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="sf-chip-neutral px-1.5 py-0.5 rounded font-mono font-medium">PP</span>
              <span className="sf-text-primary font-medium flex-1">{crossCutting.phase_label}</span>
              <span className={`px-1.5 py-0.5 rounded ${phaseStatusClass(crossCutting)}`}>{phaseStatusLabel(crossCutting)}</span>
            </div>
            <div className="flex gap-3">
              <span className={crossCutting.doc_count > 0 ? 'sf-text-primary font-mono' : 'sf-text-muted font-mono'}>
                {crossCutting.doc_count} docs
              </span>
              <span className={crossCutting.field_count > 0 ? 'sf-text-primary font-mono' : 'sf-text-muted font-mono'}>
                {crossCutting.field_count} fields
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {CROSS_CUTTING_METHODS.map((m) => {
                const observed = crossCutting.methods_used.includes(m);
                return (
                  <span
                    key={m}
                    className={`px-1 py-0.5 rounded ${methodBadgeClass(m)} ${observed ? '' : 'opacity-40'}`}
                  >
                    {friendlyMethod(m)}
                  </span>
                );
              })}
            </div>
            {crossCutting.field_count > 0 && <ConfidenceBar value={crossCutting.confidence_avg} />}
          </div>
        </div>
      )}
    </div>
  );
}
