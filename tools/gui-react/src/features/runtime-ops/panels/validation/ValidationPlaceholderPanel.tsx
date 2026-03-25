import { StageEmptyState } from '../shared/StageEmptyState.tsx';

export function ValidationPlaceholderPanel() {
  return (
    <StageEmptyState
      icon="&#x2705;"
      heading="Validation Modules"
      description="Validation stage panels will appear here as they are built. Each panel monitors schema enforcement and quality gates."
    />
  );
}
