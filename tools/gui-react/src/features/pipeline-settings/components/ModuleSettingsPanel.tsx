/**
 * Module Settings Panel — per-category settings for discovery modules.
 *
 * Renders the settings form for CEF or PIF based on which module section
 * is active. Per-category values are read/written via the module-settings API.
 */

import { useCallback, useState, useEffect } from 'react';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';

/* ── Canonical views (mirrors backend productImageLlmAdapter.js) ── */

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
    { key: 'top',    priority: true,  description: 'Bird\'s-eye shot looking directly down at the mouse from above — camera directly overhead, showing full shape outline and button layout' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level — camera level with the mouse, no tilt, showing the full side silhouette, button profile, and scroll wheel' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the mouse from above and behind at roughly 30\u201345 degrees — product-only on clean background' },
    { key: 'bottom', priority: false, description: 'Underside/belly view showing the base, sensor, mouse feet/skates, and any bottom labels or DPI switch' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of the left view, showing right-side buttons and grip texture' },
    { key: 'front',  priority: false, description: 'Head-on front view — camera faces the nose of the mouse showing buttons, scroll wheel, and front profile straight on' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back/rear of the mouse, the palm rest curvature from behind' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the mouse from the front-left at roughly 30\u201345 degrees, camera slightly elevated' },
  ],
  monitor: [
    { key: 'front',  priority: true,  description: 'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the monitor from behind and slightly above — showing the back panel design and stand' },
    { key: 'rear',   priority: true,  description: 'Head-on rear view showing the back panel, ports, VESA mount area, and cable management' },
    { key: 'left',   priority: false, description: 'Strict side profile from the left at eye level — showing the monitor thickness, stand profile, and panel depth' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'top',    priority: false, description: 'Bird\'s-eye shot looking down at the monitor from above — showing the top edge, thickness, and stand base' },
    { key: 'bottom', priority: false, description: 'Underside view showing the bottom bezel and any bottom-mounted ports, buttons, or joystick' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the monitor from the front-left at roughly 30\u201345 degrees' },
  ],
  keyboard: [
    { key: 'top',    priority: true,  description: 'Bird\'s-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present' },
    { key: 'angle',  priority: true,  description: 'Front/top 3/4 angle showing the keyboard from above and slightly in front at roughly 30\u201345 degrees' },
    { key: 'bottom', priority: false, description: 'Underside view showing the base, rubber feet, tilt legs, and any bottom labels' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'front',  priority: false, description: 'Head-on front view — camera faces the front edge showing the spacebar and front bezel' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back edge, ports, cable routing, and any rear features' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the keyboard from the front-left at roughly 30\u201345 degrees' },
  ],
};

const GENERIC_DESCRIPTIONS: Record<string, string> = {
  top:    'Bird\'s-eye shot looking directly down at the product from above',
  bottom: 'Underside/belly view showing the base and any bottom features',
  left:   'Strict side profile from the left at eye level — full side silhouette',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front of the product straight on',
  rear:   'Head-on rear view showing the back panel, ports, and rear design',
  sangle: 'Front/side 3/4 angle — product shot from the front-left at roughly 30\u201345 degrees',
  angle:  'Rear/top 3/4 angle — showing the product from above and behind at roughly 30\u201345 degrees',
};

function getCategoryDefaults(category: string): ViewEntry[] {
  if (CATEGORY_VIEW_DEFAULTS[category]) return CATEGORY_VIEW_DEFAULTS[category];
  // Generic: all views, first 3 priority
  return CANONICAL_VIEWS.map((v, i) => ({
    key: v.key,
    priority: i < 3,
    description: GENERIC_DESCRIPTIONS[v.key] || `${v.label} view of the product`,
  }));
}

/**
 * Ensure all 8 canonical views are present.
 * Missing views filled from category defaults with priority: false.
 * Old configs without `priority` field default to priority: true.
 */
