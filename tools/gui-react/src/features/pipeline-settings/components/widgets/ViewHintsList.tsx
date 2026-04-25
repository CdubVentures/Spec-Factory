import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

const CANONICAL_VIEWS = [
  { key: 'top',    label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left',   label: 'Left' },
  { key: 'right',  label: 'Right' },
  { key: 'front',  label: 'Front' },
  { key: 'rear',   label: 'Rear' },
  { key: 'sangle', label: 'S-Angle' },
  { key: 'angle',  label: 'Angle' },
] as const;

export function ViewHintsList({ entry, value, isSaving, onSave }: FinderSettingWidgetProps) {
  let selected: string[] = [];
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed)) {
      selected = parsed.filter((k) => CANONICAL_VIEWS.some((v) => v.key === k));
    }
  } catch { /* empty */ }

  const selectedSet = new Set(selected);

  const handleToggle = (key: string) => {
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSave(entry.key, JSON.stringify([...next]));
  };

  const handleClear = () => onSave(entry.key, JSON.stringify([]));

  const activeCount = selectedSet.size;

  return (
    <div className="space-y-2">
      {entry.uiLabel && (
        <div className="space-y-0.5">
          <span className="sf-text-label sf-text-primary">{entry.uiLabel}</span>
          {entry.uiTip && <p className="sf-text-caption sf-text-muted">{entry.uiTip}</p>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold sf-text-primary">
          {activeCount === 0 ? 'No hints — ADDITIONAL section omitted from prompt' : `${activeCount} hint${activeCount === 1 ? '' : 's'}`}
        </span>
        {activeCount > 0 && (
          <button
            onClick={handleClear}
            disabled={isSaving}
            className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CANONICAL_VIEWS.map((v) => {
          const active = selectedSet.has(v.key);
          return (
            <label
              key={v.key}
              className={`flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 border transition-all ${
                active ? 'sf-border-default sf-surface-elevated shadow-sm' : 'sf-border-soft opacity-60 hover:opacity-80'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => handleToggle(v.key)}
                disabled={isSaving}
                className="sf-checkbox w-3.5 h-3.5 shrink-0"
              />
              <span className={`text-[11px] font-medium truncate ${active ? 'sf-text-primary' : 'sf-text-muted'}`}>
                {v.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
