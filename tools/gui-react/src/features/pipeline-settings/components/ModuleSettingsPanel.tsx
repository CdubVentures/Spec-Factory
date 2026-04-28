// Module Settings Panel — settings for finder modules.
// Branches on settingsScope from the generated registry:
//   - 'global'   → renders directly, no category required
//   - 'category' → requires a selected category; falls back to a "select a category" hint
// Form bodies are delegated to FinderSettingsRenderer which reads the schema from
// FINDER_SETTINGS_REGISTRY. Adding a new finder = one entry in src/core/finder/finderModuleRegistry.js
// + regenerate; no edits here.

import { useEffect, useMemo, useState } from 'react';
import { useUiCategoryStore } from '../../../stores/uiCategoryStore.ts';
import {
  MODULE_SETTINGS_SCOPE_BY_ID,
  type ModuleSettingsScope,
  type ModuleSettingsModuleId,
} from '../state/moduleSettingsSections.generated.ts';
import {
  getFinderSettingsEntryScopeOptions,
  hasMixedFinderSettingsEntryScopes,
  type FinderSettingsEntryScope,
  type FinderSettingsEntryScopeOption,
} from '../state/moduleSettingsEntryScope.ts';
import { FinderSettingsRenderer } from './FinderSettingsRenderer.tsx';

export function ModuleSettingsPanel({ moduleId }: { moduleId: ModuleSettingsModuleId }) {
  const category = useUiCategoryStore((s) => s.category);
  const scope = MODULE_SETTINGS_SCOPE_BY_ID[moduleId] ?? 'category';
  const entryScopeOptions = useMemo(() => getFinderSettingsEntryScopeOptions(moduleId), [moduleId]);
  const hasScopeSplit = hasMixedFinderSettingsEntryScopes(moduleId);
  const defaultEntryScope = entryScopeOptions[0]?.scope ?? scope;
  const [activeEntryScope, setActiveEntryScope] = useState<FinderSettingsEntryScope>(defaultEntryScope);

  useEffect(() => {
    if (entryScopeOptions.some((option) => option.scope === activeEntryScope)) return;
    setActiveEntryScope(defaultEntryScope);
  }, [activeEntryScope, defaultEntryScope, entryScopeOptions]);

  if (!hasScopeSplit && scope === 'category' && !category) {
    return (
      <p className="sf-text-caption sf-text-muted">
        Select a category to configure module settings.
      </p>
    );
  }

  if (hasScopeSplit) {
    return (
      <ScopedModuleSettingsPanel
        moduleId={moduleId}
        category={category}
        activeScope={activeEntryScope}
        options={entryScopeOptions}
        onSelectScope={setActiveEntryScope}
      />
    );
  }

  return <FinderSettingsRenderer finderId={moduleId} category={category} />;
}

function ScopedModuleSettingsPanel({
  moduleId,
  category,
  activeScope,
  options,
  onSelectScope,
}: {
  moduleId: ModuleSettingsModuleId;
  category: string;
  activeScope: FinderSettingsEntryScope;
  options: readonly FinderSettingsEntryScopeOption[];
  onSelectScope: (scope: FinderSettingsEntryScope) => void;
}) {
  const activeOption = options.find((option) => option.scope === activeScope) ?? options[0];
  const canRenderScope = activeScope === 'global' || Boolean(category);

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
        <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide sf-text-muted">
          Product Image Finder
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          {options.map((option) => (
            <ScopeNavButton
              key={option.scope}
              option={option}
              active={activeScope === option.scope}
              category={category}
              onClick={() => onSelectScope(option.scope)}
            />
          ))}
        </div>
      </aside>

      <section className="space-y-3 rounded sf-surface-elevated p-3 md:p-4 min-h-0 overflow-x-hidden overflow-y-auto">
        {activeOption ? (
          <header className="rounded sf-surface-elevated px-3 py-3">
            <div className="flex items-start gap-2">
              <ScopeIcon scope={activeOption.scope} active />
              <div className="min-w-0">
                <h3 className="text-base font-semibold sf-text-primary">{activeOption.label}</h3>
                <p className="sf-text-label sf-text-muted">
                  {activeOption.scope === 'category' && category
                    ? `${activeOption.subtitle}: ${category}`
                    : activeOption.subtitle}
                </p>
              </div>
            </div>
          </header>
        ) : null}

        {canRenderScope ? (
          <FinderSettingsRenderer
            finderId={moduleId}
            category={category}
            entryScope={activeScope}
            settingsScopeOverride={activeScope as ModuleSettingsScope}
          />
        ) : (
          <p className="sf-text-caption sf-text-muted">
            Select a category to configure per-category module settings.
          </p>
        )}
      </section>
    </div>
  );
}

function ScopeNavButton({
  option,
  active,
  category,
  onClick,
}: {
  option: FinderSettingsEntryScopeOption;
  active: boolean;
  category: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${active ? 'sf-nav-item-active' : ''}`}
    >
      <div className="flex items-start gap-2">
        <ScopeIcon scope={option.scope} active={active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="sf-text-label font-semibold leading-5">
              {option.label}
            </div>
            {option.scope === 'category' && category ? (
              <span className="sf-chip-info text-[8px] px-1 rounded-sm font-mono uppercase">
                {category}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 sf-text-caption leading-4 sf-text-muted">
            {option.subtitle}
          </p>
        </div>
      </div>
    </button>
  );
}

function ScopeIcon({ scope, active }: { scope: FinderSettingsEntryScope; active: boolean }) {
  const toneClass = active ? 'sf-callout sf-callout-info' : 'sf-callout sf-callout-neutral';
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {scope === 'global' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18" />
            <path d="M12 3a14 14 0 0 0 0 18" />
          </>
        ) : (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M4 10h16" />
            <path d="M10 4v16" />
          </>
        )}
      </svg>
    </span>
  );
}
