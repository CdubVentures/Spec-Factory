// ── FieldRulesWorkbench: top-level orchestrator for Tab 3 ────────────
import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SortingState } from '@tanstack/react-table';
import type { ColumnPreset } from './workbenchTypes.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { buildWorkbenchRows } from './workbenchHelpers.ts';
import { buildColumns, getPresetVisibility } from './workbenchColumns.tsx';
import { readWorkbenchSessionState, writeWorkbenchSessionState } from './workbenchSessionState.ts';
import { resolveWorkbenchInlineEditPath } from './workbenchInlineEditContracts.ts';
import { WorkbenchColumnPresets } from './WorkbenchColumnPresets.tsx';
import { WorkbenchTable } from './WorkbenchTable.tsx';
import { WorkbenchDrawer } from './WorkbenchDrawer.tsx';
import { WorkbenchBulkBar } from './WorkbenchBulkBar.tsx';
import {
  useStudioFieldRulesActions,
  useStudioFieldRulesState,
} from '../state/studioFieldRulesController.ts';
import type { StudioPageActivePanelContractProps as Props } from '../components/studioPagePanelContracts.ts';

const PRESET_TAB_IDS = [
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
] as const satisfies ReadonlyArray<ColumnPreset>;

function hasTruthySelectionDiff(
  previous: Record<string, boolean>,
  next: Record<string, boolean>,
): boolean {
  const prevKeys = Object.keys(previous).filter((key) => previous[key]);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return true;
  return prevKeys.some((key) => !next[key]);
}

function pruneSelectionForRows(
  selection: Record<string, boolean>,
  rowKeys: Set<string>,
): Record<string, boolean> {
  return Object.entries(selection).reduce<Record<string, boolean>>((acc, [key, selected]) => {
    if (selected && rowKeys.has(key)) {
      acc[key] = true;
    }
    return acc;
  }, {});
}

function hasAnyVisibleColumn(columnVisibility: Record<string, boolean>): boolean {
  const entries = Object.entries(columnVisibility);
  if (entries.length === 0) return true;
  return entries.some(([, visible]) => visible !== false);
}

