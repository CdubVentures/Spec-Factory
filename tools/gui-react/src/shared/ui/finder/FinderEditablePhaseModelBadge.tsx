import { FinderRunModelBadge } from './FinderRunModelBadge.tsx';
import { FinderModelPickerPopover } from './FinderModelPickerPopover.tsx';
import { useResolvedFinderModel } from './useResolvedFinderModel.ts';
import type { LlmOverridePhaseId } from '../../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';

export interface FinderEditablePhaseModelBadgeProps {
  readonly phaseId: LlmOverridePhaseId;
  readonly labelPrefix: string;
  readonly title: string;
  readonly showAccessModeText?: boolean;
}

export function FinderEditablePhaseModelBadge({
  phaseId,
  labelPrefix,
  title,
  showAccessModeText,
}: FinderEditablePhaseModelBadgeProps) {
  const { modelDisplay, accessMode, effortLevel, model } = useResolvedFinderModel(phaseId);
  const badge = (
    <FinderRunModelBadge
      labelPrefix={labelPrefix}
      model={modelDisplay}
      accessMode={accessMode}
      thinking={model?.thinking ?? false}
      webSearch={model?.webSearch ?? false}
      effortLevel={effortLevel}
      showAccessModeText={showAccessModeText}
    />
  );
  return (
    <FinderModelPickerPopover
      binding="phase"
      phaseId={phaseId}
      title={title}
      trigger={badge}
    />
  );
}

