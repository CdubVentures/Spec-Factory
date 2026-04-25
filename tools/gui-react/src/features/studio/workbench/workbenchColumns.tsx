// ── Column defs, presets, cell renderers for the workbench table ──────
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
      value
        ? 'sf-chip-success'
        : 'sf-chip-neutral'
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
    // Select checkbox
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

    // Status dot
    {
      id: 'status',
      header: '',
      size: 32,
      cell: ({ row }) => <CompileStatusDot row={row.original} />,
    },

    // Group (always pinned)
    {
      accessorKey: 'group',
      header: 'Group',
      size: 110,
      cell: ({ getValue }) => (
        <span className="text-xs sf-status-text-muted truncate">{getValue() as string}</span>
      ),
    },

    // Display name (always pinned, shows dirty dot)
    {
      accessorKey: 'displayName',
      header: 'Field',
      size: 170,
      cell: ({ row }) => <FieldNameCell row={row.original} />,
    },

    // Required level (inline editable)
    {
      accessorKey: 'requiredLevel',
      header: 'Required',
      size: 100,
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

    // Availability
    { accessorKey: 'availability', header: 'Availability', size: 100 },

    // Difficulty
    { accessorKey: 'difficulty', header: 'Difficulty', size: 90 },

    // Effort
    { accessorKey: 'effort', header: 'Effort', size: 60 },

    // Contract type
    {
      accessorKey: 'contractType',
      header: 'Type',
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },

    // Contract shape
    {
      accessorKey: 'contractShape',
      header: 'Shape',
      size: 75,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },

    // Contract unit
    {
      accessorKey: 'contractUnit',
      header: 'Unit',
      size: 60,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="font-mono text-xs">{v}</span> : <span className="sf-status-text-muted">\u2014</span>;
      },
    },

    // Enum policy (inline editable)
    {
      accessorKey: 'enumPolicy',
      header: 'Enum Policy',
      size: 120,
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
          />
        );
      },
    },

    // Enum source
    {
      accessorKey: 'enumSource',
      header: 'Enum Source',
      size: 140,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="font-mono text-xs truncate">{v}</span> : <span className="sf-status-text-muted">\u2014</span>;
      },
    },

    // Known values count
    {
      accessorKey: 'knownValuesCount',
      header: 'KV Count',
      size: 70,
      cell: ({ getValue }) => {
        const n = getValue() as number;
        return n > 0
          ? <span className="text-xs font-medium sf-status-text-info">{n}</span>
          : <span className="sf-status-text-muted">0</span>;
      },
    },

    // Min evidence refs
    { accessorKey: 'minEvidenceRefs', header: 'Min Refs', size: 65 },

    // Tier preference
    {
      accessorKey: 'tierPreference',
      header: 'Tiers',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs sf-status-text-muted truncate">{v}</span> : <span className="sf-status-text-muted">\u2014</span>;
      },
    },

    // Aliases count
    { accessorKey: 'aliasesCount', header: 'Aliases', size: 65 },

    // Query terms count
    { accessorKey: 'queryTermsCount', header: 'Q Terms', size: 65 },

    // Domain hints count
    { accessorKey: 'domainHintsCount', header: 'D Hints', size: 65 },

    // Content types count
    { accessorKey: 'contentTypesCount', header: 'C Types', size: 65 },

    // Constraints count
    {
      accessorKey: 'constraintsCount',
      header: 'Constraints',
      size: 85,
      cell: ({ getValue }) => {
        const n = getValue() as number;
        return n > 0
          ? <span className="text-xs font-medium sf-status-text-warning">{n}</span>
          : <span className="sf-status-text-muted">0</span>;
      },
    },

    // Constraint variables
    {
      accessorKey: 'constraintVariables',
      header: 'Constraint Vars',
      size: 220,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? <span className="text-xs sf-status-text-muted truncate">{v}</span> : <span className="sf-status-text-muted">—</span>;
      },
    },

    // Component type
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
        ) : <span className="sf-status-text-muted">\u2014</span>;
      },
    },

    // UI input control
    {
      accessorKey: 'uiInputControl',
      header: 'Input',
      size: 90,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },

    // UI order
    { accessorKey: 'uiOrder', header: 'Order', size: 55 },

    // Draft dirty indicator
    {
      accessorKey: 'draftDirty',
      header: 'Dirty',
      size: 50,
      cell: ({ getValue }) => (getValue() as boolean)
        ? <span className="w-2 h-2 rounded-full sf-dot-warning inline-block" title="Modified" />
        : <span className="sf-status-text-muted">\u2014</span>,
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
    'requiredLevel', 'contractType', 'contractShape', 'contractUnit',
    'constraintsCount', 'constraintVariables',
    'availability', 'difficulty', 'effort',
  ],
  parsing: [
    ...ALWAYS_VISIBLE,
  ],
  enums: [
    ...ALWAYS_VISIBLE,
    'enumPolicy', 'enumSource', 'knownValuesCount',
  ],
  evidence: [
    ...ALWAYS_VISIBLE,
    'minEvidenceRefs', 'tierPreference',
  ],
  search: [
    ...ALWAYS_VISIBLE,
    'aliasesCount', 'queryTermsCount', 'domainHintsCount', 'contentTypesCount', 'constraintsCount', 'constraintVariables', 'componentType',
  ],
  debug: [
    ...ALWAYS_VISIBLE,
    'requiredLevel', 'contractType', 'enumPolicy', 'enumSource',
    'constraintsCount', 'constraintVariables', 'componentType', 'uiInputControl', 'uiOrder', 'draftDirty',
  ],
  all: [], // empty = show all
};

