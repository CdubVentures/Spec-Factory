import type { ComponentType } from 'react';
import { RuntimeFlowStepIcon } from './RuntimeFlowStepIcon';
import type { RuntimeStepId } from './RuntimeFlowStepIcon';

interface RuntimeStepDetail {
  id: RuntimeStepId;
  label: string;
  tip: string;
}

interface RuntimeSubStep {
  id: string;
  label: string;
  tip: string;
}

interface TipProps {
  text: string;
}

interface RuntimeFlowStepDetailHeaderProps {
  activeStep: RuntimeStepId;
  activeRuntimeStep: RuntimeStepDetail;
  activeRuntimeSubSteps: readonly RuntimeSubStep[];
  runtimeSettingsReady: boolean;
  onRuntimeSubStepClick: (subStepId: string) => void;
  TipComponent: ComponentType<TipProps>;
}

export function RuntimeFlowStepDetailHeader({
  activeStep,
  activeRuntimeStep,
  activeRuntimeSubSteps,
  runtimeSettingsReady,
  onRuntimeSubStepClick,
  TipComponent,
}: RuntimeFlowStepDetailHeaderProps) {
  return (
    <>
      <header className="rounded sf-surface-elevated px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <RuntimeFlowStepIcon
              id={activeRuntimeStep.id}
              active
              enabled
            />
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
                {activeRuntimeStep.label}
              </div>
              <div className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                {activeRuntimeStep.tip}
              </div>
            </div>
          </div>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: 'rgb(var(--sf-color-accent-rgb))',
            }}
          />
        </div>
      </header>
      {activeRuntimeSubSteps.length > 1 ? (
        <aside className="rounded sf-surface-elevated p-2.5 sm:p-3">
          <div className="mb-2 inline-flex items-center gap-1 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
            Runtime Sections
            <TipComponent text="Sub-step shortcuts for the selected main runtime step." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeRuntimeSubSteps.map((subStep) => (
              <button
                key={`${activeStep}:substep:${subStep.id}`}
                type="button"
                data-runtime-substep={subStep.id}
                onClick={() => onRuntimeSubStepClick(subStep.id)}
                disabled={!runtimeSettingsReady}
                className="inline-flex items-center gap-1 rounded sf-nav-item px-2 py-1.5 sf-text-label font-semibold disabled:opacity-60"
              >
                <span>{subStep.label}</span>
                <TipComponent text={subStep.tip} />
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </>
  );
}
