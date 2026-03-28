import { memo } from 'react';

// WHY: Maps phase_cursor values to macro stage index.
// Stages: 0=Boot, 1=Plan, 2=Search, 3=Fetch, 4=Extract
const STAGE_DEFS = [
  { label: 'Boot', color: '#7c3aed' },
  { label: 'Plan', color: '#3b82f6' },
  { label: 'Search', color: '#0ea5e9' },
  { label: 'Fetch', color: '#10b981' },
  { label: 'Extract', color: '#f97316' },
] as const;

function cursorToStageIndex(cursor: string): number {
  if (!cursor || cursor === 'phase_00_bootstrap') return 0;
  if (cursor.startsWith('phase_01') || cursor.startsWith('phase_02')) return 1;
  if (cursor.startsWith('phase_03') || cursor.startsWith('phase_04') || cursor.startsWith('phase_05')) return 1;
  if (cursor.includes('search') || cursor.includes('query')) return 2;
  if (cursor.includes('serp') || cursor.includes('domain') || cursor.includes('prime')) return 2;
  if (cursor.startsWith('phase_06') || cursor.startsWith('phase_07')) return 2;
  if (cursor.includes('crawl') || cursor.includes('fetch') || cursor === 'phase_09_crawl') return 3;
  if (cursor.includes('extract') || cursor.includes('index')) return 4;
  return 1;
}

interface StageStepperBarProps {
  phaseCursor: string;
  isRunning: boolean;
  isCompleted?: boolean;
}

export const StageStepperBar = memo(function StageStepperBar({ phaseCursor, isRunning, isCompleted }: StageStepperBarProps) {
  const activeIdx = isCompleted ? STAGE_DEFS.length : cursorToStageIndex(phaseCursor);

  return (
    <div className="flex items-center shrink-0" style={{ width: 140 }}>
      {STAGE_DEFS.map((stage, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx && isRunning;
        const isPending = i > activeIdx || (!isRunning && i === activeIdx && !isCompleted);

        return (
          <div key={stage.label} className="flex items-center" style={{ flex: i < STAGE_DEFS.length - 1 ? 1 : 0 }}>
            <div
              style={{
                width: isActive ? 10 : 8,
                height: isActive ? 10 : 8,
                borderRadius: '50%',
                background: stage.color,
                opacity: isPending ? 0.12 : isDone ? 0.85 : 1,
                flexShrink: 0,
                boxShadow: isActive ? `0 0 0 4px ${stage.color}30, 0 0 8px ${stage.color}40` : 'none',
                animation: isActive ? 'sf-stepper-pulse 1.5s ease-in-out infinite' : 'none',
                transition: 'width 0.3s, height 0.3s, opacity 0.3s, box-shadow 0.3s',
              }}
              title={stage.label}
            />
            {i < STAGE_DEFS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  margin: '0 2px',
                  background: isDone ? '#d1d5db' : '#eef0f4',
                  transition: 'background 0.3s',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
