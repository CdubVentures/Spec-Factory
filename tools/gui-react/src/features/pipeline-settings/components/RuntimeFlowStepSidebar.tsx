import type { ComponentType } from 'react';
import { RuntimeFlowStepIcon } from './RuntimeFlowStepIcon';
import type { RuntimeStepId } from './RuntimeFlowStepIcon';

interface RuntimeStepEntry {
  id: RuntimeStepId;
  label: string;
  tip: string;
}

interface TipProps {
  text: string;
}

interface RuntimeFlowStepSidebarProps {
  runtimeSteps: readonly RuntimeStepEntry[];
  activeStep: RuntimeStepId;
  stepEnabled: Record<RuntimeStepId, boolean>;
  runtimeSettingsReady: boolean;
  onSelectStep: (stepId: RuntimeStepId) => void;
  TipComponent: ComponentType<TipProps>;
}

export function RuntimeFlowStepSidebar({
  runtimeSteps,
  activeStep,
  stepEnabled,
  runtimeSettingsReady,
  onSelectStep,
  TipComponent,
}: RuntimeFlowStepSidebarProps) {
  return (
    <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
      <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
        Runtime Flow
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
        {runtimeSteps.map((step) => {
          const isActive = activeStep === step.id;
          const enabled = stepEnabled[step.id];
          return (
            <button
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              disabled={!runtimeSettingsReady}
              className={`group w-full sf-nav-item px-2.5 py-2.5 text-left ${
                isActive
                  ? 'sf-nav-item-active'
                  : enabled
                    ? ''
                    : 'sf-nav-item-muted'
              } disabled:opacity-60`}
            >
              <div className="flex items-start gap-2">
                <RuntimeFlowStepIcon id={step.id} active={isActive} enabled={enabled} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1 sf-text-label font-semibold leading-5">
                      {step.label}
                      <TipComponent text={step.tip} />
                    </div>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: isActive
                          ? 'rgb(var(--sf-color-accent-rgb))'
                          : 'rgb(var(--sf-color-border-subtle-rgb) / 0.7)',
                      }}
                      title={isActive ? 'Selected step' : enabled ? 'Enabled by master toggle' : 'Disabled by master toggle'}
                    />
                  </div>
                  <div className="mt-0.5 sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
                    {step.tip}
                  </div>
                  <span
                    className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 sf-text-label font-semibold leading-4 ${
                      enabled ? 'sf-callout sf-callout-success' : 'sf-callout sf-callout-neutral'
                    }`}
                  >
                    {enabled ? 'Enabled' : 'Disabled by master toggle'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
