import { StageEmptyState } from '../shared/StageEmptyState.tsx';

export function ExtractionPlaceholderPanel() {
  return (
    <StageEmptyState
      icon="&#x1F50D;"
      heading="Extraction Modules"
      description="Extraction stage panels will appear here as they are built. Each panel monitors a specific aspect of the data extraction pipeline."
    />
  );
}
