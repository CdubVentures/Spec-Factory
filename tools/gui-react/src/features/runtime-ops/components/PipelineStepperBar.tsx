import { memo } from 'react';
import {
  PIPELINE_STEPPER_STAGES,
  cursorToStageIndex,
  resolveStageState,
} from '../pipelineStepperRegistry.ts';
import type { StepperStageState } from '../pipelineStepperRegistry.ts';

interface PipelineStepperBarProps {
  phaseCursor: string;
  isRunning: boolean;
  runStatus: string;
  bootProgress?: number;
}

// WHY: Chip-style step labels with semantic token classes.
// Each state gets a full chip (bg + fg + border) so every stage is always visible.
const STEP_CLASS: Record<StepperStageState, string> = {
  pending: 'sf-chip-neutral rounded-sm text-[10px] leading-tight px-1.5 py-px',
  active: 'sf-chip-info-strong rounded-sm text-[10px] leading-tight px-1.5 py-px font-semibold animate-[sf-stepper-pulse_2s_ease-in-out_infinite]',
  done: 'sf-chip-success rounded-sm text-[10px] leading-tight px-1.5 py-px',
  error: 'sf-chip-danger rounded-sm text-[10px] leading-tight px-1.5 py-px font-semibold',
};

const CONNECTOR_CLASS: Record<'done' | 'pending', string> = {
  done: 'w-3 h-px sf-meter-fill-info rounded-full transition-colors duration-300',
  pending: 'w-3 h-px sf-meter-track rounded-full transition-colors duration-300',
};

const DONE_CHECK = '\u2713';

export const PipelineStepperBar = memo(function PipelineStepperBar({
  phaseCursor,
  isRunning,
  runStatus,
}: PipelineStepperBarProps) {
  const activeIdx = cursorToStageIndex(phaseCursor);

  return (
    <div className="flex items-center shrink-0 gap-1">
      {PIPELINE_STEPPER_STAGES.map((stage, i) => {
        const state = resolveStageState(i, activeIdx, isRunning, runStatus);
        const connectorDone = i < activeIdx || runStatus === 'completed';
        const isDone = state === 'done';

        return (
          <div key={stage.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={connectorDone ? CONNECTOR_CLASS.done : CONNECTOR_CLASS.pending} />
            )}
            <span className={STEP_CLASS[state]}>
              {isDone ? `${DONE_CHECK} ${stage.label}` : stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
