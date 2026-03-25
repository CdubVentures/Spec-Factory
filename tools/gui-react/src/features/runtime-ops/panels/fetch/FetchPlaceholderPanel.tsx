import { StageEmptyState } from '../shared/StageEmptyState.tsx';

export function FetchPlaceholderPanel() {
  return (
    <StageEmptyState
      icon="&#x1F4E1;"
      heading="Fetch Modules"
      description="Fetch stage panels will appear here as they are built. Each panel monitors a specific aspect of the document fetching pipeline."
    />
  );
}
