import type { ReactNode } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { btnPrimary, btnSecondary, sectionCls, actionBtnWidth } from '../../../shared/ui/buttonClasses.ts';
import { inputCls, labelCls } from './studioConstants.ts';
import type { StudioTabId } from '../state/studioPageTabs.ts';

interface StudioPageSkeletonProps {
  readonly category: string;
  readonly activeTab: StudioTabId;
}

interface SkeletonAction {
  readonly id: string;
  readonly label: string;
  readonly className: string;
}

interface SkeletonColumn {
  readonly id: string;
}

interface StudioTabDescriptor {
  readonly id: StudioTabId;
  readonly label: string;
}

const STUDIO_TABS: readonly StudioTabDescriptor[] = [
  { id: 'mapping', label: '1) Mapping Studio' },
  { id: 'keys', label: '2) Key Navigator' },
  { id: 'contract', label: '3) Field Contract' },
  { id: 'reports', label: '4) Compile & Reports' },
  { id: 'docs', label: '5) Per-Key Docs' },
];

const STUDIO_ACTIONS: readonly SkeletonAction[] = [
  {
    id: 'save',
    label: 'Save Edits',
    className: `${btnSecondary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`,
  },
  {
    id: 'auto-save',
    label: 'Auto-Save All Off',
    className: `relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth} transition-colors sf-action-button`,
  },
  {
    id: 'compile',
    label: 'Compile & Generate',
    className: `${btnPrimary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`,
  },
  {
    id: 'import',
    label: 'Import JSON',
    className: `${btnSecondary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`,
  },
  {
    id: 'refresh',
    label: 'Refresh',
    className: `${btnSecondary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`,
  },
];

const METRIC_LABELS = ['Category', 'Contract Keys', 'Compile Errors', 'Compile Warnings'] as const;
const COMPONENT_SOURCE_ROWS = Array.from({ length: 3 }, (_value, index) => `component-source-${index}`);
const ENUM_ROWS = Array.from({ length: 4 }, (_value, index) => `enum-${index}`);
const KEY_LIST_ROWS = Array.from({ length: 12 }, (_value, index) => `key-${index}`);
const KEY_DETAIL_SECTIONS = [
  'sticky-header',
  'contract',
  'priority',
  'ai-assist',
  'enum',
  'constraints',
  'evidence',
  'tooltip',
] as const;
const CONTRACT_COLUMNS: readonly SkeletonColumn[] = [
  { id: 'key' },
  { id: 'label' },
  { id: 'group' },
  { id: 'type' },
  { id: 'source' },
  { id: 'priority' },
  { id: 'evidence' },
  { id: 'tooltip' },
];
const CONTRACT_ROWS = Array.from({ length: 10 }, (_value, index) => `contract-${index}`);
const WORKBENCH_PRESETS = [
  'minimal',
  'contract',
  'priority',
  'aiAssist',
  'enums',
  'components',
  'constraints',
  'evidence',
  'tooltip',
  'search',
  'debug',
  'all',
] as const;
const REPORT_SECTIONS = ['artifacts', 'guardrails'] as const;
const REPORT_LINES = ['report-line-0', 'report-line-1', 'report-line-2'] as const;

