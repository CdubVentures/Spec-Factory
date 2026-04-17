import { useState } from 'react';
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
  description: string;
  priority: boolean;
}

const CATEGORY_VIEW_DEFAULTS: Record<string, ViewEntry[]> = {
  mouse: [
    { key: 'top',    priority: true,  description: 'Bird\u2019s-eye shot looking directly down at the mouse from above' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the mouse from above and behind' },
    { key: 'bottom', priority: false, description: 'Underside/belly view showing the base, sensor, mouse feet/skates' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level' },
    { key: 'front',  priority: false, description: 'Head-on front view of the mouse' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the palm rest curvature' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle at roughly 30\u201345 degrees' },
  ],
  monitor: [
    { key: 'front',  priority: true,  description: 'Head-on front view of the monitor' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the back panel' },
    { key: 'rear',   priority: true,  description: 'Head-on rear view showing ports and VESA area' },
    { key: 'left',   priority: false, description: 'Strict side profile from the left at eye level' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level' },
    { key: 'top',    priority: false, description: 'Bird\u2019s-eye shot showing top edge and stand base' },
    { key: 'bottom', priority: false, description: 'Underside view showing the bottom bezel' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle at roughly 30\u201345 degrees' },
  ],
  keyboard: [
    { key: 'top',    priority: true,  description: 'Bird\u2019s-eye shot of the full key layout' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level' },
    { key: 'angle',  priority: true,  description: 'Front/top 3/4 angle at roughly 30\u201345 degrees' },
    { key: 'bottom', priority: false, description: 'Underside view showing the base and rubber feet' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level' },
    { key: 'front',  priority: false, description: 'Head-on front view of the front edge' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing rear ports and cable routing' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle at roughly 30\u201345 degrees' },
  ],
};

const GENERIC_DESCRIPTIONS: Record<string, string> = {
  top: 'Bird\u2019s-eye shot looking directly down at the product from above',
  bottom: 'Underside/belly view showing the base and any bottom features',
  left: 'Strict side profile from the left at eye level',
  right: 'Strict side profile from the right at eye level',
  front: 'Head-on front view',
  rear: 'Head-on rear view showing back panel and ports',
  sangle: 'Front/side 3/4 angle at roughly 30\u201345 degrees',
  angle: 'Rear/top 3/4 angle at roughly 30\u201345 degrees',
};

function getCategoryDefaults(category: string): ViewEntry[] {
  if (CATEGORY_VIEW_DEFAULTS[category]) return CATEGORY_VIEW_DEFAULTS[category];
  return CANONICAL_VIEWS.map((v, i) => ({
    key: v.key,
    priority: i < 3,
    description: GENERIC_DESCRIPTIONS[v.key] || `${v.label} view of the product`,
  }));
}

function ensureAllViews(views: ViewEntry[], category: string): ViewEntry[] {
  const catDefaults = getCategoryDefaults(category);
  const descMap: Record<string, string> = {};
  for (const d of catDefaults) descMap[d.key] = d.description;

  const normalized = views.map((v) => ({
    key: v.key,
    description: v.description || descMap[v.key] || GENERIC_DESCRIPTIONS[v.key] || '',
    priority: typeof v.priority === 'boolean' ? v.priority : true,
  }));

  const existing = new Set(normalized.map((v) => v.key));
  for (const canon of CANONICAL_VIEWS) {
    if (!existing.has(canon.key)) {
      normalized.push({
        key: canon.key,
        priority: false,
        description: descMap[canon.key] || GENERIC_DESCRIPTIONS[canon.key] || `${canon.label} view of the product`,
      });
    }
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
  const [expandedKey, setExpandedKey] = useState<string>('');

  const commit = (next: ViewEntry[]) => onSave(entry.key, JSON.stringify(next));

  const handleTogglePriority = (key: string) => {
    const updated = views.map((v) =>
      v.key === key ? { ...v, priority: !v.priority } : v,
    );
    const pri = updated.filter((v) => v.priority);
    const add = updated.filter((v) => !v.priority);
    commit([...pri, ...add]);
  };

  const handleDescChange = (key: string, desc: string) => {
    commit(views.map((v) => (v.key === key ? { ...v, description: desc } : v)));
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
    const isExpanded = expandedKey === view.key;
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

          <div className="flex-1" />

          <button
            onClick={() => setExpandedKey(isExpanded ? '' : view.key)}
            className="sf-btn-ghost px-1.5 py-0.5 rounded text-[11px] sf-text-muted"
          >
            {isExpanded ? 'collapse' : 'edit description'}
          </button>
        </div>

        {!isExpanded && (
          <div className="px-3 pb-2">
            <p className="text-[11px] truncate sf-text-muted">{view.description}</p>
          </div>
        )}

        {isExpanded && (
          <div className="px-3 pb-3">
            <textarea
              defaultValue={view.description}
              onBlur={(e) => {
                if (e.target.value !== view.description) handleDescChange(view.key, e.target.value);
              }}
              disabled={isSaving}
              rows={3}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px] resize-y min-h-14"
              placeholder="Describe what this angle looks like..."
            />
            <p className="mt-1 text-[10px] sf-text-muted">
              This description is sent to the LLM so it knows how to identify and name this view.
            </p>
          </div>
        )}
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
