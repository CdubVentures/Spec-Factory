import { useState, useCallback } from 'react';
import { ColorPickerPopup } from './ColorPickerPopup.tsx';

interface EmptyColorSlotProps {
  readonly colorName: string;
  readonly defaultHex: string;
  readonly onAdd: (name: string, hex: string) => void;
}

export function EmptyColorSlot({ colorName, defaultHex, onAdd }: EmptyColorSlotProps) {
  const [picking, setPicking] = useState(false);

  const handleApply = useCallback((hex: string) => {
    onAdd(colorName, hex);
    setPicking(false);
  }, [colorName, onAdd]);

  return (
    <div className="relative flex items-center gap-3 px-4 py-2">
      <button
        className="w-6 h-6 rounded-md flex-shrink-0 border border-dashed sf-border-soft flex items-center justify-center sf-text-subtle hover:sf-text-muted transition-colors"
        onClick={() => setPicking(true)}
        title={`Add ${colorName}`}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="6" y1="1" x2="6" y2="11" />
          <line x1="1" y1="6" x2="11" y2="6" />
        </svg>
      </button>
      <span className="font-mono text-[11px] sf-text-subtle truncate flex-1 leading-tight">
        {colorName}
      </span>

      {picking && (
        <ColorPickerPopup
          hex={defaultHex}
          onApply={handleApply}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
