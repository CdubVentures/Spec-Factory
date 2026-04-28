import { useMemo } from 'react';
import { NumberStepper } from '../../../../shared/ui/forms/NumberStepper.tsx';
import type { FinderSettingWidgetProps } from './widgetRegistry.ts';
import {
  CAROUSEL_CANONICAL_VIEWS,
  buildCarouselExtraTargetPayload,
  buildCarouselViewTogglePayload,
  resolveCarouselScoringState,
  type CarouselViewKey,
} from './carouselScoringModel.ts';

export function CarouselScoringEditor({
  entry,
  value,
  allSettings,
  category,
  isSaving,
  onSaveSettings,
}: FinderSettingWidgetProps) {
  const state = useMemo(
    () => resolveCarouselScoringState({
      scoredValue: value,
      optionalValue: allSettings.carouselOptionalViews ?? '',
      extraTargetValue: allSettings.carouselExtraTarget ?? '',
      viewBudgetValue: allSettings.viewBudget ?? '',
      category,
    }),
    [
      allSettings.carouselExtraTarget,
      allSettings.carouselOptionalViews,
      allSettings.viewBudget,
      category,
      value,
    ],
  );

  const scoredSet = useMemo(() => new Set(state.scoredViews), [state.scoredViews]);
  const optionalSet = useMemo(() => new Set(state.optionalViews), [state.optionalViews]);
  const label = entry.uiLabel ?? 'Carousel Scoring';
  const summary = `${state.scoredViews.length} target views, ${state.optionalViews.length} placeholders`;

  const handleTargetToggle = (view: CarouselViewKey) => {
    onSaveSettings(buildCarouselViewTogglePayload({ state, view, column: 'scored' }));
  };

  const handleOptionalToggle = (view: CarouselViewKey) => {
    onSaveSettings(buildCarouselViewTogglePayload({ state, view, column: 'optional' }));
  };

  const handleExtraTargetCommit = (next: string) => {
    onSaveSettings(buildCarouselExtraTargetPayload(next));
  };

  const handleUseViewBudget = () => {
    onSaveSettings({ carouselScoredViews: '' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <span className="sf-text-label sf-text-primary">{label}</span>
          <p className="sf-text-caption sf-text-muted">{summary}</p>
        </div>
        {!state.usesViewBudget && (
          <button
            type="button"
            onClick={handleUseViewBudget}
            disabled={isSaving}
            className="text-[10px] px-2 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Use View Budget
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-2">
        {CAROUSEL_CANONICAL_VIEWS.map((view) => {
          const scored = scoredSet.has(view.key);
          const optional = optionalSet.has(view.key);
          const targetDisabled = isSaving || optional || (scored && state.scoredViews.length <= 1);
          const optionalDisabled = isSaving || scored;

          return (
            <div
              key={view.key}
              className={`rounded border px-3 py-2 space-y-2 ${
                scored || optional ? 'sf-border-default sf-surface-elevated shadow-sm' : 'sf-border-soft opacity-70'
              }`}
            >
              <div className={`text-[11px] font-semibold truncate ${scored || optional ? 'sf-text-primary' : 'sf-text-muted'}`}>
                {view.label}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center gap-1.5 rounded border sf-border-soft px-2 py-1.5 ${
                  targetDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${scored ? 'sf-surface-panel' : ''}`}>
                  <input
                    type="checkbox"
                    checked={scored}
                    onChange={() => handleTargetToggle(view.key)}
                    disabled={targetDisabled}
                    className="sf-checkbox w-3.5 h-3.5 shrink-0"
                  />
                  <span className={`text-[10px] font-medium whitespace-nowrap ${scored ? 'sf-text-primary' : 'sf-text-muted'}`}>
                    Target
                  </span>
                </label>
                <label className={`flex items-center gap-1.5 rounded border sf-border-soft px-2 py-1.5 ${
                  optionalDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${optional ? 'sf-surface-panel' : ''}`}>
                  <input
                    type="checkbox"
                    checked={optional}
                    onChange={() => handleOptionalToggle(view.key)}
                    disabled={optionalDisabled}
                    className="sf-checkbox w-3.5 h-3.5 shrink-0"
                  />
                  <span className={`text-[10px] font-medium whitespace-nowrap ${optional ? 'sf-text-primary' : 'sf-text-muted'}`}>
                    Placeholder
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded border sf-border-soft px-3 py-2">
        <div className="space-y-0.5">
          <span className="sf-text-label sf-text-primary">Additional images</span>
          <p className="sf-text-caption sf-text-muted">Inner ring target</p>
        </div>
        <NumberStepper
          value={String(state.extraTarget)}
          onCommit={handleExtraTargetCommit}
          disabled={isSaving}
          min={0}
          max={20}
          compact
          ariaLabel="additional image target"
          className="w-24"
        />
      </div>
    </div>
  );
}
