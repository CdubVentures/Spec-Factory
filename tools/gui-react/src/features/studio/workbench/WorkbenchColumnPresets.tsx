// ── Preset toolbar: preset buttons, column picker, global filter ─────
import { useState, useRef, useEffect } from 'react';
import type { ColumnPreset } from './workbenchTypes.ts';
import { PRESET_LABELS, ALL_COLUMN_IDS_WITH_LABELS } from './workbenchColumns.tsx';

interface Props {
  activePreset: ColumnPreset;
  onPreset: (preset: ColumnPreset) => void;
  columnVisibility: Record<string, boolean>;
  onToggleColumn: (id: string) => void;
  globalFilter: string;
  onGlobalFilter: (val: string) => void;
  onSave: () => void;
  saving: boolean;
  saveSuccess: boolean;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (v: boolean) => void;
  autoSaveLocked: boolean;
  autoSaveLockReason?: string;
}

export function WorkbenchColumnPresets({
  activePreset,
  onPreset,
  columnVisibility,
  onToggleColumn,
  globalFilter,
  onGlobalFilter,
  onSave,
  saving,
  saveSuccess,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1">
        {PRESET_LABELS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPreset(p.id)}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              activePreset === p.id
                ? 'bg-accent/10 text-accent border border-accent/30'
                : 'sf-bg-surface-soft-strong sf-text-muted sf-hover-surface-soft-200 sf-dk-hover-surface-700 border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Column picker */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="px-2 py-1 text-xs rounded sf-bg-surface-soft-strong sf-text-muted sf-hover-surface-soft-200 sf-dk-hover-surface-700 border border-transparent"
          title="Pick columns"
        >
          Columns ▾
        </button>
        {pickerOpen && (
          <div className="absolute z-30 top-full mt-1 left-0 sf-surface-card rounded shadow-lg p-2 w-52 max-h-72 overflow-y-auto">
            {ALL_COLUMN_IDS_WITH_LABELS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 py-0.5 text-xs cursor-pointer sf-hover-bg-surface-soft-strong px-1 rounded">
                <input
                  type="checkbox"
                  checked={columnVisibility[col.id] !== false}
                  onChange={() => onToggleColumn(col.id)}
                  className="rounded sf-border-soft"
                />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Filter fields..."
        value={globalFilter}
        onChange={(e) => onGlobalFilter(e.target.value)}
        className="w-44 sf-input px-2 py-1 text-xs placeholder:sf-text-subtle"
      />

      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onSave}
        disabled={saving || autoSaveEnabled}
        className={`px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 transition-colors ${
          autoSaveEnabled ? 'sf-icon-button' : 'sf-primary-button'
        }`}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={() => {
          if (autoSaveLocked) return;
          setAutoSaveEnabled(!autoSaveEnabled);
        }}
        disabled={autoSaveLocked}
        className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors overflow-visible ${
          autoSaveEnabled
            ? 'sf-primary-button'
            : 'sf-action-button'
        } ${autoSaveLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
      >
        {autoSaveLocked
          ? 'Auto-Save On (Locked)'
          : (autoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off')}
        {saving && (
          <span
            className="absolute inline-block h-2 w-2 rounded-full sf-dot-pending animate-pulse border border-white/90 shadow-sm"
            style={{ right: '2px', bottom: '2px' }}
          />
        )}
        {!saving && saveSuccess && (
          <span
            className="absolute inline-block h-2 w-2 rounded-full sf-success-bg-500 border border-white/90 shadow-sm"
            style={{ right: '2px', bottom: '2px' }}
          />
        )}
      </button>
    </div>
  );
}
