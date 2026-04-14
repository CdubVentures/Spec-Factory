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
        className={`rounded border ${isPriority ? 'sf-border-default sf-surface-elevated' : 'sf-border-soft'}`}
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
              className="sf-checkbox w-4 h-4 cursor-pointer"
            />
            {isPriority && (
              <span className="text-[11px] font-semibold sf-text-muted tabular-nums">
                #{priorityIdx! + 1}
              </span>
            )}
          </label>

          {/* View name */}
          <span className={`font-semibold text-[13px] ${isPriority ? 'sf-text-primary' : 'sf-text-muted'}`}>
            {canonLabel}
          </span>

          {/* Priority reorder arrows */}
          {isPriority && (
            <>
              <button
                onClick={() => handleMovePriority(view.key, -1)}
                disabled={isSaving || priorityIdx === 0}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30 sf-text-muted"
                title="Move up in priority"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => handleMovePriority(view.key, 1)}
                disabled={isSaving || priorityIdx === priorityViews.length - 1}
                className="sf-btn-ghost px-1 py-0.5 rounded text-[11px] disabled:opacity-30 sf-text-muted"
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
            className="sf-btn-ghost px-1.5 py-0.5 rounded text-[11px] sf-text-muted"
          >
            {isExpanded ? 'collapse' : 'edit description'}
          </button>
        </div>

        {/* Description preview (collapsed) */}
        {!isExpanded && (
          <div className="px-3 pb-2">
            <p className="text-[11px] truncate sf-text-muted">
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
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px] resize-y min-h-14"
              placeholder="Describe what this angle looks like so the LLM finds and classifies shots correctly..."
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
      {/* Priority section */}
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">
        Priority Views
      </div>
      <p className="sf-text-caption sf-text-muted mb-2">
        The LLM searches for these views first. Use the checkbox to toggle priority. Reorder with arrows.
      </p>
      <div className="space-y-1.5">
        {priorityViews.map((v, i) => renderViewRow(v, true, i))}
      </div>

      {additionalViews.length > 0 && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] sf-text-muted mt-4 mb-1">
            Additional Views
          </div>
          <p className="sf-text-caption sf-text-muted mb-2">
            These angles are recognized opportunistically. Use the checkbox to promote to priority.
          </p>
          <div className="space-y-1.5">
            {additionalViews.map(v => renderViewRow(v, false))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Settings Card ───────────────────────────────────────────────── */

function SettingsCard({
  title,
  subtitle,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="sf-surface-elevated border sf-border-soft rounded-lg p-4 space-y-3">
      <header className="flex items-center gap-3 flex-wrap">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">{title}</h3>
        {subtitle && <span className="text-[10px] sf-text-muted">{subtitle}</span>}
        <div className="flex-1" />
        {trailing}
      </header>
      {children}
    </section>
  );
}

/* ── Eval Token Estimate ─────────────────────────────────────────── */

/** WHY: Claude vision tiles images into 512×512 blocks (~170 tokens each).
 *  This lets the user see the cost jump at tile boundaries (512 → 1024 → 1536). */
const TILE_SIZE = 512;
const TOKENS_PER_TILE = 170;

const TILE_BRACKETS: readonly { max: number; label: string }[] = [
  { max: 512,  label: '1–512' },
  { max: 1024, label: '513–1024' },
  { max: 1536, label: '1025–1536' },
];

function EvalTokenEstimate({ size }: { size: number }) {
  const clamped = Math.max(256, Math.min(1536, size));
  const tilesPerSide = Math.ceil(clamped / TILE_SIZE);
  const tiles = tilesPerSide * tilesPerSide;
  const tokensPerImage = tiles * TOKENS_PER_TILE;

  // Find the current bracket and the ceiling (max size at same tile cost)
  const ceiling = tilesPerSide * TILE_SIZE;

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Token Estimate</div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="sf-text-muted">Thumbnail</span>
          <span className="sf-text-primary font-medium">{clamped}&times;{clamped} px</span>
        </div>
        <div className="flex justify-between">
          <span className="sf-text-muted">Tiles ({TILE_SIZE}px each)</span>
          <span className="sf-text-primary font-medium">{tiles} ({tilesPerSide}&times;{tilesPerSide})</span>
        </div>
        <div className="flex justify-between border-t sf-border-soft pt-1">
          <span className="sf-text-muted">~Tokens / image</span>
          <span className="sf-text-primary font-semibold">{tokensPerImage.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="sf-text-muted">~Tokens / 4 candidates</span>
          <span className="sf-text-primary font-semibold">{(tokensPerImage * 4).toLocaleString()}</span>
        </div>
      </div>
      {clamped < ceiling && (
        <p className="text-[9px] sf-text-muted leading-snug italic pt-0.5">
          Same cost up to {ceiling}px &mdash; {ceiling} uses the same {tiles}-tile grid.
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
    <div className="space-y-4">
      {/* ── Authentication ── */}
      <SettingsCard title="Authentication" subtitle="Credentials for gated model downloads">
        <div>
          <label className="block text-[11px] font-semibold sf-text-primary mb-1.5">
            HuggingFace Token
          </label>
          <input
            type="password"
            value={settings.hfToken ?? ''}
            onChange={(e) => onSave('hfToken', e.target.value)}
            disabled={isSaving}
            placeholder="hf_..."
            autoComplete="off"
            className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px] font-mono"
          />
          <p className="mt-1.5 text-[10px] sf-text-muted leading-snug">
            Access token for downloading the RMBG 2.0 background-removal model from HuggingFace (gated).
            Get one at <span className="sf-text-accent">huggingface.co/settings/tokens</span>.
          </p>
        </div>
      </SettingsCard>

      {/* ── Loop View Budget (Carousel Placeholders) ── */}
      <SettingsCard
        title="Loop View Budget"
        subtitle="Carousel Placeholders"
      >
        <ViewBudgetEditor
          viewBudget={settings.viewBudget || ''}
          category={category}
          isSaving={isSaving}
          onSave={(val) => onSave('viewBudget', val)}
          viewAttemptBudgets={settings.viewAttemptBudgets ?? ''}
          viewAttemptBudget={settings.viewAttemptBudget ?? '5'}
          onAttemptBudgetSave={(val) => onSave('viewAttemptBudgets', val)}
          heroEnabled={settings.heroEnabled !== 'false'}
          onHeroEnabledChange={(val) => onSave('heroEnabled', val ? 'true' : 'false')}
          heroCount={settings.heroCount ?? '3'}
          onHeroCountChange={(val) => onSave('heroCount', val)}
          heroAttemptBudget={settings.heroAttemptBudget ?? '3'}
          onHeroAttemptBudgetChange={(val) => onSave('heroAttemptBudget', val)}
        />
      </SettingsCard>

      {/* ── View Configuration ── */}
      <SettingsCard
        title="View Configuration"
        trailing={
          isDefaults ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full sf-text-info sf-surface-elevated">
              Using {category} defaults
            </span>
          ) : (
            <button
              onClick={handleResetToDefaults}
              disabled={isSaving}
              className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted"
            >
              Reset to {category} defaults
            </button>
          )
        }
      >
        <ViewConfigEditor
          views={localViews}
          category={category}
          isSaving={isSaving}
          onChange={handleViewConfigChange}
        />
      </SettingsCard>

      {/* ── Image Quality ── */}
      <SettingsCard
        title="Image Quality"
        subtitle="Per-view minimum dimensions based on natural aspect ratio"
      >
        <ViewQualityGrid
          viewQualityConfig={settings.viewQualityConfig || ''}
          category={category}
          isSaving={isSaving}
          onSave={(val) => onSave('viewQualityConfig', val)}
        />
      </SettingsCard>

      {/* ── Search Behavior ── */}
      <SettingsCard title="Search Behavior">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold sf-text-primary mb-1.5">
              Satisfaction Threshold
            </label>
            <input
              type="number"
              value={settings.satisfactionThreshold ?? '3'}
              onChange={(e) => onSave('satisfactionThreshold', e.target.value)}
              disabled={isSaving}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px]"
              min="1"
              max="10"
            />
            <p className="mt-1.5 text-[10px] sf-text-muted leading-snug">
              Quality images per view before it&apos;s considered filled.
            </p>
          </div>
          <div>
            <label
              className="block text-[11px] font-semibold sf-text-primary mb-1.5"
              title="LLM calls per view when re-running a variant that already has all views satisfied. Applies to both view and hero calls."
            >
              Re-run Budget
            </label>
            <input
              type="number"
              value={settings.reRunBudget ?? '1'}
              onChange={(e) => onSave('reRunBudget', e.target.value)}
              disabled={isSaving}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px]"
              min="0"
              max="5"
            />
            <p className="mt-1.5 text-[10px] sf-text-muted leading-snug">
              Extra calls for already-satisfied views on re-loop. 0 = skip.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* ── Vision Evaluation ── */}
      <SettingsCard title="Vision Evaluation" subtitle="Thumbnail size for carousel builder eval calls">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div>
            <label className="block text-[11px] font-semibold sf-text-primary mb-1.5">
              Eval Thumbnail Size
            </label>
            <input
              type="number"
              value={settings.evalThumbSize ?? '768'}
              onChange={(e) => onSave('evalThumbSize', e.target.value)}
              disabled={isSaving}
              className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px]"
              min="256"
              max="1536"
              step="128"
            />
            <p className="mt-1.5 text-[10px] sf-text-muted leading-snug">
              Max dimension (px) for thumbnails sent to the vision model.
              Larger captures finer watermarks &amp; sharpness but costs more tokens.
            </p>
          </div>
          <EvalTokenEstimate size={parseInt(settings.evalThumbSize || '768', 10) || 768} />
        </div>
      </SettingsCard>

      {/* ── Prompt Configuration ── */}
      <SettingsCard title="Prompt Configuration" subtitle="Override the default LLM instructions">
        <PromptOverrideEditor
          label="View Prompt Instructions"
          value={settings.viewPromptOverride || ''}
          isSaving={isSaving}
          onSave={(val) => onSave('viewPromptOverride', val)}
        />
        <PromptOverrideEditor
          label="Hero Prompt Instructions"
          value={settings.heroPromptOverride || ''}
          isSaving={isSaving}
          onSave={(val) => onSave('heroPromptOverride', val)}
        />
        <PromptOverrideEditor
          label="Eval View Prompt Instructions"
          value={settings.evalPromptOverride || ''}
          isSaving={isSaving}
          onSave={(val) => onSave('evalPromptOverride', val)}
        />
        <PromptOverrideEditor
          label="Eval Hero Prompt Instructions"
          value={settings.heroEvalPromptOverride || ''}
          isSaving={isSaving}
          onSave={(val) => onSave('heroEvalPromptOverride', val)}
        />
      </SettingsCard>
    </div>
  );
}

