import { useState, useCallback } from 'react';
import { isValidColorName, isValidHex, normalizeColorName } from '../utils/colorValidation.ts';
import { inputCls } from '../../../utils/studioConstants.ts';
import { btnPrimary, btnSecondary } from '../../../shared/ui/buttonClasses.ts';

interface AddColorFormProps {
  readonly onAdd: (name: string, hex: string) => void;
  readonly onCancel: () => void;
  readonly existingNames: ReadonlySet<string>;
}

export function AddColorForm({ onAdd, onCancel, existingNames }: AddColorFormProps) {
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#000000');

  const normalized = normalizeColorName(name);
  const nameValid = isValidColorName(normalized);
  const hexValid = isValidHex(hex);
  const isDuplicate = existingNames.has(normalized);
  const canSubmit = nameValid && hexValid && !isDuplicate && normalized.length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onAdd(normalized, hex);
    setName('');
    setHex('#000000');
  }, [canSubmit, normalized, hex, onAdd]);

  return (
    <div className="sf-surface-card rounded border sf-border-default p-4 mb-4">
      <div className="flex items-end gap-3">
        <label className="flex-1 block">
          <span className="sf-text-caption font-medium text-xs block mb-1">Color Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            className={`${inputCls} font-mono text-sm`}
            placeholder="e.g. turquoise"
          />
        </label>

        <label className="block">
          <span className="sf-text-caption font-medium text-xs block mb-1">Hex</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={hexValid ? hex : '#000000'}
              onChange={(e) => setHex(e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border sf-border-default"
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => setHex(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
              className={`${inputCls} font-mono text-sm w-24`}
              placeholder="#000000"
              maxLength={7}
            />
          </div>
        </label>

        <button className={btnPrimary} disabled={!canSubmit} onClick={handleSubmit}>
          Add
        </button>
        <button className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {name.length > 0 && !nameValid && (
        <p className="mt-1 text-xs sf-status-text-danger">
          Name must start with a letter, lowercase only, hyphens allowed
        </p>
      )}
      {isDuplicate && (
        <p className="mt-1 text-xs sf-status-text-danger">
          Color &quot;{normalized}&quot; already exists
        </p>
      )}
      {hex.length > 1 && !hexValid && (
        <p className="mt-1 text-xs sf-status-text-danger">
          Hex must be #RRGGBB format
        </p>
      )}
    </div>
  );
}
