import { useState, useCallback } from 'react';
import { isValidColorName } from '../utils/colorValidation.ts';
import { inputCls } from '../../../utils/studioConstants.ts';
import { btnPrimary, btnSecondary } from '../../../shared/ui/buttonClasses.ts';

interface AddGroupFormProps {
  readonly onAdd: (prefix: string) => void;
  readonly onCancel: () => void;
  readonly existingPrefixes: readonly string[];
}

export function AddGroupForm({ onAdd, onCancel, existingPrefixes }: AddGroupFormProps) {
  const [name, setName] = useState('');

  const trimmed = name.trim().toLowerCase();
  const nameValid = trimmed.length > 0 && isValidColorName(trimmed);
  const isDuplicate = existingPrefixes.includes(trimmed);
  const isReserved = trimmed === 'base';
  const canSubmit = nameValid && !isDuplicate && !isReserved;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onAdd(trimmed);
    setName('');
  }, [canSubmit, trimmed, onAdd]);

  return (
    <div className="sf-surface-card rounded border sf-border-default p-4 mb-4">
      <div className="flex items-end gap-3">
        <label className="flex-1 block">
          <span className="sf-text-caption font-medium text-xs block mb-1">Group Prefix</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onCancel();
            }}
            className={`${inputCls} font-mono text-sm`}
            placeholder="e.g. vivid, muted, pastel"
            autoFocus
          />
        </label>

        <button className={btnPrimary} disabled={!canSubmit} onClick={handleSubmit}>
          Add
        </button>
        <button className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p className="mt-1.5 text-[11px] sf-text-muted">
        Creates a new column. Colors are named {trimmed || '???'}-red, {trimmed || '???'}-blue, etc.
      </p>

      {name.length > 0 && !nameValid && (
        <p className="mt-1 text-xs sf-status-text-danger">
          Must start with a letter, lowercase only, no spaces
        </p>
      )}
      {isDuplicate && (
        <p className="mt-1 text-xs sf-status-text-danger">
          Group &quot;{trimmed}&quot; already exists
        </p>
      )}
      {isReserved && (
        <p className="mt-1 text-xs sf-status-text-danger">
          &quot;base&quot; is reserved
        </p>
      )}
    </div>
  );
}
