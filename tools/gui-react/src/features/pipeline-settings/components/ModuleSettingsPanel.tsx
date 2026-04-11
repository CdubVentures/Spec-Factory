/**
 * Module Settings Panel — per-category settings for discovery modules.
 *
 * Renders the settings form for CEF or PIF based on which module section
 * is active. Per-category values are read/written via the module-settings API.
 */

import { useCallback } from 'react';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';

/* ── PIF Settings ────────────────────────────────────────────────── */

function PifSettingsForm({
  settings,
  isSaving,
  onSave,
}: {
  settings: Record<string, string>;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* View Angles */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-3">View Angles</div>
        <div className="space-y-3">
          <div>
            <label className="block sf-text-label font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>
              View 1 (Primary)
            </label>
            <input
              type="text"
              value={settings.view1 ?? 'top'}
              onChange={(e) => onSave('view1', e.target.value)}
              disabled={isSaving}
              className="sf-input w-48 px-2 py-1.5 rounded sf-text-label"
              placeholder="e.g. top, front"
            />
            <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              Primary product view angle (e.g. "top" for mouse, "front" for monitor/keyboard)
            </p>
          </div>
          <div>
            <label className="block sf-text-label font-semibold mb-1" style={{ color: 'var(--sf-text)' }}>
              View 2 (Secondary)
            </label>
            <input
              type="text"
              value={settings.view2 ?? 'left'}
              onChange={(e) => onSave('view2', e.target.value)}
              disabled={isSaving}
              className="sf-input w-48 px-2 py-1.5 rounded sf-text-label"
              placeholder="e.g. left, side"
            />
            <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              Secondary product view angle. Leave empty to skip.
            </p>
          </div>
        </div>
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
            Images below these dimensions are rejected after download. Told to the LLM as a minimum and enforced server-side.
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
    return <PifSettingsForm settings={settings} isSaving={isSaving} onSave={handleSave} />;
  }

  return <CefSettingsForm />;
}
