import { memo, useState, useEffect } from 'react';
import {
  PIPELINE_STEPPER_STAGES,
  cursorToStageIndex,
  resolveStageState,
} from '../pipelineStepperRegistry.ts';
import type { StepperStageState } from '../pipelineStepperRegistry.ts';
import { parseBackendMs } from '../../../utils/dateTime.ts';

interface PipelineStepperBarProps {
  stageCursor: string;
  isRunning: boolean;
  runStatus: string;
  bootProgress?: number;
  startedAt?: string;
  endedAt?: string;
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

function formatElapsed(ms: number): string {
  if (ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function ElapsedTimer({ startedAt, endedAt, isRunning }: { startedAt: string; endedAt?: string; isRunning: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const startMs = parseBackendMs(startedAt);
  if (!Number.isFinite(startMs)) return null;

  const endMs = endedAt ? parseBackendMs(endedAt) : 0;
  const elapsed = (Number.isFinite(endMs) && endMs > startMs ? endMs : now) - startMs;

  return (
    <span className="sf-text-caption sf-text-muted font-mono tabular-nums whitespace-nowrap">
      {formatElapsed(elapsed)}
    </span>
  );
}

export const PipelineStepperBar = memo(function PipelineStepperBar({
  stageCursor,
  isRunning,
  runStatus,
  startedAt,
  endedAt,
}: PipelineStepperBarProps) {
  const activeIdx = cursorToStageIndex(stageCursor);

  return (
    <div className="flex items-center shrink-0 gap-1.5">
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
      {startedAt && (
        <>
          <div className="w-px h-3 sf-border-default border-l" />
          <ElapsedTimer startedAt={startedAt} endedAt={endedAt} isRunning={isRunning} />
        </>
      )}
    </div>
  );
});
