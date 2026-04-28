import { SkeletonBlock } from './SkeletonBlock.tsx';

interface SettingsPanelLoadingSkeletonProps {
  readonly groups?: number;
  readonly rowsPerGroup?: number;
}

function range(length: number, prefix: string) {
  return Array.from({ length }, (_value, index) => `${prefix}-${index}`);
}

function SettingsRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div
      className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center"
      data-region="settings-loading-row"
      data-skeleton-row={row}
    >
      <div className="space-y-1">
        <SkeletonBlock className="sf-skel-caption" />
        <SkeletonBlock className="sf-skel-bar" />
      </div>
      <div className="sf-input w-full py-2">
        <SkeletonBlock className="sf-skel-bar" />
      </div>
    </div>
  );
}

function SettingsGroupSkeleton({ group, rowsPerGroup }: { readonly group: string; readonly rowsPerGroup: number }) {
  return (
    <section
      className="rounded border px-3 py-2.5 space-y-2.5"
      data-region="settings-loading-group"
      data-skeleton-group={group}
    >
      <div className="flex items-center gap-2">
        <div className="sf-text-label font-semibold uppercase tracking-wide">
          <SkeletonBlock className="sf-skel-caption" />
        </div>
        <div className="h-px flex-1 sf-border-default" />
      </div>
      {range(rowsPerGroup, group).map((row) => (
        <SettingsRowSkeleton key={row} row={row} />
      ))}
    </section>
  );
}

export function SettingsPanelLoadingSkeleton({
  groups = 2,
  rowsPerGroup = 3,
}: SettingsPanelLoadingSkeletonProps) {
  return (
    <div
      className="space-y-4"
      data-testid="settings-panel-loading-skeleton"
      data-region="settings-loading-panel"
      aria-busy="true"
    >
      <span className="sr-only">Loading settings panel</span>
      {range(groups, 'group').map((group) => (
        <SettingsGroupSkeleton key={group} group={group} rowsPerGroup={rowsPerGroup} />
      ))}
    </div>
  );
}
