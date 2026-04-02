import { useState, useCallback } from 'react';
import type { ColorEntry } from '../types.ts';
import { ColorPickerPopup } from './ColorPickerPopup.tsx';

interface ColorCardProps {
  readonly entry: ColorEntry;
  readonly onUpdateHex: (name: string, hex: string) => void;
  readonly onDelete: (name: string) => void;
}

export function ColorCard({ entry, onUpdateHex, onDelete }: ColorCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleApply = useCallback((hex: string) => {
    onUpdateHex(entry.name, hex);
    setEditing(false);
  }, [entry.name, onUpdateHex]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(entry.name);
    setConfirmDelete(false);
  }, [confirmDelete, entry.name, onDelete]);

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-2 transition-colors sf-hover-bg-surface-soft group cursor-pointer"
      title={entry.css_var}
      onClick={() => setEditing(true)}
    >
      <div
        className="w-6 h-6 rounded-md flex-shrink-0 border sf-border-soft shadow-sm"
        style={{ backgroundColor: entry.hex }}
      />

      <span className="font-mono text-[11px] sf-text-primary font-medium truncate flex-1 leading-tight">
        {entry.name}
      </span>

      <span className="font-mono text-[10px] sf-text-muted flex-shrink-0 tabular-nums">
        {entry.hex}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
        <button
          className={`p-1 rounded ${confirmDelete ? 'sf-danger-button-solid' : 'sf-icon-button'}`}
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          title={confirmDelete ? 'Confirm delete' : 'Delete color'}
        >
          {confirmDelete ? (
            <span className="text-[10px] px-0.5 font-medium">Del</span>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          )}
        </button>
      </div>

      {editing && (
        <ColorPickerPopup
          hex={entry.hex}
          onApply={handleApply}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
