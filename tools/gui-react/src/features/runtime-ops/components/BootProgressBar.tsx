import { memo } from 'react';

const BOOT_STEP_LABEL: Record<string, string> = {
  config: 'Loading config',
  storage: 'Loading data',
  planner: 'Setting up planner',
  llm: 'Preparing LLM runtime',
  needset: 'Computing field gaps',
};

interface BootProgressBarProps {
  step: string;
  progress: number;
}

export const BootProgressBar = memo(function BootProgressBar({ step, progress }: BootProgressBarProps) {
  const label = BOOT_STEP_LABEL[step] || 'Bootstrapping';
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <div className="flex items-center gap-2" style={{ minWidth: 140 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: 'var(--sf-surface-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb))',
            transition: 'width 300ms ease',
          }}
        />
      </div>
      <span className="sf-text-nano sf-text-muted select-none whitespace-nowrap">
        {label}
      </span>
    </div>
  );
});