function MetricSkeleton({ label, category }: { readonly label: string; readonly category: string }) {
  return (
    <div className={sectionCls} data-region="studio-loading-metric-card">
      <div className={labelCls}>{label}</div>
      <div className="text-lg font-semibold">
        {label === 'Category' ? (
          category
        ) : (
          <span className="sf-shimmer inline-block h-5 w-20 rounded-sm" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function StudioShellSkeleton({
  category,
  activeTab,
  activePanel,
}: StudioPageSkeletonProps & { readonly activePanel: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3" data-region="studio-loading-metrics">
        {METRIC_LABELS.map((label) => (
          <MetricSkeleton key={label} label={label} category={category} />
        ))}
      </div>

      <div className="sf-surface-elevated rounded-lg border sf-border-default p-2" data-region="studio-loading-actions">
        <div className="flex flex-wrap items-center gap-3">
          {STUDIO_ACTIONS.map((action) => (
            <button key={action.id} type="button" className={action.className} data-skeleton-action={action.id} disabled>
              <span className="w-full text-center font-medium truncate">{action.label}</span>
              <span className="absolute inline-block h-2.5 w-2.5 rounded-full sf-dot-subtle sf-dk-surface-600 border border-sf-surface-elevated shadow-sm right-[3px] bottom-[3px]" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex border-b sf-border-default" data-region="studio-loading-tabs">
        {STUDIO_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-skeleton-tab={tab.id}
            className={`relative px-3 py-2 text-sm font-medium border-b-2 ${
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent sf-text-muted hover:sf-text-muted'
            } ${tab.id === 'reports' ? 'pr-7' : ''}`}
            disabled
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activePanel}
    </div>
  );
}

function MappingHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3" data-region="studio-loading-mapping-header">
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold">Mapping Studio</h3>
        <SkeletonBlock className="sf-skel-bar-label" />
      </div>
      <button
        type="button"
        className={`${btnSecondary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`}
        disabled
      >
        <span className="w-full text-center font-medium truncate">Auto-Save Mapping On</span>
      </button>
    </div>
  );
}

function MappingSectionHeaderSkeleton({ title }: { readonly title: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <button
        type="button"
        aria-expanded="true"
        className="flex-1 flex items-center justify-between gap-2 text-left text-sm font-semibold sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        disabled
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">-</span>
          <span>{title}</span>
        </span>
      </button>
      <div className="pt-0.5">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
    </div>
  );
}

function ComponentSourceRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="border sf-border-default rounded p-4 sf-bg-surface-soft sf-dk-surface-750" data-region="studio-loading-component-source-row">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          disabled
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">-</span>
          <span className="w-full text-left px-6 truncate"><SkeletonBlock className="sf-skel-bar-label" /></span>
        </button>
        <button type="button" className="px-2 py-1 text-[11px] rounded sf-danger-action-soft" disabled>
          Remove
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3" data-skeleton-row={row}>
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
      </div>
    </div>
  );
}

function EnumRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="border sf-border-default rounded p-3 sf-bg-surface-soft" data-region="studio-loading-enum-row" data-skeleton-row={row}>
      <div className="grid grid-cols-3 gap-3 items-end">
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
      </div>
    </div>
  );
}

function MappingPanelSkeleton() {
  return (
    <div className="space-y-6" data-region="studio-loading-mapping-panel">
      <MappingHeaderSkeleton />

      <div className={`${sectionCls} relative`} data-region="studio-loading-mapping-section">
        <MappingSectionHeaderSkeleton title="Tooltips Source" />
        <div className="mt-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <div className={labelCls}>Tooltip Bank File (JS/JSON/MD)</div>
              <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
            </div>
            <div>
              <div className={labelCls}>Tooltips</div>
              <span className="sf-shimmer inline-block h-5 w-16 rounded-sm" aria-hidden="true" />
            </div>
            <div>
              <div className={labelCls}>Coverage</div>
              <span className="sf-shimmer inline-block h-5 w-16 rounded-sm" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      <div className={`${sectionCls} relative`} data-region="studio-loading-mapping-section">
        <MappingSectionHeaderSkeleton title="Component Sources" />
        <div className="space-y-2 mt-3">
          {COMPONENT_SOURCE_ROWS.map((row) => (
            <ComponentSourceRowSkeleton key={row} row={row} />
          ))}
        </div>
      </div>

      <div className={`${sectionCls} relative`} data-region="studio-loading-mapping-section">
        <MappingSectionHeaderSkeleton title="Enum" />
        <div className="mt-3 space-y-2">
          {ENUM_ROWS.map((row) => (
            <EnumRowSkeleton key={row} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KeyListRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div
      className="w-full px-2 py-1.5 text-left rounded border sf-border-default sf-bg-surface-soft text-xs flex items-center"
      data-region="studio-loading-key-list-row"
      data-skeleton-row={row}
    >
      <span
        className="sf-shimmer block h-4 w-full rounded-sm"
        aria-hidden="true"
      />
    </div>
  );
}

function KeyDetailSectionSkeleton({ section }: { readonly section: string }) {
  return (
    <div className={`${sectionCls} space-y-2`} data-region="studio-loading-key-detail-section" data-skeleton-section={section}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold sf-text-muted"><SkeletonBlock className="sf-skel-bar-label" /></h4>
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
      </div>
    </div>
  );
}

function KeysPanelSkeleton() {
  return (
    <div className="flex gap-4 min-h-[calc(100vh-350px)]" data-region="studio-loading-keys-panel">
      <aside className="w-80 shrink-0 rounded border sf-border-default sf-surface-card p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={btnSecondary} disabled>+ Add Key</button>
          <button type="button" className={btnSecondary} disabled>Bulk Paste</button>
        </div>
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className="space-y-1.5">
          {KEY_LIST_ROWS.map((row) => (
            <KeyListRowSkeleton key={row} row={row} />
          ))}
        </div>
      </aside>
      <section className="flex-1 min-w-0 space-y-3">
        {KEY_DETAIL_SECTIONS.map((section) => (
          <KeyDetailSectionSkeleton key={section} section={section} />
        ))}
      </section>
    </div>
  );
}

function ContractCellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'key') {
    return <span className="sf-shimmer inline-block h-5 w-24 rounded-md" aria-hidden="true" />;
  }
  if (columnId === 'label') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'group' || columnId === 'type' || columnId === 'source' || columnId === 'priority') {
    return <span className="sf-shimmer inline-block h-5 w-14 rounded-md" aria-hidden="true" />;
  }
  if (columnId === 'evidence' || columnId === 'tooltip') {
    return <span className="sf-shimmer inline-block h-3.5 w-7 rounded-sm" aria-hidden="true" />;
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function ContractTableSkeleton() {
  return (
    <div className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-360px)]">
      <table className="min-w-full text-sm table-fixed" aria-hidden="true">
        <thead className="sf-table-head sticky top-0">
          <tr>
            {CONTRACT_COLUMNS.map((column) => (
              <th key={column.id} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column.id}>
                <SkeletonBlock className="sf-skel-bar-label" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sf-border-default">
          {CONTRACT_ROWS.map((row) => (
            <tr key={row} className="sf-table-row cursor-pointer" data-skeleton-row={row}>
              {CONTRACT_COLUMNS.map((column) => (
                <td key={`${row}-${column.id}`} className="px-2 py-1.5 whitespace-nowrap overflow-hidden">
                  <ContractCellSkeleton columnId={column.id} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContractPanelSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sf-text-primary sf-border-default sf-border-soft" data-region="studio-loading-contract-panel">
      <div className="overflow-hidden sf-surface-card sf-bg-surface-soft" data-region="studio-loading-contract-card">
        <div className="p-3 border-b sf-border-default space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {WORKBENCH_PRESETS.map((preset, index) => (
              <span
                key={preset}
                className={`sf-shimmer inline-block px-3 py-1.5 h-7 w-20 text-xs rounded sf-tab-item${index === 0 ? ' sf-tab-item-active' : ''}`}
                data-region="studio-loading-contract-preset"
                data-skeleton-preset={preset}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        </div>
        <ContractTableSkeleton />
      </div>
    </div>
  );
}

function ReportsPanelSkeleton() {
  return (
    <div className="space-y-4" data-region="studio-loading-reports-panel">
      <div className="flex items-center gap-3 overflow-x-auto pb-1" data-region="studio-loading-report-actions">
        <button type="button" className={`${btnPrimary} h-10 min-h-10 w-52 inline-flex items-center justify-center whitespace-nowrap shrink-0`} data-region="studio-loading-report-action" disabled>
          Run Category Compile
        </button>
        <button type="button" className="h-10 min-h-10 w-52 inline-flex items-center justify-center whitespace-nowrap shrink-0 px-4 text-sm sf-confirm-button-solid transition-colors disabled:opacity-50" data-region="studio-loading-report-action" disabled>
          Validate Rules
        </button>
        <button type="button" className={`${btnPrimary} h-10 min-h-10 w-56 inline-flex items-center justify-center whitespace-nowrap shrink-0`} data-region="studio-loading-report-action" disabled>
          Generate Key Finder Audit Reports
        </button>
        <span className="sf-shimmer h-10 min-h-10 w-52 inline-flex rounded border shrink-0 sf-border-default sf-bg-surface-soft" data-region="studio-loading-report-action" aria-hidden="true" />
        <span className="sf-shimmer h-10 min-h-10 w-52 inline-flex rounded border shrink-0 sf-border-default sf-bg-surface-soft" data-region="studio-loading-report-action" aria-hidden="true" />
        <div className="h-10 min-h-10 w-80 inline-flex items-center gap-2 rounded border px-3 shrink-0 sf-border-default sf-bg-surface-soft" data-region="studio-loading-report-action">
          <span className="sf-shimmer flex-1 h-2 rounded" aria-hidden="true" />
          <span className="w-28">
            <SkeletonBlock className="sf-skel-caption" />
          </span>
          <span className="w-10 text-right">
            <SkeletonBlock className="sf-skel-caption" />
          </span>
        </div>
      </div>

      {REPORT_SECTIONS.map((section) => (
        <div key={section} className={sectionCls} data-region="studio-loading-report-section">
          <h4 className="text-sm font-semibold mb-2">
            {section === 'artifacts' ? 'Generated Artifacts' : 'Guardrails Report'}
          </h4>
          <div className="space-y-2">
            {REPORT_LINES.map((line) => (
              <span
                key={`${section}-${line}`}
                className="sf-shimmer block h-3.5 w-full rounded-sm"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const DOCS_SECTION_TABS = Array.from({ length: 8 }, (_value, index) => `docs-section-${index}`);

function DocsPanelSkeleton() {
  return (
    <div className="flex gap-4 min-h-[calc(100vh-350px)]" data-region="studio-loading-docs-panel">
      <aside className="w-64 shrink-0 rounded border sf-border-default sf-surface-card p-3 space-y-2">
        <div className={`${inputCls} w-full h-9 sf-shimmer`} aria-hidden="true" />
        <div className="space-y-1.5">
          {KEY_LIST_ROWS.map((row) => (
            <KeyListRowSkeleton key={row} row={row} />
          ))}
        </div>
      </aside>
      <section className="flex-1 min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1 border-b sf-border-default pb-2">
          {DOCS_SECTION_TABS.map((tab) => (
            <span
              key={tab}
              className="sf-shimmer inline-block h-7 w-24 rounded-sm"
              aria-hidden="true"
            />
          ))}
        </div>
        <div className={sectionCls}>
          <SkeletonBlock className="sf-skel-bar-label" />
          <div className="mt-3 space-y-2">
            <SkeletonBlock className="sf-skel-bar" />
            <SkeletonBlock className="sf-skel-bar" />
            <SkeletonBlock className="sf-skel-bar" />
          </div>
        </div>
      </section>
    </div>
  );
}

function activePanelForTab(activeTab: StudioTabId) {
  if (activeTab === 'keys') return <KeysPanelSkeleton />;
  if (activeTab === 'contract') return <ContractPanelSkeleton />;
  if (activeTab === 'reports') return <ReportsPanelSkeleton />;
  if (activeTab === 'docs') return <DocsPanelSkeleton />;
  return <MappingPanelSkeleton />;
}

export function StudioPageSkeleton({ category, activeTab }: StudioPageSkeletonProps) {
  return (
    <div data-testid="studio-page-loading-skeleton" aria-busy="true">
      <StudioShellSkeleton
        category={category}
        activeTab={activeTab}
        activePanel={activePanelForTab(activeTab)}
      />
      <span className="sr-only">Loading Field Studio for {category}</span>
    </div>
  );
}
