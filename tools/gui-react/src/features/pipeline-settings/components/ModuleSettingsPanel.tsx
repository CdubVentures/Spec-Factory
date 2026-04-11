/**
 * Module Settings Panel — per-category settings for discovery modules.
 *
 * Renders the settings form for CEF or PIF based on which module section
 * is active. Per-category values are read/written via the module-settings API.
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
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
}

const CATEGORY_VIEW_DEFAULTS: Record<string, ViewEntry[]> = {
  mouse: [
    { key: 'top',   description: 'Bird\'s-eye shot looking directly down at the mouse from above — camera is directly overhead, mouse flat on surface, showing full shape outline' },
    { key: 'left',  description: 'Strict side profile from the left at eye level — camera level with the mouse, no tilt, showing the full side silhouette, button profile, and scroll wheel' },
    { key: 'angle', description: 'Rear/top 3/4 angle showing the mouse from above and behind at roughly 30–45 degrees — common press/marketing hero shot' },
  ],
  monitor: [
    { key: 'front',  description: 'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand' },
    { key: 'angle',  description: 'Rear/top 3/4 angle showing the monitor from behind and slightly above — showing the back panel design and stand' },
    { key: 'rear',   description: 'Head-on rear view showing the back panel, ports, VESA mount area, and cable management' },
  ],
  keyboard: [
    { key: 'top',    description: 'Bird\'s-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends' },
    { key: 'left',   description: 'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present' },
    { key: 'angle',  description: 'Front/top 3/4 angle showing the keyboard from the front and slightly above at roughly 30–45 degrees' },
  ],
};

const DEFAULT_FALLBACK = CATEGORY_VIEW_DEFAULTS.mouse;

function getCategoryDefaults(category: string): ViewEntry[] {
  return CATEGORY_VIEW_DEFAULTS[category] || DEFAULT_FALLBACK;
}

function parseViewConfig(raw: string, category: string): ViewEntry[] {
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  const usedKeys = new Set(views.map(v => v.key));
  const availableKeys = CANONICAL_VIEWS.filter(v => !usedKeys.has(v.key));

  const handleKeyChange = (idx: number, newKey: string) => {
    const updated = [...views];
    const defaults = getCategoryDefaults(category);
    const defaultDesc = defaults.find(d => d.key === newKey)?.description
      || CANONICAL_VIEWS.find(v => v.key === newKey)?.label + ' view of the product'
      || '';
    updated[idx] = { key: newKey, description: defaultDesc };
    onChange(updated);
  };

  const handleDescChange = (idx: number, desc: string) => {
    const updated = [...views];
    updated[idx] = { ...updated[idx], description: desc };
    onChange(updated);
  };

  const handleRemove = (idx: number) => {
    const updated = views.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const updated = [...views];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    onChange(updated);
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= views.length - 1) return;
    const updated = [...views];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    onChange(updated);
  };

  const handleAdd = () => {
    if (availableKeys.length === 0) return;
    const newKey = availableKeys[0].key;
    const defaults = getCategoryDefaults(category);
    const defaultDesc = defaults.find(d => d.key === newKey)?.description
      || CANONICAL_VIEWS.find(v => v.key === newKey)?.label + ' view of the product'
      || '';
    onChange([...views, { key: newKey, description: defaultDesc }]);
  };

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">
        Priority Views
      </div>
      <p className="sf-text-caption mb-3" style={{ color: 'var(--sf-muted)' }}>
        Ordered by priority. The LLM focuses on finding these views first. Any other canonical views are searched as bonus.
        Descriptions are injected into the LLM prompt — customize them per category for accuracy.
      </p>

      {views.map((view, idx) => {
        // For the dropdown, include current key + unused keys
        const keyOptions = CANONICAL_VIEWS.filter(v => v.key === view.key || !usedKeys.has(v.key));

        return (
          <div
            key={`${view.key}-${idx}`}
            className="sf-card p-3 rounded"
            style={{ border: '1px solid var(--sf-separator)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              {/* Priority badge */}
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: 'var(--sf-accent)', color: '#fff' }}
              >
                {idx + 1}
              </span>

              {/* View key dropdown */}
              <select
                value={view.key}
                onChange={(e) => handleKeyChange(idx, e.target.value)}
                disabled={isSaving}
                className="sf-input px-2 py-1 rounded sf-text-label text-[13px]"
                style={{ minWidth: 180 }}
              >
                {keyOptions.map(v => (
                  <option key={v.key} value={v.key}>{v.label} ({v.key})</option>
                ))}
              </select>

              {/* Reorder buttons */}
              <button
                onClick={() => handleMoveUp(idx)}
                disabled={isSaving || idx === 0}
                className="sf-btn-ghost px-1.5 py-0.5 rounded text-[12px] sf-text-muted disabled:opacity-30"
                title="Move up"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => handleMoveDown(idx)}
                disabled={isSaving || idx >= views.length - 1}
                className="sf-btn-ghost px-1.5 py-0.5 rounded text-[12px] sf-text-muted disabled:opacity-30"
                title="Move down"
              >
                {'\u25BC'}
              </button>

              {/* Remove */}
              <button
                onClick={() => handleRemove(idx)}
                disabled={isSaving || views.length <= 1}
                className="sf-btn-ghost px-1.5 py-0.5 rounded text-[12px] disabled:opacity-30"
                style={{ color: 'var(--sf-danger, #ef4444)' }}
                title="Remove view"
              >
                {'\u2715'}
              </button>
            </div>

            {/* Description textarea */}
            <textarea
              value={view.description}
              onChange={(e) => handleDescChange(idx, e.target.value)}
              onBlur={() => onChange(views)} // ensure save on blur
              disabled={isSaving}
              rows={2}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px] resize-y"
              placeholder="Describe what this angle looks like so the LLM finds the right shots..."
              style={{ minHeight: 48 }}
            />
          </div>
        );
      })}

      {/* Add button */}
      {availableKeys.length > 0 && (
        <button
          onClick={handleAdd}
          disabled={isSaving}
          className="sf-btn-ghost px-3 py-1.5 rounded text-[12px] sf-text-muted hover:sf-text-label"
          style={{ border: '1px dashed var(--sf-separator)' }}
        >
          + Add View
        </button>
      )}

      {/* Bonus views info */}
      {availableKeys.length > 0 && (
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)', fontSize: 11 }}>
          Bonus views (searched if found, not prioritized):{' '}
          {availableKeys.map(v => v.key).join(', ')}
        </p>
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
  onSaveMulti,
}: {
  settings: Record<string, string>;
  category: string;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
  onSaveMulti: (settings: Record<string, string>) => void;
}) {
  const isDefaults = !settings.viewConfig || !settings.viewConfig.trim();

  // Local state for view config (derived from settings or category defaults)
  const [localViews, setLocalViews] = useState<ViewEntry[]>(() =>
    parseViewConfig(settings.viewConfig || '', category)
  );

  // Sync local state when settings change externally
  useEffect(() => {
    setLocalViews(parseViewConfig(settings.viewConfig || '', category));
  }, [settings.viewConfig, category]);

  const handleViewConfigChange = useCallback((views: ViewEntry[]) => {
    setLocalViews(views);
    onSave('viewConfig', JSON.stringify(views));
  }, [onSave]);

  const handleResetToDefaults = useCallback(() => {
    const defaults = getCategoryDefaults(category);
    setLocalViews(defaults);
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
            Images below these dimensions are rejected and deleted after download. Told to the LLM as a minimum and enforced server-side.
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
    saveSettings,
  } = useModuleSettingsAuthority({ category, moduleId });

  const handleSave = useCallback((key: string, value: string) => {
    saveSetting(key, value);
  }, [saveSetting]);

  const handleSaveMulti = useCallback((s: Record<string, string>) => {
    saveSettings(s);
  }, [saveSettings]);

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
        onSaveMulti={handleSaveMulti}
      />
    );
  }

  return <CefSettingsForm />;
}
