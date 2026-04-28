// ── Column defs, presets, cell renderers for the workbench table ──────
// WHY: Column order mirrors the Key Navigator panel order so the two
// surfaces are 1:1. Adding a new field = add to KeyNavigator panel + add a
// matching column entry here.
import type { ColumnDef } from '@tanstack/react-table';
import type { WorkbenchRow, ColumnPreset } from './workbenchTypes.ts';

import {
  REQUIRED_LEVEL_OPTIONS,
  ENUM_POLICY_OPTIONS,
} from '../../../registries/fieldRuleTaxonomy.ts';

// ── Badge colors ─────────────────────────────────────────────────────
const reqBadge: Record<string, string> = {
  identity: 'sf-purple-bg-soft sf-status-text-info',
  required: 'sf-chip-danger',
  critical: 'sf-chip-danger',
  expected: 'sf-chip-info',
  optional: 'sf-chip-neutral',
  editorial: 'sf-chip-success',
  commerce: 'sf-chip-warning',
  mandatory: 'sf-chip-danger',
  non_mandatory: 'sf-chip-neutral',
};

// WHY: open_prefer_known is opaque. Humanize so authors can read the table.
const ENUM_POLICY_HUMAN: Record<string, { label: string; tip: string }> = {
  open: {
    label: 'Open',
    tip: 'Any value accepted. No enum gating.',
  },
  closed: {
    label: 'Closed',
    tip: 'Value must match one of the known options from the configured source.',
  },
  open_prefer_known: {
    label: 'Open \u00b7 prefer known',
    tip: 'Open enum, but prefer known values from the configured source. New values accepted only with clear evidence.',
  },
};

// ── Cell Renderers ───────────────────────────────────────────────────

function FieldNameCell({ row }: { row: WorkbenchRow }) {
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium truncate">{row.displayName}</span>
        {row.draftDirty && <span className="w-1.5 h-1.5 rounded-full sf-dot-warning flex-shrink-0" title="Modified" />}
      </div>
      <div className="text-[10px] sf-status-text-muted font-mono truncate">{row.key}</div>
    </div>
  );
}

function CompileStatusDot({ row }: { row: WorkbenchRow }) {
  if (row.hasErrors) {
    return (
      <span title={row.compileMessages.join('\n')} className="sf-dot-danger inline-block w-2.5 h-2.5 rounded-full" />
    );
  }
  if (row.hasWarnings) {
    return (
      <span title={row.compileMessages.join('\n')} className="sf-dot-warning inline-block w-2.5 h-2.5 rounded-full" />
    );
  }
  return <span className="sf-dot-success inline-block w-2.5 h-2.5 rounded-full" />;
}

function BooleanBadge({ value }: { value: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 text-[11px] rounded font-medium ${
      value ? 'sf-chip-success' : 'sf-chip-neutral'
    }`}>
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function RequiredBadge({ value }: { value: string }) {
  return (
    <span className={`px-1.5 py-0.5 text-[11px] rounded font-medium ${reqBadge[value] || reqBadge.optional}`}>
      {value}
    </span>
  );
}

function BoolIconCell({ value, title }: { value: boolean; title?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 text-[12px] ${value ? 'sf-status-text-info' : 'sf-status-text-muted'}`}
      title={title || (value ? 'On' : 'Off')}
    >
      {value ? '\u2713' : '\u2014'}
    </span>
  );
}

