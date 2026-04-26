import type { FinderSettingWidgetProps } from './widgetRegistry.ts';
import { NumberStepper } from '../../../../shared/ui/forms/NumberStepper.tsx';

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

const CATEGORY_VIEW_BUDGET_DEFAULTS: Record<string, string[]> = {
  mouse: ['top', 'left', 'angle', 'sangle', 'front', 'bottom'],
  keyboard: ['top', 'left', 'angle', 'sangle'],
  monitor: ['front', 'angle', 'rear', 'left'],
  mousepad: ['top', 'angle'],
};

const CATEGORY_VIEW_ATTEMPT_DEFAULTS: Record<string, Record<string, number>> = {
  mouse: { top: 4, left: 4, angle: 3, sangle: 3, front: 2, bottom: 2 },
  keyboard: { top: 4, left: 4, angle: 3, sangle: 3 },
  monitor: { front: 4, angle: 4, rear: 3, left: 3 },
  mousepad: { top: 4, angle: 4 },
};

export function ViewBudgetEditor({ entry, value, allSettings, category, isSaving, onSave }: FinderSettingWidgetProps) {
  const defaultBudget = CATEGORY_VIEW_BUDGET_DEFAULTS[category] || ['top', 'left', 'angle'];
  const isUsingDefaults = !value || !value.trim();

  let currentBudget: string[];
  try {
    const parsed = JSON.parse(value || '[]');
    currentBudget = Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultBudget;
  } catch {
    currentBudget = defaultBudget;
  }

  const budgetSet = new Set(currentBudget);

  const handleToggle = (key: string) => {
    const next = new Set(budgetSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSave(entry.key, JSON.stringify([...next]));
  };

  const handleReset = () => onSave(entry.key, '');

  const catAttemptDefaults = CATEGORY_VIEW_ATTEMPT_DEFAULTS[category] || {};
  const flatAttemptFallback = parseInt(allSettings.viewAttemptBudget || '5', 10) || 5;
  let attemptOverrides: Record<string, number> = {};
  try {
    const parsed = JSON.parse(allSettings.viewAttemptBudgets || '{}');
    attemptOverrides = typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { /* use empty */ }

  const getAttemptVal = (view: string): number => {
    const fromOverride = attemptOverrides[view];
    if (fromOverride !== undefined && fromOverride !== null) return Math.max(1, Number(fromOverride));
    const fromCat = catAttemptDefaults[view];
    if (fromCat !== undefined) return fromCat;
    return Math.max(1, flatAttemptFallback);
  };

  const handleAttemptChange = (view: string, next: string) => {
    const updated = { ...attemptOverrides, [view]: Math.max(1, Number(next) || 1) };
    onSave('viewAttemptBudgets', JSON.stringify(updated));
  };

  const budgetedViews = CANONICAL_VIEWS.filter((v) => budgetSet.has(v.key));
  const activeCount = budgetSet.size;
  const totalViews = CANONICAL_VIEWS.length;

  return (
    <div className="space-y-4">
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
                background: 'var(--sf-accent)',
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
            className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Reset to defaults
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CANONICAL_VIEWS.map((v) => {
          const active = budgetSet.has(v.key);
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

      {budgetedViews.length > 0 && (
        <div className="rounded-lg border sf-border-soft p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
              Attempts per View
            </span>
            <span className="flex-1 h-px sf-border-soft" style={{ borderTop: '1px solid' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {budgetedViews.map((v) => (
              <div
                key={v.key}
                className="flex items-center justify-between gap-2 rounded border sf-border-soft px-2.5 py-1.5"
              >
                <span className="text-[11px] sf-text-primary font-medium truncate">{v.label}</span>
                <NumberStepper
                  value={String(getAttemptVal(v.key))}
                  onCommit={(val) => {
                    if (Number(val) !== getAttemptVal(v.key)) handleAttemptChange(v.key, val);
                  }}
                  disabled={isSaving}
                  min={1}
                  max={20}
                  compact
                  ariaLabel={`${v.label} attempts`}
                  className="w-20 shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