/* ── View Quality Grid ────────────────────────────────────────────── */

interface ViewQualityEntry {
  minWidth: number;
  minHeight: number;
  minFileSize: number;
}

const CATEGORY_VIEW_QUALITY_DEFAULTS: Record<string, Record<string, ViewQualityEntry>> = {
  mouse: {
    top: { minWidth: 300, minHeight: 600, minFileSize: 30000 },
    bottom: { minWidth: 300, minHeight: 600, minFileSize: 30000 },
    left: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    right: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    front: { minWidth: 400, minHeight: 600, minFileSize: 30000 },
    rear: { minWidth: 400, minHeight: 600, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  monitor: {
    front: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    rear: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    left: { minWidth: 250, minHeight: 600, minFileSize: 30000 },
    right: { minWidth: 250, minHeight: 600, minFileSize: 30000 },
    top: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  keyboard: {
    top: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    left: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    right: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    front: { minWidth: 600, minHeight: 200, minFileSize: 30000 },
    rear: { minWidth: 600, minHeight: 200, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  mousepad: {
    top: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    left: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    right: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    front: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    rear: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    sangle: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
  },
};

const GENERIC_VQ_DEFAULT: ViewQualityEntry = { minWidth: 600, minHeight: 400, minFileSize: 30000 };

const VIEW_LABELS: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right',
  front: 'Front', rear: 'Rear', sangle: 'S-Angle', angle: 'Angle', hero: 'Hero',
};

const ALL_QUALITY_VIEWS = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'hero'];

function ViewQualityGrid({
  viewQualityConfig,
  category,
  isSaving,
  onSave,
}: {
  viewQualityConfig: string;
  category: string;
  isSaving: boolean;
  onSave: (val: string) => void;
}) {
  const catDefaults = CATEGORY_VIEW_QUALITY_DEFAULTS[category] || {};
  const isUsingDefaults = !viewQualityConfig || !viewQualityConfig.trim();

  let currentConfig: Record<string, Partial<ViewQualityEntry>>;
  try {
    const parsed = JSON.parse(viewQualityConfig || '{}');
    currentConfig = typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    currentConfig = {};
  }

  const getVal = (view: string, field: keyof ViewQualityEntry): number => {
    const override = currentConfig[view]?.[field];
    if (override !== undefined && override !== null) return Number(override);
    return (catDefaults[view] ?? GENERIC_VQ_DEFAULT)[field];
  };

  const handleChange = (view: string, field: keyof ViewQualityEntry, value: string) => {
    const next = { ...currentConfig };
    if (!next[view]) next[view] = {};
    next[view] = { ...next[view], [field]: Number(value) };
    onSave(JSON.stringify(next));
  };

  const handleReset = () => onSave('');

  return (
    <div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="sf-text-muted">
            <th className="text-left py-2 pl-2 pr-2 font-semibold border sf-border-soft">View</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min Width</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min Height</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min File Size</th>
          </tr>
        </thead>
        <tbody>
          {ALL_QUALITY_VIEWS.map((view) => (
            <tr key={view} className="sf-text-primary">
              <td className="py-1.5 pl-2 pr-2 font-medium border sf-border-soft">{VIEW_LABELS[view] ?? view}</td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minWidth')}
                  onChange={(e) => handleChange(view, 'minWidth', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="0"
                  max="4000"
                />
              </td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minHeight')}
                  onChange={(e) => handleChange(view, 'minHeight', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="0"
                  max="4000"
                />
              </td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minFileSize')}
                  onChange={(e) => handleChange(view, 'minFileSize', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="0"
                  max="10000000"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-2 mt-1">
        {isUsingDefaults ? (
          <span className="text-[10px] sf-text-muted">Using {category} defaults</span>
        ) : (
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="text-[10px] px-1.5 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Reset to {category} defaults
          </button>
        )}
      </div>
    </div>
  );
}

/* ── View Budget Editor ──────────────────────────────────────────── */

const CATEGORY_VIEW_BUDGET_DEFAULTS: Record<string, string[]> = {
  mouse:    ['top', 'left', 'angle', 'sangle', 'front', 'bottom'],
  keyboard: ['top', 'left', 'angle', 'sangle'],
  monitor:  ['front', 'angle', 'rear', 'left'],
  mousepad: ['top', 'angle'],
};

/* ── Per-View Attempt Budget defaults (mirrors backend viewAttemptDefaults.js) ── */

const CATEGORY_VIEW_ATTEMPT_DEFAULTS: Record<string, Record<string, number>> = {
  mouse:    { top: 4, left: 4, angle: 3, sangle: 3, front: 2, bottom: 2 },
  keyboard: { top: 4, left: 4, angle: 3, sangle: 3 },
  monitor:  { front: 4, angle: 4, rear: 3, left: 3 },
  mousepad: { top: 4, angle: 4 },
};


function ViewBudgetEditor({
  viewBudget,
  category,
  isSaving,
  onSave,
  viewAttemptBudgets,
  viewAttemptBudget,
  onAttemptBudgetSave,
  heroEnabled,
  onHeroEnabledChange,
  heroCount,
  onHeroCountChange,
  heroAttemptBudget: heroAttemptBudgetProp,
  onHeroAttemptBudgetChange,
}: {
  viewBudget: string;
  category: string;
  isSaving: boolean;
  onSave: (val: string) => void;
  viewAttemptBudgets: string;
  viewAttemptBudget: string;
  onAttemptBudgetSave: (val: string) => void;
  heroEnabled: boolean;
  onHeroEnabledChange: (val: boolean) => void;
  heroCount: string;
  onHeroCountChange: (val: string) => void;
  heroAttemptBudget: string;
  onHeroAttemptBudgetChange: (val: string) => void;
}) {
  const defaultBudget = CATEGORY_VIEW_BUDGET_DEFAULTS[category] || ['top', 'left', 'angle'];
  const isUsingDefaults = !viewBudget || !viewBudget.trim();

  let currentBudget: string[];
  try {
    const parsed = JSON.parse(viewBudget || '[]');
    currentBudget = Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultBudget;
  } catch {
    currentBudget = defaultBudget;
  }

  const budgetSet = new Set(currentBudget);

  const handleToggle = (key: string) => {
    const next = new Set(budgetSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSave(JSON.stringify([...next]));
  };

  const handleReset = () => onSave('');

  // Per-view attempt budgets
  const catAttemptDefaults = CATEGORY_VIEW_ATTEMPT_DEFAULTS[category] || {};
  const flatAttemptFallback = parseInt(viewAttemptBudget || '5', 10) || 5;
  let attemptOverrides: Record<string, number> = {};
  try {
    const parsed = JSON.parse(viewAttemptBudgets || '{}');
    attemptOverrides = typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { /* use empty */ }

  const getAttemptVal = (view: string): number => {
    const fromOverride = attemptOverrides[view];
    if (fromOverride !== undefined && fromOverride !== null) return Math.max(1, Number(fromOverride));
    const fromCat = catAttemptDefaults[view];
    if (fromCat !== undefined) return fromCat;
    return Math.max(1, flatAttemptFallback);
  };

  const handleAttemptChange = (view: string, value: string) => {
    const next = { ...attemptOverrides, [view]: Math.max(1, Number(value) || 1) };
    onAttemptBudgetSave(JSON.stringify(next));
  };

  const budgetedViews = CANONICAL_VIEWS.filter(v => budgetSet.has(v.key));

  const activeCount = budgetSet.size;
  const totalViews = CANONICAL_VIEWS.length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold sf-text-primary">
            {activeCount} of {totalViews} views active
          </span>
          <span className="w-24 h-1.5 rounded-full sf-surface-panel overflow-hidden inline-block">
            <span
              className="block h-full rounded-full transition-all duration-300"
              style={{
                width: `${(activeCount / totalViews) * 100}%`,
                background: 'var(--sf-accent, #4263eb)',
              }}
            />
          </span>
        </div>
        {isUsingDefaults ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full sf-text-info sf-surface-elevated">
            {category} defaults
          </span>
        ) : (
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted hover:sf-text-primary"
          >
            Reset to defaults
          </button>
        )}
      </div>

      {/* View toggle grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CANONICAL_VIEWS.map((v) => {
          const active = budgetSet.has(v.key);
          return (
            <label
              key={v.key}
              className={`flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 border transition-all ${
                active
                  ? 'sf-border-default sf-surface-elevated shadow-sm'
                  : 'sf-border-soft opacity-60 hover:opacity-80'
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

      {/* Per-view attempt budgets */}
      {budgetedViews.length > 0 && (
        <div className="rounded-lg border sf-border-soft p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
              Attempts per View
            </div>
            <span className="flex-1 h-px sf-border-soft" style={{ borderTop: '1px solid' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {budgetedViews.map(v => (
              <div
                key={v.key}
                className="flex items-center justify-between gap-2 rounded border sf-border-soft px-2.5 py-1.5"
              >
                <span className="text-[11px] sf-text-primary font-medium truncate">{v.label}</span>
                <input
                  type="number"
                  value={getAttemptVal(v.key)}
                  onChange={(e) => handleAttemptChange(v.key, e.target.value)}
                  disabled={isSaving}
                  className="sf-input w-[40px] px-1 py-0.5 rounded text-[11px] text-center font-mono sf-text-label [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="1"
                  max="20"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero slots */}
      <div className="rounded-lg border sf-border-soft p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
            Hero Slots
          </div>
          <span className="flex-1 h-px sf-border-soft" style={{ borderTop: '1px solid' }} />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={heroEnabled}
              onChange={(e) => onHeroEnabledChange(e.target.checked)}
              disabled={isSaving}
              className="sf-checkbox w-3.5 h-3.5"
            />
            <span className={`text-[10px] font-semibold ${heroEnabled ? 'sf-text-primary' : 'sf-text-muted'}`}>
              Enabled
            </span>
          </label>
        </div>
        {heroEnabled && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2 rounded border sf-border-soft px-2.5 py-1.5">
              <span className="text-[11px] sf-text-primary font-medium">Hero Count</span>
              <input
                type="number"
                value={heroCount}
                onChange={(e) => onHeroCountChange(e.target.value)}
                disabled={isSaving}
                className="sf-input w-[40px] px-1 py-0.5 rounded text-[11px] text-center font-mono sf-text-label [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                min="1"
                max="5"
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded border sf-border-soft px-2.5 py-1.5">
              <span className="text-[11px] sf-text-primary font-medium">Attempt Budget</span>
              <input
                type="number"
                value={heroAttemptBudgetProp}
                onChange={(e) => onHeroAttemptBudgetChange(e.target.value)}
                disabled={isSaving}
                className="sf-input w-[40px] px-1 py-0.5 rounded text-[11px] text-center font-mono sf-text-label [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                min="1"
                max="10"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Prompt Override Editor ──────────────────────────────────────── */

function PromptOverrideEditor({
  label,
  value,
  isSaving,
  onSave,
}: {
  label: string;
  value: string;
  isSaving: boolean;
  onSave: (val: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOverride = Boolean(value.trim());

  return (
    <div className="rounded border sf-border-soft overflow-hidden mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        type="button"
        className="w-full flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span
          className="text-[10px] sf-text-muted shrink-0 transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
        >
          {'\u25B6'}
        </span>
        <span className="text-[11px] font-semibold sf-text-primary">{label}</span>
        <div className="flex-1" />
        {hasOverride ? (
          <span
            onClick={(e) => { e.stopPropagation(); onSave(''); }}
            className="text-[10px] px-1.5 py-0.5 rounded sf-btn-ghost sf-text-muted cursor-pointer"
          >
            Clear Override
          </span>
        ) : (
          <span className="text-[10px] sf-text-muted">Using default</span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t sf-border-soft">
          <textarea
            value={value}
            onChange={(e) => onSave(e.target.value)}
            disabled={isSaving}
            placeholder="Leave empty to use the built-in default prompt. Edit to customize the instruction block."
            className="sf-input w-full px-3 py-2 mt-3 rounded sf-text-label font-mono text-[11px] leading-relaxed resize-y"
            rows={8}
          />
        </div>
      )}
    </div>
  );
}

/* ── CEF Settings ────────────────────────────────────────────────── */

function CefSettingsForm({
  settings,
  isSaving,
  onSave,
}: {
  settings: Record<string, string>;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SettingsCard title="Cooldown">
        <div className="max-w-xs">
          <label className="block text-[11px] font-semibold sf-text-primary mb-1.5">
            Cooldown Days
          </label>
          <input
            type="number"
            value={settings.cooldownDays ?? '30'}
            onChange={(e) => onSave('cooldownDays', e.target.value)}
            disabled={isSaving}
            className="sf-input w-full px-2 py-1.5 rounded sf-text-label text-[12px]"
            min="0"
            max="90"
          />
          <p className="mt-1.5 text-[10px] sf-text-muted leading-snug">
            Days before the finder can re-run on the same product. Set to 0 to disable cooldown.
          </p>
        </div>
      </SettingsCard>
    </div>
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
      <p className="sf-text-caption sf-text-muted">
        Select a category to configure module settings.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="sf-text-caption sf-text-muted">
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

  return (
    <CefSettingsForm
      settings={settings}
      isSaving={isSaving}
      onSave={handleSave}
    />
  );
}
