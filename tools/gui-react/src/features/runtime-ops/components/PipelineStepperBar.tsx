import { memo } from 'react';
import {
  PIPELINE_STEPPER_STAGES,
  cursorToStageIndex,
  cursorSubProgress,
  resolveStageState,
} from '../pipelineStepperRegistry.ts';
import type { StepperStageState } from '../pipelineStepperRegistry.ts';

interface PipelineStepperBarProps {
  phaseCursor: string;
  isRunning: boolean;
  runStatus: string;
  bootProgress?: number;
}

const DOT_CLASS: Record<StepperStageState, string> = {
  pending: 'w-1.5 h-1.5 rounded-full sf-dot-pending transition-all duration-300',
  active: 'w-2 h-2 rounded-full sf-dot-info animate-[sf-stepper-pulse_1.5s_ease-in-out_infinite] transition-all duration-300',
  done: 'w-1.5 h-1.5 rounded-full sf-dot-success transition-all duration-300',
  error: 'w-2 h-2 rounded-full sf-dot-danger transition-all duration-300',
};

const LABEL_CLASS: Record<StepperStageState, string> = {
  pending: 'sf-text-caption sf-text-subtle',
  active: 'sf-text-caption sf-text-primary font-semibold',
  done: 'sf-text-caption sf-text-muted',
  error: 'sf-text-caption sf-status-text-danger font-semibold',
};

const CONNECTOR_CLASS: Record<'done' | 'pending', string> = {
  done: 'flex-1 h-px min-w-2 sf-meter-fill-info rounded-full transition-colors duration-300',
  pending: 'flex-1 h-px min-w-2 sf-meter-track rounded-full transition-colors duration-300',
};

export const PipelineStepperBar = memo(function PipelineStepperBar({
  phaseCursor,
  isRunning,
  runStatus,
  bootProgress,
}: PipelineStepperBarProps) {
  const activeIdx = cursorToStageIndex(phaseCursor);
  const sub = cursorSubProgress(phaseCursor);

  return (
    <div className="flex items-center shrink-0 gap-0.5 max-w-sm">
      {PIPELINE_STEPPER_STAGES.map((stage, i) => {
        const state = resolveStageState(i, activeIdx, isRunning, runStatus);
        const connectorDone = i < activeIdx || runStatus === 'completed';
        const isActive = state === 'active';

        // WHY: Boot stage has fine-grained boot_progress (0-100) from backend.
        // Other stages derive sub-progress from cursor position within the stage.
        const subFraction = isActive
          ? i === 0 && bootProgress != null
            ? bootProgress / 100
            : sub.subTotal > 1
              ? (sub.subPosition + 1) / sub.subTotal
              : 0.5
          : 0;

        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            {i > 0 && (
              <div className={connectorDone ? CONNECTOR_CLASS.done : CONNECTOR_CLASS.pending} />
            )}
            <div className="flex flex-col items-center gap-px px-0.5 min-w-0">
              <div className="flex items-center gap-1">
                <div className={DOT_CLASS[state]} />
                <span className={`${LABEL_CLASS[state]} whitespace-nowrap`}>{stage.label}</span>
              </div>
              {isActive && sub.subTotal > 1 && (
                <div className="w-full h-px sf-meter-track rounded-full overflow-hidden">
                  <div
                    className="h-full sf-meter-fill-info rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.round(subFraction * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