function ensureAllViews(views: ViewEntry[], category: string): ViewEntry[] {
  const catDefaults = getCategoryDefaults(category);
  const descMap: Record<string, string> = {};
  for (const d of catDefaults) descMap[d.key] = d.description;

  const normalized = views.map(v => ({
    key: v.key,
    description: v.description || descMap[v.key] || GENERIC_DESCRIPTIONS[v.key] || '',
    priority: typeof v.priority === 'boolean' ? v.priority : true,
  }));

  const existing = new Set(normalized.map(v => v.key));
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

/* ── View Config Editor ───────────────────────────────────────────── */

function ViewConfigEditor({
  views,
  category,
  isSaving,
  onChange,
}: {
  views: ViewEntry[];
  category: string;
  isSaving: boolean;
  onChange: (views: ViewEntry[]) => void;
}) {
  const priorityViews = views.filter(v => v.priority);
  const additionalViews = views.filter(v => !v.priority);

  const handleTogglePriority = (key: string) => {
    const updated = views.map(v =>
      v.key === key ? { ...v, priority: !v.priority } : v
    );
    // Re-sort: priority first, then additional
    const pri = updated.filter(v => v.priority);
    const add = updated.filter(v => !v.priority);
    onChange([...pri, ...add]);
  };

  const handleDescChange = (key: string, desc: string) => {
    onChange(views.map(v => v.key === key ? { ...v, description: desc } : v));
  };

  const handleMovePriority = (key: string, dir: -1 | 1) => {
    const pri = views.filter(v => v.priority);
    const add = views.filter(v => !v.priority);
    const idx = pri.findIndex(v => v.key === key);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pri.length) return;
    [pri[idx], pri[newIdx]] = [pri[newIdx], pri[idx]];
    onChange([...pri, ...add]);
  };

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const renderViewRow = (view: ViewEntry, isPriority: boolean, priorityIdx?: number) => {
    const isExpanded = expandedKey === view.key;
    const canonLabel = CANONICAL_VIEWS.find(v => v.key === view.key)?.label || view.key;

    return (
      <div
        key={view.key}
        className="rounded"
        style={{
          border: `1px solid ${isPriority ? 'var(--sf-accent, #3b82f6)' : 'var(--sf-separator)'}`,
          backgroundColor: isPriority ? 'var(--sf-accent-bg, rgba(59,130,246,0.04))' : undefined,
        }}
      >
        {/* Row header */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Priority checkbox */}
          <label
            className="flex items-center gap-1.5 cursor-pointer shrink-0"
            title={isPriority ? 'Uncheck to remove from priority search' : 'Check to add to priority search'}
          >
            <input
              type="checkbox"
              checked={isPriority}
              onChange={() => handleTogglePriority(view.key)}
              disabled={isSaving}
              className="w-4 h-4 accent-[var(--sf-accent,#3b82f6)] cursor-pointer"
            />
            {isPriority && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: 'var(--sf-accent)', color: '#fff' }}
              >
                {priorityIdx! + 1}
              </span>
            )}
          </label>

          {/* View name */}
          <span
            className="font-semibold text-[13px] min-w-[60px]"
            style={{ color: isPriority ? 'var(--sf-text)' : 'var(--sf-muted)' }}
          >
            {view.key}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--sf-muted)' }}>
            {canonLabel}
          </span>

          {/* Priority reorder arrows */}
          {isPriority && (
            <>
              <button
                onClick={() => handleMovePriority(view.key, -1)}
                disabled={isSaving || priorityIdx === 0}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30"
                style={{ color: 'var(--sf-muted)' }}
                title="Move up in priority"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => handleMovePriority(view.key, 1)}
                disabled={isSaving || priorityIdx === priorityViews.length - 1}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30"
                style={{ color: 'var(--sf-muted)' }}
                title="Move down in priority"
              >
                {'\u25BC'}
              </button>
            </>
          )}

          <div className="flex-1" />

          {/* Expand/collapse description */}
          <button
            onClick={() => setExpandedKey(isExpanded ? null : view.key)}
            className="sf-btn-ghost px-1.5 py-0.5 rounded text-[11px]"
            style={{ color: 'var(--sf-muted)' }}
          >
            {isExpanded ? 'collapse' : 'edit description'}
          </button>
        </div>

        {/* Description preview (collapsed) */}
        {!isExpanded && (
          <div className="px-3 pb-2">
            <p className="text-[11px] truncate" style={{ color: 'var(--sf-muted)' }}>
              {view.description}
            </p>
          </div>
        )}

        {/* Description editor (expanded) */}
        {isExpanded && (
          <div className="px-3 pb-3">
            <textarea
              value={view.description}
              onChange={(e) => handleDescChange(view.key, e.target.value)}
              onBlur={() => onChange(views)}
              disabled={isSaving}
              rows={3}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px] resize-y"
              placeholder="Describe what this angle looks like so the LLM finds and classifies shots correctly..."
              style={{ minHeight: 56 }}
            />
            <p className="mt-1 text-[10px]" style={{ color: 'var(--sf-muted)' }}>
              This description is sent to the LLM so it knows how to identify and name this view.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Priority section */}
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">
        Priority Views
      </div>
      <p className="sf-text-caption mb-2" style={{ color: 'var(--sf-muted)' }}>
        The LLM searches for these views first. Click the numbered badge to toggle priority. Reorder with arrows.
      </p>
      <div className="space-y-1.5">
        {priorityViews.map((v, i) => renderViewRow(v, true, i))}
      </div>

      {additionalViews.length > 0 && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mt-4 mb-1">
            Additional Views
          </div>
          <p className="sf-text-caption mb-2" style={{ color: 'var(--sf-muted)' }}>
            The LLM knows these angles and will include matching product shots it finds while searching. Click the badge to promote to priority.
          </p>
          <div className="space-y-1.5">
            {additionalViews.map(v => renderViewRow(v, false))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── PIF Settings ────────────────────────────────────────────────── */

function PifSettingsForm({
  settings,
  category,
  isSaving,
  onSave,
}: {
  settings: Record<string, string>;
  category: string;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const isDefaults = !settings.viewConfig || !settings.viewConfig.trim();

  const [localViews, setLocalViews] = useState<ViewEntry[]>(() =>
    parseViewConfig(settings.viewConfig || '', category)
  );

  useEffect(() => {
    setLocalViews(parseViewConfig(settings.viewConfig || '', category));
  }, [settings.viewConfig, category]);

  const handleViewConfigChange = useCallback((views: ViewEntry[]) => {
    setLocalViews(views);
    onSave('viewConfig', JSON.stringify(views));
  }, [onSave]);

  const handleResetToDefaults = useCallback(() => {
    setLocalViews(getCategoryDefaults(category));
    onSave('viewConfig', '');
  }, [category, onSave]);

  return (
    <div className="space-y-6">
      {/* View Configuration */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted">View Configuration</div>
          {isDefaults && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--sf-info-bg, rgba(59,130,246,0.1))', color: 'var(--sf-info, #3b82f6)' }}
            >
              Using {category} defaults
            </span>
          )}
          {!isDefaults && (
            <button
              onClick={handleResetToDefaults}
              disabled={isSaving}
              className="text-[10px] px-1.5 py-0.5 rounded sf-btn-ghost"
              style={{ color: 'var(--sf-muted)' }}
            >
              Reset to {category} defaults
            </button>
          )}
        </div>

        <ViewConfigEditor
          views={localViews}
          category={category}
          isSaving={isSaving}
          onChange={handleViewConfigChange}
        />
      </div>

      {/* Image Quality */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-3">Image Quality</div>
        <div className="space-y-3">
          <div className="flex gap-4">
            <div>
              <label className="block sf-text-label font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>
                Min Width (px)
              </label>
              <input
                type="number"
                value={settings.minWidth ?? '800'}
                onChange={(e) => onSave('minWidth', e.target.value)}
                disabled={isSaving}
                className="sf-input w-28 px-2 py-1.5 rounded sf-text-label"
                min="100"
                max="4000"
              />
            </div>
            <div>
              <label className="block sf-text-label font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>
                Min Height (px)
              </label>
              <input
                type="number"
                value={settings.minHeight ?? '600'}
                onChange={(e) => onSave('minHeight', e.target.value)}
                disabled={isSaving}
                className="sf-input w-28 px-2 py-1.5 rounded sf-text-label"
                min="100"
                max="4000"
              />
            </div>
          </div>
          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Images below these dimensions are rejected and deleted after download.
          </p>
          <div>
            <label className="block sf-text-label font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>
              Min File Size (bytes)
            </label>
            <input
              type="number"
              value={settings.minFileSize ?? '50000'}
              onChange={(e) => onSave('minFileSize', e.target.value)}
              disabled={isSaving}
              className="sf-input w-36 px-2 py-1.5 rounded sf-text-label"
              min="0"
              max="10000000"
            />
            <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              Reject images smaller than this. Default 50KB (50000). Set to 0 to disable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── CEF Settings (placeholder) ──────────────────────────────────── */

function CefSettingsForm() {
  return (
    <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
      No per-category settings for Color & Edition Finder yet.
    </p>
  );
}

/* ── Panel ────────────────────────────────────────────────────────── */

export function ModuleSettingsPanel({ moduleId }: { moduleId: 'colorEditionFinder' | 'productImageFinder' }) {
  const category = useUiStore((s) => s.category);

  const {
    settings,
    isLoading,
    isSaving,
    saveSetting,
  } = useModuleSettingsAuthority({ category, moduleId });

  const handleSave = useCallback((key: string, value: string) => {
    saveSetting(key, value);
  }, [saveSetting]);

  if (!category) {
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Select a category to configure module settings.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Loading settings...
      </p>
    );
  }

  if (moduleId === 'productImageFinder') {
    return (
      <PifSettingsForm
        settings={settings}
        category={category}
        isSaving={isSaving}
        onSave={handleSave}
      />
    );
  }

  return <CefSettingsForm />;
}
