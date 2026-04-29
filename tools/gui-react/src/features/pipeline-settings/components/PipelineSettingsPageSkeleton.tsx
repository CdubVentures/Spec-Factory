import { SidebarShellSkeleton } from '../../../shared/ui/navigation/SidebarShellSkeleton.tsx';
import { SettingsPanelLoadingSkeleton } from '../../../shared/ui/feedback/SettingsPanelLoadingSkeleton.tsx';

// WHY: Route-level skeleton for /pipeline-settings. Same shell chrome as the
// loaded page (sidebar with ~8 section nav items, header divider) and the
// same SettingsPanelLoadingSkeleton the page's inner Suspense fires while
// the active section's lazy chunk loads. Chunk-load → page-mount → section
// is a single continuous shape.
export function PipelineSettingsPageSkeleton() {
  return (
    <SidebarShellSkeleton title="Pipeline Settings" itemCount={8}>
      <SettingsPanelLoadingSkeleton groups={3} rowsPerGroup={3} />
    </SidebarShellSkeleton>
  );
}
