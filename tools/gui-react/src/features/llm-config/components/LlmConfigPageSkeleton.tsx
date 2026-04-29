import { SidebarShellSkeleton } from '../../../shared/ui/navigation/SidebarShellSkeleton.tsx';
import { SettingsPanelLoadingSkeleton } from '../../../shared/ui/feedback/SettingsPanelLoadingSkeleton.tsx';

// WHY: Route-level skeleton for /llm-config. Renders the same SidebarShell
// chrome the loaded page renders (title, ~10 phase nav items, header divider)
// plus the same SettingsPanelLoadingSkeleton the page's inner Suspense uses
// for lazy section loads. Chunk-load → page-mount → section-load is one
// continuous shape: the sidebar nav items hydrate in place, the header
// activates, and the inner settings panel keeps the same skeleton until
// data arrives.
export function LlmConfigPageSkeleton() {
  return (
    <SidebarShellSkeleton title="LLM Configuration" itemCount={10}>
      <SettingsPanelLoadingSkeleton groups={3} rowsPerGroup={3} />
    </SidebarShellSkeleton>
  );
}
