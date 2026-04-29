import { SkeletonBlock } from './SkeletonBlock.tsx';

interface SettingsPanelLoadingSkeletonProps {
  readonly groups?: number;
  readonly rowsPerGroup?: number;
}

const CONTROL_KINDS = ['input', 'toggle', 'select', 'slider'] as const;
type ControlKind = (typeof CONTROL_KINDS)[number];

function range(length: number, prefix: string) {
  return Array.from({ length }, (_value, index) => `${prefix}-${index}`);
}

function ControlSkeleton({ kind }: { readonly kind: ControlKind }) {
  if (kind === 'input') {
    return <div className="sf-input sf-shimmer w-full h-9" aria-hidden="true" />;
  }
  if (kind === 'toggle') {
    return (
      <div className="inline-flex w-full items-center justify-between sf-switch sf-switch-off px-2.5 py-1.5">
        <span className="sf-shimmer inline-block h-3.5 w-16 rounded-sm" aria-hidden="true" />
        <span
          className="sf-shimmer relative inline-flex h-5 w-9 items-center rounded-full sf-switch-track"
          aria-hidden="true"
        />
      </div>
    );
  }
  if (kind === 'select') {
    return (
      <div className="sf-input sf-shimmer w-full h-9 inline-flex items-center justify-between" aria-hidden="true" />
    );
  }
  return (
    <div className="flex items-center gap-2 h-9" aria-hidden="true">
      <span className="sf-shimmer flex-1 h-1.5 rounded-full" />
      <span className="sf-shimmer inline-block h-4 w-10 rounded-sm shrink-0" />
    </div>
  );
}

function SettingsRowSkeleton({ row, kind }: { readonly row: string; readonly kind: ControlKind }) {
  return (
    <div
      className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center"
      data-region="settings-loading-row"
      data-skeleton-row={row}
      data-skeleton-control={kind}
    >
      <div className="space-y-1">
        <SkeletonBlock className="sf-skel-bar-label" />
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <ControlSkeleton kind={kind} />
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
          <SkeletonBlock className="sf-skel-bar-label" />
        </div>
        <div className="h-px flex-1 sf-border-default" />
      </div>
      {range(rowsPerGroup, group).map((row, index) => (
        <SettingsRowSkeleton key={row} row={row} kind={CONTROL_KINDS[index % CONTROL_KINDS.length]} />
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