export function getPresetVisibility(preset: ColumnPreset): Record<string, boolean> | undefined {
  if (preset === 'all') return undefined; // show everything
  const visible = new Set(PRESET_COLUMNS[preset]);
  const vis: Record<string, boolean> = {};
  for (const { id } of ALL_COLUMN_IDS_WITH_LABELS) {
    vis[id] = visible.has(id);
  }
  // Always visible columns are always true
  for (const id of ALWAYS_VISIBLE) {
    vis[id] = true;
  }
  return vis;
}

export const ALL_COLUMN_IDS_WITH_LABELS: { id: string; label: string }[] = [
  { id: 'requiredLevel', label: 'Required Level' },
  { id: 'availability', label: 'Availability' },
  { id: 'difficulty', label: 'Difficulty' },
  { id: 'effort', label: 'Effort' },
  { id: 'contractType', label: 'Type' },
  { id: 'contractShape', label: 'Shape' },
  { id: 'contractUnit', label: 'Unit' },
  { id: 'enumPolicy', label: 'Enum Policy' },
  { id: 'enumSource', label: 'Enum Source' },
  { id: 'knownValuesCount', label: 'KV Count' },
  { id: 'minEvidenceRefs', label: 'Min Refs' },
  { id: 'tierPreference', label: 'Tiers' },
  { id: 'aliasesCount', label: 'Aliases' },
  { id: 'queryTermsCount', label: 'Query Terms' },
  { id: 'domainHintsCount', label: 'Domain Hints' },
  { id: 'contentTypesCount', label: 'Content Types' },
  { id: 'constraintsCount', label: 'Constraints' },
  { id: 'constraintVariables', label: 'Constraint Vars' },
  { id: 'componentType', label: 'Component' },
  { id: 'uiInputControl', label: 'Input Control' },
  { id: 'uiOrder', label: 'Order' },
  { id: 'draftDirty', label: 'Dirty' },
];

export const PRESET_LABELS: { id: ColumnPreset; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'contract', label: 'Contract' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'enums', label: 'Enums' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'search', label: 'Search & Aliases' },
  { id: 'debug', label: 'Debug' },
  { id: 'all', label: 'All' },
];