function FilledCheckCell({ filled, title }: { filled: boolean; title?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 text-[12px] ${filled ? 'sf-status-text-info' : 'sf-status-text-muted'}`}
      title={title || (filled ? 'Filled' : 'Empty')}
    >
      {filled ? '\u2611' : '\u2610'}
    </span>
  );
}

function EnumPolicyHumanizedCell({ value }: { value: string }) {
  const meta = ENUM_POLICY_HUMAN[value];
  if (!meta) {
    return <span className="font-mono text-xs">{value || '\u2014'}</span>;
  }
  return (
    <span className="text-xs sf-text-muted truncate" title={meta.tip}>
      {meta.label}
    </span>
  );
}

function MutedOrEmDash({ value }: { value: string | undefined }) {
  return value
    ? <span className="font-mono text-xs truncate">{value}</span>
    : <span className="sf-status-text-muted">—</span>;
}

function CountCell({ value, accent = 'info' }: { value: number; accent?: 'info' | 'warning' }) {
  if (value <= 0) return <span className="sf-status-text-muted">0</span>;
  const cls = accent === 'warning' ? 'sf-status-text-warning' : 'sf-status-text-info';
  return <span className={`text-xs font-medium ${cls}`}>{value}</span>;
}

// ── Inline editable cell wrappers ────────────────────────────────────
export function InlineSelectCell({
  value,
  options,
  editingCell,
  cellId,
  onStartEdit,
  onCommit,
  renderValue,
}: {
  value: string;
  options: string[];
  editingCell: { key: string; column: string } | null;
  cellId: { key: string; column: string };
  onStartEdit: (id: { key: string; column: string }) => void;
  onCommit: (val: string) => void;
  renderValue?: (val: string) => React.ReactNode;
}) {
  const isEditing = editingCell?.key === cellId.key && editingCell?.column === cellId.column;
  if (isEditing) {
    return (
      <select
        autoFocus
        className="sf-primitive-input px-1 py-0.5 text-xs border border-accent rounded w-full"
        value={value}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={() => onCommit(value)}
      >
        {options.map((o) => <option key={o} value={o}>{o || '(none)'}</option>)}
      </select>
    );
  }
  return (
    <button
      className="sf-row-hoverable text-left w-full rounded px-1 py-0.5 text-xs cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onStartEdit(cellId); }}
    >
      {renderValue ? renderValue(value) : value || '\u2014'}
    </button>
  );
}

export function InlineBooleanCell({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="cursor-pointer">
      <BooleanBadge value={value} />
    </button>
  );
}

// ── Column definitions factory ───────────────────────────────────────
export function buildColumns(
  editingCell: { key: string; column: string } | null,
  onStartEdit: (id: { key: string; column: string }) => void,
  onInlineCommit: (key: string, column: string, value: unknown) => void,
  rowSelection: Record<string, boolean>,
  onToggleRow: (key: string) => void,
  onToggleAll: () => void,
  allSelected: boolean,
): ColumnDef<WorkbenchRow, unknown>[] {
  return [
    // Pinned: select checkbox
    {
      id: 'select',
      size: 36,
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="rounded sf-border-default"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={!!rowSelection[row.original.key]}
          onChange={() => onToggleRow(row.original.key)}
          onClick={(e) => e.stopPropagation()}
          className="rounded sf-border-default"
        />
      ),
    },

    // Pinned: status dot
    {
      id: 'status',
      header: '',
      size: 32,
      cell: ({ row }) => <CompileStatusDot row={row.original} />,
    },

    // Pinned: group
    {
      accessorKey: 'group',
      header: 'Group',
      size: 110,
      cell: ({ getValue }) => (
        <span className="text-xs sf-status-text-muted truncate">{getValue() as string}</span>
      ),
    },

    // Pinned: display name
    {
      accessorKey: 'displayName',
      header: 'Field',
      size: 170,
      cell: ({ row }) => <FieldNameCell row={row.original} />,
    },

    // ── Contract block ────────────────────────────────────────
    {
      accessorKey: 'variantDependent',
      header: 'Variant Dep',
      size: 80,
      cell: ({ row }) => (
        <BoolIconCell value={row.original.variantDependent} title="Variant Dependent" />
      ),
    },
    {
      accessorKey: 'pifDependent',
      header: 'PIF Dep',
      size: 70,
      cell: ({ row }) => (
        <BoolIconCell value={row.original.pifDependent} title="Product Image Dependent" />
      ),
    },
    {
      accessorKey: 'contractType',
      header: 'Type',
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },
    {
      accessorKey: 'contractShape',
      header: 'Shape',
      size: 75,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },
    {
      accessorKey: 'contractUnit',
      header: 'Unit',
      size: 60,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },
    {
      accessorKey: 'contractRange',
      header: 'Range',
      size: 90,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },
    {
      accessorKey: 'listRulesSummary',
      header: 'List Rules',
      size: 130,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },
    {
      accessorKey: 'roundingSummary',
      header: 'Rounding',
      size: 90,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },

    // ── Priority block ───────────────────────────────────────
    {
      accessorKey: 'requiredLevel',
      header: 'Required',
      size: 110,
      cell: ({ row }) => (
        <InlineSelectCell
          value={row.original.requiredLevel}
          options={REQUIRED_LEVEL_OPTIONS}
          editingCell={editingCell}
          cellId={{ key: row.original.key, column: 'requiredLevel' }}
          onStartEdit={onStartEdit}
          onCommit={(v) => onInlineCommit(row.original.key, 'requiredLevel', v)}
          renderValue={(v) => <RequiredBadge value={v} />}
        />
      ),
    },
    { accessorKey: 'availability', header: 'Availability', size: 100 },
    { accessorKey: 'difficulty', header: 'Difficulty', size: 90 },

    // ── Ai Assist block ──────────────────────────────────────
    {
      accessorKey: 'variantInventoryUsage',
      header: 'Variant Inv',
      size: 80,
      cell: ({ row }) => (
        <BoolIconCell value={row.original.variantInventoryUsage} title="Use Variant Inventory Context" />
      ),
    },
    {
      accessorKey: 'pifPriorityImages',
      header: 'PIF Pri Img',
      size: 80,
      cell: ({ row }) => (
        <BoolIconCell value={row.original.pifPriorityImages} title="Use PIF Priority Images" />
      ),
    },
    {
      accessorKey: 'reasoningNoteFilled',
      header: 'Note',
      size: 60,
      cell: ({ row }) => (
        <FilledCheckCell filled={row.original.reasoningNoteFilled} title="Extraction Guidance filled" />
      ),
    },

    // ── Enum block ───────────────────────────────────────────
    {
      accessorKey: 'enumPolicy',
      header: 'Enum Policy',
      size: 130,
      cell: ({ row }) => {
        const policy = row.original.enumPolicy;
        return (
          <InlineSelectCell
            value={policy}
            options={ENUM_POLICY_OPTIONS}
            editingCell={editingCell}
            cellId={{ key: row.original.key, column: 'enumPolicy' }}
            onStartEdit={onStartEdit}
            onCommit={(v) => onInlineCommit(row.original.key, 'enumPolicy', v)}
            renderValue={(v) => <EnumPolicyHumanizedCell value={v} />}
          />
        );
      },
    },
    {
      accessorKey: 'enumSource',
      header: 'Enum Source',
      size: 140,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },
    {
      accessorKey: 'knownValuesCount',
      header: 'KV Count',
      size: 70,
      cell: ({ getValue }) => <CountCell value={getValue() as number} accent="info" />,
    },

    // ── Components block ─────────────────────────────────────
    {
      accessorKey: 'componentType',
      header: 'Component',
      size: 90,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? (
          <span className="sf-purple-bg-soft sf-status-text-info px-1.5 py-0.5 text-[11px] rounded font-medium">
            {v}
          </span>
        ) : <span className="sf-status-text-muted">—</span>;
      },
    },
    {
      accessorKey: 'matchCfgSummary',
      header: 'Match Cfg',
      size: 130,
      cell: ({ getValue }) => <MutedOrEmDash value={getValue() as string} />,
    },
    {
      accessorKey: 'belongsToComponent',
      header: 'Belongs To',
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? (
          <span
            className="sf-purple-bg-soft sf-status-text-info px-1.5 py-0.5 text-[11px] rounded font-medium"
            title={`This field is a property of the "${v}" component`}
          >
            {v}
          </span>
        ) : <span className="sf-status-text-muted">—</span>;
      },
    },
    {
      accessorKey: 'propertyVariance',
      header: 'Variance',
      size: 110,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        if (!v) return <span className="sf-status-text-muted">—</span>;
        const isOverride = v === 'override_allowed';
        const cls = isOverride ? 'sf-chip-teal-strong' : 'sf-bg-surface-soft-strong sf-text-muted';
        const label = isOverride ? 'override' : v;
        return (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}
            title={isOverride ? 'Products can override this value without triggering review' : `Variance policy: ${v}`}
          >
            {label}
          </span>
        );
      },
    },

    // ── Constraints block ────────────────────────────────────
    {
      accessorKey: 'constraintsCount',
      header: 'Constraints',
      size: 85,
      cell: ({ getValue }) => <CountCell value={getValue() as number} accent="warning" />,
    },
    {
      accessorKey: 'constraintVariables',
      header: 'Constraint Vars',
      size: 220,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs sf-status-text-muted truncate">{v}</span> : <span className="sf-status-text-muted">—</span>;
      },
    },

    // ── Evidence block ───────────────────────────────────────
    { accessorKey: 'minEvidenceRefs', header: 'Min Refs', size: 65 },
    {
      accessorKey: 'tierPreference',
      header: 'Tiers',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs sf-status-text-muted truncate">{v}</span> : <span className="sf-status-text-muted">—</span>;
      },
    },

    // ── Tooltip block ────────────────────────────────────────
    {
      accessorKey: 'tooltipMdFilled',
      header: 'Tooltip',
      size: 70,
      cell: ({ row }) => (
        <FilledCheckCell filled={row.original.tooltipMdFilled} title="Display Tooltip filled" />
      ),
    },

    // ── Search block ─────────────────────────────────────────
    { accessorKey: 'aliasesCount', header: 'Aliases', size: 65 },
    { accessorKey: 'queryTermsCount', header: 'Q Terms', size: 65 },
    { accessorKey: 'domainHintsCount', header: 'D Hints', size: 65 },
    { accessorKey: 'contentTypesCount', header: 'C Types', size: 65 },

    // ── UI legacy (debug/all only) ───────────────────────────
    {
      accessorKey: 'uiInputControl',
      header: 'Input',
      size: 90,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },
    { accessorKey: 'uiOrder', header: 'Order', size: 55 },

    // ── Meta block ───────────────────────────────────────────
    {
      accessorKey: 'egLocked',
      header: 'EG',
      size: 50,
      cell: ({ row }) => (
        row.original.egLocked
          ? <span title="EG-managed (locked)">{'\u{1F512}'}</span>
          : <span className="sf-status-text-muted">{'\u2014'}</span>
      ),
    },
    {
      accessorKey: 'draftDirty',
      header: 'Dirty',
      size: 50,
      cell: ({ getValue }) => (getValue() as boolean)
        ? <span className="w-2 h-2 rounded-full sf-dot-warning inline-block" title="Modified" />
        : <span className="sf-status-text-muted">—</span>,
    },
  ];
}

// ── Column preset maps ───────────────────────────────────────────────
const ALWAYS_VISIBLE = ['select', 'status', 'group', 'displayName'];

const PRESET_COLUMNS: Record<ColumnPreset, string[]> = {
  minimal: [
    ...ALWAYS_VISIBLE,
    'requiredLevel', 'contractType', 'enumPolicy',
  ],
  contract: [
    ...ALWAYS_VISIBLE,
    'variantDependent', 'pifDependent',
    'contractType', 'contractShape', 'contractUnit',
    'contractRange', 'listRulesSummary', 'roundingSummary',
  ],
  priority: [
    ...ALWAYS_VISIBLE,
    'requiredLevel', 'availability', 'difficulty',
  ],
  aiAssist: [
    ...ALWAYS_VISIBLE,
    'variantInventoryUsage', 'pifPriorityImages', 'reasoningNoteFilled',
  ],
  enums: [
    ...ALWAYS_VISIBLE,
    'enumPolicy', 'enumSource', 'knownValuesCount',
  ],
  components: [
    ...ALWAYS_VISIBLE,
    'componentType', 'matchCfgSummary', 'belongsToComponent', 'propertyVariance',
  ],
  constraints: [
    ...ALWAYS_VISIBLE,
    'constraintsCount', 'constraintVariables',
  ],
  evidence: [
    ...ALWAYS_VISIBLE,
    'minEvidenceRefs', 'tierPreference',
  ],
  tooltip: [
    ...ALWAYS_VISIBLE,
    'tooltipMdFilled',
  ],
  search: [
    ...ALWAYS_VISIBLE,
    'aliasesCount', 'queryTermsCount', 'domainHintsCount', 'contentTypesCount',
  ],
  debug: [
    ...ALWAYS_VISIBLE,
    'requiredLevel', 'contractType', 'enumPolicy', 'enumSource',
    'constraintsCount', 'componentType', 'uiInputControl', 'uiOrder', 'egLocked', 'draftDirty',
  ],
  all: [], // empty = show all
};

export function getPresetVisibility(preset: ColumnPreset): Record<string, boolean> | undefined {
  if (preset === 'all') return undefined;
  const visible = new Set(PRESET_COLUMNS[preset]);
  const vis: Record<string, boolean> = {};
  for (const { id } of ALL_COLUMN_IDS_WITH_LABELS) {
    vis[id] = visible.has(id);
  }
  for (const id of ALWAYS_VISIBLE) {
    vis[id] = true;
  }
  return vis;
}

export const ALL_COLUMN_IDS_WITH_LABELS: { id: string; label: string }[] = [
  // Contract
  { id: 'variantDependent', label: 'Variant Dep' },
  { id: 'pifDependent', label: 'PIF Dep' },
  { id: 'contractType', label: 'Type' },
  { id: 'contractShape', label: 'Shape' },
  { id: 'contractUnit', label: 'Unit' },
  { id: 'contractRange', label: 'Range' },
  { id: 'listRulesSummary', label: 'List Rules' },
  { id: 'roundingSummary', label: 'Rounding' },
  // Priority
  { id: 'requiredLevel', label: 'Required' },
  { id: 'availability', label: 'Availability' },
  { id: 'difficulty', label: 'Difficulty' },
  // Ai Assist
  { id: 'variantInventoryUsage', label: 'Variant Inv' },
  { id: 'pifPriorityImages', label: 'PIF Pri Img' },
  { id: 'reasoningNoteFilled', label: 'Note' },
  // Enum
  { id: 'enumPolicy', label: 'Enum Policy' },
  { id: 'enumSource', label: 'Enum Source' },
  { id: 'knownValuesCount', label: 'KV Count' },
  // Components
  { id: 'componentType', label: 'Component' },
  { id: 'matchCfgSummary', label: 'Match Cfg' },
  { id: 'belongsToComponent', label: 'Belongs To' },
  { id: 'propertyVariance', label: 'Variance' },
  // Constraints
  { id: 'constraintsCount', label: 'Constraints' },
  { id: 'constraintVariables', label: 'Constraint Vars' },
  // Evidence
  { id: 'minEvidenceRefs', label: 'Min Refs' },
  { id: 'tierPreference', label: 'Tiers' },
  // Tooltip
  { id: 'tooltipMdFilled', label: 'Tooltip' },
  // Search
  { id: 'aliasesCount', label: 'Aliases' },
  { id: 'queryTermsCount', label: 'Q Terms' },
  { id: 'domainHintsCount', label: 'D Hints' },
  { id: 'contentTypesCount', label: 'C Types' },
  // UI legacy
  { id: 'uiInputControl', label: 'Input Control' },
  { id: 'uiOrder', label: 'Order' },
  // Meta
  { id: 'egLocked', label: 'EG' },
  { id: 'draftDirty', label: 'Dirty' },
];

export const PRESET_LABELS: { id: ColumnPreset; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'contract', label: 'Contract' },
  { id: 'priority', label: 'Priority' },
  { id: 'aiAssist', label: 'Ai Assist' },
  { id: 'enums', label: 'Enum Policy' },
  { id: 'components', label: 'Components' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'search', label: 'Search Hints' },
  { id: 'debug', label: 'Debug' },
  { id: 'all', label: 'All' },
];
