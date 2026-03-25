import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { ToolBrandHeader } from '../shared/ToolBrandHeader.tsx';
import type { ToolCategory } from '../shared/toolBrandRegistry.ts';

interface FetchPlaceholderPanelProps {
  toolKey?: string;
  toolCategory?: ToolCategory;
}

export function FetchPlaceholderPanel({ toolKey, toolCategory }: FetchPlaceholderPanelProps) {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {toolKey && <ToolBrandHeader tool={toolKey} category={toolCategory} />}
      <StageEmptyState
        icon="&#x1F4E1;"
        heading="Fetch Module"
        description="This panel is under development. It will monitor a specific aspect of the document fetching pipeline."
      />
    </div>
  );
}
