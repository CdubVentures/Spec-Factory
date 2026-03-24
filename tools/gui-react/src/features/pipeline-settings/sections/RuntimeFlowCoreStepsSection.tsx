import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { useStorageSettingsBootstrap } from '../state/storageSettingsAuthority';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { FlowOptionPanel } from '../components/RuntimeFlowPrimitives';

type CoreStepId = 'run-setup' | 'run-output';

interface RuntimeFlowCoreStepsSectionProps {
  activeStep: string;
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  plannerControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  resumeModeOptions: readonly RuntimeDraft['resumeMode'][];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderDisabledHint: (message: string) => ReactNode;
}

const RuntimeFlowRunSetupSection = lazy(async () => {
  const module = await import('./RuntimeFlowRunSetupSection');
  return { default: module.RuntimeFlowRunSetupSection };
});

const RuntimeFlowRunOutputSection = lazy(async () => {
  const module = await import('./RuntimeFlowRunOutputSection');
  return { default: module.RuntimeFlowRunOutputSection };
});

function isCoreStep(activeStep: string): activeStep is CoreStepId {
  return activeStep === 'run-setup' || activeStep === 'run-output';
}

export function RuntimeFlowCoreStepsSection({
  activeStep,
  runtimeDraft,
  runtimeSettingsReady,
  plannerControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  resumeModeOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowCoreStepsSectionProps) {
  const storageBootstrap = useStorageSettingsBootstrap();
  if (!isCoreStep(activeStep)) return null;

  return (
    <div className="space-y-3">
      <FlowOptionPanel
        title={
          activeStep === 'run-output'
            ? 'Runtime Outputs'
            : 'Run Setup'
        }
        subtitle={
          activeStep === 'run-output'
            ? 'Output destinations, provider credentials, and planner/runtime endpoint overrides.'
            : 'Runtime bootstrap profile, discovery, and resume behavior.'
        }
      >
        {activeStep === 'run-setup' ? (
          <Suspense
            fallback={(
              <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                Loading run-setup section...
              </div>
            )}
          >
            <RuntimeFlowRunSetupSection
              runtimeDraft={runtimeDraft}
              runtimeSettingsReady={runtimeSettingsReady}
              plannerControlsLocked={plannerControlsLocked}
              inputCls={inputCls}
              runtimeSubStepDomId={runtimeSubStepDomId}
              resumeModeOptions={resumeModeOptions}
              updateDraft={updateDraft}
              onNumberChange={onNumberChange}
              getNumberBounds={getNumberBounds}
              renderDisabledHint={renderDisabledHint}
            />
          </Suspense>
        ) : null}
        {activeStep === 'run-output' ? (
          <Suspense
            fallback={(
              <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                Loading run-output section...
              </div>
            )}
          >
            <RuntimeFlowRunOutputSection
              runtimeDraft={runtimeDraft}
              runtimeSettingsReady={runtimeSettingsReady}
              inputCls={inputCls}
              runtimeSubStepDomId={runtimeSubStepDomId}
              updateDraft={updateDraft}
              onNumberChange={onNumberChange}
              getNumberBounds={getNumberBounds}
              storageAwsRegion={storageBootstrap.awsRegion}
              storageS3Bucket={storageBootstrap.s3Bucket}
            />
          </Suspense>
        ) : null}
      </FlowOptionPanel>
    </div>
  );
}
