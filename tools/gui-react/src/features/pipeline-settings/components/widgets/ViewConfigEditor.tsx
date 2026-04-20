import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

const CANONICAL_VIEWS = [
  { key: 'top',    label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left',   label: 'Left' },
  { key: 'right',  label: 'Right' },
  { key: 'front',  label: 'Front' },
  { key: 'rear',   label: 'Rear' },
  { key: 'sangle', label: 'S-Angle (Front/Side 3/4)' },
  { key: 'angle',  label: 'Angle (Rear/Top 3/4)' },
] as const;

interface ViewEntry {
  key: string;
  priority: boolean;
}

const CATEGORY_PRIORITY_DEFAULTS: Record<string, ReadonlyArray<ViewEntry>> = {
  mouse:    [
    { key: 'top',    priority: true },
    { key: 'left',   priority: true },
    { key: 'angle',  priority: true },
    { key: 'bottom', priority: false },
    { key: 'right',  priority: false },
    { key: 'front',  priority: false },
    { key: 'rear',   priority: false },
    { key: 'sangle', priority: false },
  ],
  monitor:  [
    { key: 'front',  priority: true },
    { key: 'angle',  priority: true },
    { key: 'rear',   priority: true },
    { key: 'left',   priority: false },
    { key: 'right',  priority: false },
    { key: 'top',    priority: false },
    { key: 'bottom', priority: false },
    { key: 'sangle', priority: false },
  ],
  keyboard: [
    { key: 'top',    priority: true },
    { key: 'left',   priority: true },
    { key: 'angle',  priority: true },
    { key: 'bottom', priority: false },
    { key: 'right',  priority: false },
    { key: 'front',  priority: false },
    { key: 'rear',   priority: false },
    { key: 'sangle', priority: false },
  ],
};

function getCategoryDefaults(category: string): ViewEntry[] {
  const defaults = CATEGORY_PRIORITY_DEFAULTS[category];
  if (defaults) return defaults.map((v) => ({ ...v }));
  return CANONICAL_VIEWS.map((v, i) => ({ key: v.key, priority: i < 3 }));
}

function ensureAllViews(views: ViewEntry[], category: string): ViewEntry[] {
  const normalized = views.map((v) => ({
    key: v.key,
    priority: typeof v.priority === 'boolean' ? v.priority : true,
  }));
  const catDefaults = getCategoryDefaults(category);
  const existing = new Set(normalized.map((v) => v.key));
  for (const d of catDefaults) {
    if (!existing.has(d.key)) normalized.push({ key: d.key, priority: false });
  }
  return normalized;
}

function parseViewConfig(raw: string, category: string): ViewEntry[] {
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return ensureAllViews(parsed, category);
      }
    } catch { /* fall through */ }
  }
  return getCategoryDefaults(category);
}

export function ViewConfigEditor({ entry, value, category, isSaving, onSave }: FinderSettingWidgetProps) {
  const views = parseViewConfig(value, category);
  const priorityViews = views.filter((v) => v.priority);
  const additionalViews = views.filter((v) => !v.priority);
  const isUsingDefaults = !value || !value.trim();

  const commit = (next: ViewEntry[]) => onSave(
    entry.key,
    JSON.stringify(next.map((v) => ({ key: v.key, priority: v.priority }))),
  );

  const handleTogglePriority = (key: string) => {
    const updated = views.map((v) =>
      v.key === key ? { ...v, priority: !v.priority } : v,
    );
    const pri = updated.filter((v) => v.priority);
    const add = updated.filter((v) => !v.priority);
    commit([...pri, ...add]);
  };

  const handleMovePriority = (key: string, dir: -1 | 1) => {
    const pri = views.filter((v) => v.priority);
    const add = views.filter((v) => !v.priority);
    const idx = pri.findIndex((v) => v.key === key);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pri.length) return;
    [pri[idx], pri[newIdx]] = [pri[newIdx], pri[idx]];
    commit([...pri, ...add]);
  };

  const handleReset = () => onSave(entry.key, '');

  const renderViewRow = (view: ViewEntry, isPriority: boolean, priorityIdx?: number) => {
    const canonLabel = CANONICAL_VIEWS.find((v) => v.key === view.key)?.label || view.key;

    return (
      <div
        key={view.key}
        className={`rounded border ${isPriority ? 'sf-border-default sf-surface-elevated' : 'sf-border-soft'}`}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isPriority}
              onChange={() => handleTogglePriority(view.key)}
              disabled={isSaving}
              className="sf-checkbox w-4 h-4 cursor-pointer"
            />
            {isPriority && (
              <span className="text-[11px] font-semibold sf-text-muted tabular-nums">
                #{(priorityIdx ?? 0) + 1}
              </span>
            )}
          </label>

          <span className={`font-semibold text-[13px] ${isPriority ? 'sf-text-primary' : 'sf-text-muted'}`}>
            {canonLabel}
          </span>

          {isPriority && (
            <>
              <button
                onClick={() => handleMovePriority(view.key, -1)}
                disabled={isSaving || priorityIdx === 0}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30 sf-text-muted"
                title="Move up"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => handleMovePriority(view.key, 1)}
                disabled={isSaving || priorityIdx === priorityViews.length - 1}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30 sf-text-muted"
                title="Move down"
              >
                {'\u25BC'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted">Priority Views</span>
        {isUsingDefaults ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full sf-text-info sf-surface-elevated">
            Using {category} defaults
          </span>
        ) : (
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Reset to {category} defaults
          </button>
        )}
      </div>
      <p className="text-[10px] sf-text-muted mb-2">
        Toggle which views are priority for single-run searches and order them. Prompt text per view is edited in LLM Config.
      </p>
      <div className="space-y-1.5">
        {priorityViews.map((v, i) => renderViewRow(v, true, i))}
      </div>

      {additionalViews.length > 0 && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mt-4 mb-1">
            Additional Views
          </div>
          <div className="space-y-1.5">
            {additionalViews.map((v) => renderViewRow(v, false))}
          </div>
        </>
      )}
    </div>
  );
}