export function FieldRulesWorkbench({
  category,
  knownValues,
  enumLists,
  componentSources,
  wbMap: _wbMap,
  guardrails,
  onSave,
  saving,
  saveSuccess,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
  autoSaveLockReason,
}: Props) {
  const { editedRules, editedFieldOrder, egLockedKeys } = useStudioFieldRulesState();
  const { updateField } = useStudioFieldRulesActions();

  // ── Table state ──────────────────────────────────────────────────
  const [activePreset, setActivePreset] = usePersistedTab<ColumnPreset>(
    'studio:workbench:presetTab',
    'minimal',
    { validValues: PRESET_TAB_IDS },
  );
  const initialSessionState = useMemo(
    () => readWorkbenchSessionState(category),
    [category],
  );
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    () => {
      if (Object.keys(initialSessionState.columnVisibility).length > 0) {
        return initialSessionState.columnVisibility;
      }
      return getPresetVisibility(activePreset) || {};
    },
  );
  const [sorting, setSorting] = useState<SortingState>(
    () => initialSessionState.sorting,
  );
  const [globalFilter, setGlobalFilter] = useState(
    () => initialSessionState.globalFilter,
  );
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>(
    () => initialSessionState.rowSelection,
  );
  const [editingCell, setEditingCell] = useState<{ key: string; column: string } | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(
    () => initialSessionState.drawerKey,
  );

  // ── Build rows ───────────────────────────────────────────────────
  const rows = useMemo(
    () => buildWorkbenchRows(editedFieldOrder, editedRules, guardrails, knownValues, egLockedKeys, componentSources),
    [editedFieldOrder, editedRules, guardrails, knownValues, egLockedKeys, componentSources],
  );

  useEffect(() => {
    if (hasAnyVisibleColumn(columnVisibility)) return;
    setColumnVisibility(getPresetVisibility(activePreset) || {});
  }, [columnVisibility, activePreset]);

  useEffect(() => {
    const rowKeys = new Set(rows.map((row) => row.key));
    setRowSelection((previous) => {
      const next = pruneSelectionForRows(previous, rowKeys);
      return hasTruthySelectionDiff(previous, next) ? next : previous;
    });
    setDrawerKey((previous) => {
      if (!previous) return null;
      return rowKeys.has(previous) ? previous : null;
    });
  }, [rows]);

  useEffect(() => {
    writeWorkbenchSessionState(category, {
      columnVisibility,
      sorting,
      globalFilter,
      rowSelection,
      drawerKey,
    });
  }, [category, columnVisibility, sorting, globalFilter, rowSelection, drawerKey]);

  // ── Preset change ────────────────────────────────────────────────
  const handlePreset = useCallback((preset: ColumnPreset) => {
    setActivePreset(preset);
    const vis = getPresetVisibility(preset);
    setColumnVisibility(vis || {});
  }, [setActivePreset]);

  const handleToggleColumn = useCallback((id: string) => {
    setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
    setActivePreset('all'); // switch to "all" since we're manually overriding
  }, [setActivePreset]);

  // ── Inline edit handlers ─────────────────────────────────────────
  const handleInlineCommit = useCallback((key: string, column: string, value: unknown) => {
    const path = resolveWorkbenchInlineEditPath(column);
    if (path) updateField(key, path, value);
    setEditingCell(null);
  }, [updateField]);

  // ── Row selection ────────────────────────────────────────────────
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  const handleToggleRow = useCallback((key: string) => {
    setRowSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedCount === rows.length) {
      setRowSelection({});
    } else {
      const all: Record<string, boolean> = {};
      for (const r of rows) all[r.key] = true;
      setRowSelection(all);
    }
  }, [rows, selectedCount]);

  // ── Bulk apply ───────────────────────────────────────────────────
  const handleBulkApply = useCallback((field: string, value: unknown) => {
    const selectedKeys = Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k);
    for (const key of selectedKeys) {
      updateField(key, field, value);
    }
    setRowSelection({});
  }, [rowSelection, updateField]);

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    onSave();
  }, [onSave]);

  const saveIfAutoSaveEnabled = useCallback(() => {
    if (!autoSaveEnabled) return;
    onSave();
  }, [autoSaveEnabled, onSave]);

  // ── Build columns ────────────────────────────────────────────────
  const columns = useMemo(
    () => buildColumns(
      editingCell,
      setEditingCell,
      handleInlineCommit,
      rowSelection,
      handleToggleRow,
      handleToggleAll,
      selectedCount === rows.length && rows.length > 0,
    ),
    [editingCell, handleInlineCommit, rowSelection, handleToggleRow, handleToggleAll, selectedCount, rows.length],
  );

  // ── Drawer ───────────────────────────────────────────────────────
  const drawerRule = drawerKey ? (editedRules[drawerKey] || null) : null;
  const drawerOpen = drawerKey !== null && drawerRule !== null;

  return (
    <div className={`grid ${drawerOpen ? 'grid-cols-[1fr,640px]' : 'grid-cols-1'} gap-3 sf-text-primary sf-border-default sf-border-soft`}>
      <div className="overflow-hidden sf-surface-card sf-bg-surface-soft">
        <WorkbenchColumnPresets
          activePreset={activePreset}
          onPreset={handlePreset}
          columnVisibility={columnVisibility}
          onToggleColumn={handleToggleColumn}
          globalFilter={globalFilter}
          onGlobalFilter={setGlobalFilter}
          onSave={handleSave}
          saving={saving}
          saveSuccess={saveSuccess}
          autoSaveEnabled={autoSaveEnabled}
          setAutoSaveEnabled={setAutoSaveEnabled}
          autoSaveLocked={autoSaveLocked}
          autoSaveLockReason={autoSaveLockReason}
        />

        <WorkbenchTable
          rows={rows}
          columns={columns}
          sorting={sorting}
          onSortingChange={setSorting}
          globalFilter={globalFilter}
          columnVisibility={columnVisibility}
          rowSelection={rowSelection}
          onRowClick={(key) => setDrawerKey(key === drawerKey ? null : key)}
          activeDrawerKey={drawerKey}
        />

        {selectedCount > 0 && (
          <WorkbenchBulkBar
            selectedCount={selectedCount}
            onApply={handleBulkApply}
            onClear={() => setRowSelection({})}
          />
        )}
      </div>

      {drawerOpen && drawerKey && drawerRule && (
        <WorkbenchDrawer
          category={category}
          fieldKey={drawerKey}
          rule={drawerRule}
          fieldOrder={editedFieldOrder}
          knownValues={knownValues}
          enumLists={enumLists}
          onCommitImmediate={saveIfAutoSaveEnabled}
          onClose={() => setDrawerKey(null)}
          onNavigate={(key) => setDrawerKey(key)}
        />
      )}
    </div>
  );
}
