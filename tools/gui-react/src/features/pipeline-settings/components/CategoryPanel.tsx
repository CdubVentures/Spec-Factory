// WHY: Renders a full settings category with two-column layout.
// Column 1: styled nav sidebar with icons (select one section).
// Column 2: header card + settings for the SELECTED section only.

import { Suspense, lazy } from 'react';
import { GenericSectionPanel } from './GenericSectionPanel.tsx';
import { findCategory } from '../state/SettingsCategoryRegistry.ts';
import type { SettingsCategoryId, SettingsSectionDef } from '../state/SettingsCategoryRegistry.ts';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';

const TierHierarchyPanel = lazy(() => import('../sections/TierHierarchyPanel.tsx'));

export interface CategoryPanelProps {
  categoryId: SettingsCategoryId;
  runtimeDraft: Record<string, unknown>;
  onBoolChange: (key: string, next: boolean) => void;
  onNumberChange: (key: string, eventValue: string, bounds: NumberBound) => void;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

// WHY: SVG icon per section — one icon per settings section.
function SectionIcon({ sectionId, active }: { sectionId: string; active: boolean }) {
  const toneClass = active ? 'sf-callout sf-callout-info' : 'sf-callout sf-callout-neutral';

  const iconPaths: Record<string, React.ReactNode> = {
    'run-setup': <><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></>,
    output: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>,
    'tier-hierarchy': <><path d="M3 6h18M3 12h18M3 18h18" /><path d="m7 3 2 3-2 3" /><path d="m7 9 2 3-2 3" /><path d="m7 15 2 3-2 3" /></>,
    needset: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    'brand-resolver': <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
    'search-profile': <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    'search-planner': <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    'search-execution': <><path d="M13 2 3 14h9l-1 8 10-12h-9Z" /></>,
    'serp-selector': <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="17" cy="6" r="2" fill="currentColor" /></>,
    'domain-classifier': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>,
    adapter: <><path d="M12 2v6M12 16v6M6 12H2M22 12h-4" /><circle cx="12" cy="12" r="4" /></>,
    observability: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    network: <><path d="M13 2 3 14h9l-1 8 10-12h-9Z" /></>,
    browser: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
    screenshots: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    provider: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><path d="M4 22v-7" /></>,
    models: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></>,
    limits: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></>,
    schema: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    // Fetch plugin sections
    'fetch-global': <><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></>,
    stealth: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></>,
    'cookie-consent': <><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><circle cx="8" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="15" r="1" fill="currentColor" /><circle cx="16" cy="11" r="1" fill="currentColor" /></>,
    'overlay-dismissal': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    'dom-expansion': <><path d="M12 3v18M3 12h18" /><rect x="5" y="5" width="14" height="14" rx="2" /></>,
    'css-override': <><path d="m4 17 6-6-6-6M12 19h8" /></>,
    'auto-scroll': <><path d="M12 3v18M6 15l6 6 6-6" /></>,
    capture: <><circle cx="12" cy="12" r="3" /><path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 2h6v2H9Z" /></>,
  };

  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconPaths[sectionId] ?? <circle cx="12" cy="12" r="3" />}
      </svg>
    </span>
  );
}

function SectionNavButton({
  section,
  active,
  onClick,
}: {
  section: SettingsSectionDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${active ? 'sf-nav-item-active' : ''}`}
    >
      <div className="flex items-start gap-2">
        <SectionIcon sectionId={section.id} active={active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="sf-text-label font-semibold leading-5 flex items-center gap-1.5">
              {section.label}
              {section.phase === 'pre-load' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 sf-text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} aria-label="Pre-load phase">
                  <path d="M8 1v5l3 2M8 1 5 6h6Z" /><path d="M4 9a5 5 0 1 0 8 0" />
                </svg>
              )}
              {section.phase === 'suite' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 sf-text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} aria-label="Dismiss suite">
                  <path d="M13.5 5.5A5.5 5.5 0 0 0 3 7" /><path d="M2.5 10.5A5.5 5.5 0 0 0 13 9" /><path d="m5 5-2 2-2-2" /><path d="m11 11 2-2 2 2" />
                </svg>
              )}
              {section.phase === 'scroll' && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 sf-text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} aria-label="Scroll phase">
                  <path d="M8 2v12M4 10l4 4 4-4" />
                </svg>
              )}
            </div>
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: active
                  ? 'rgb(var(--sf-color-accent-rgb))'
                  : 'rgb(var(--sf-color-border-subtle-rgb) / 0.7)',
              }}
              aria-hidden="true"
            />
          </div>
          {section.tip && (
            <p className="mt-0.5 sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
              {section.tip}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function CategoryPanel({
  categoryId,
  runtimeDraft,
  onBoolChange,
  onNumberChange,
  onStringChange,
  disabled = false,
}: CategoryPanelProps) {
  const category = findCategory(categoryId);
  const sections = category?.sections ?? [];
  const defaultSection = sections[0]?.id ?? '';

  const [rawActiveSection, setActiveSection] = usePersistedTab(
    `pipeline-settings:${categoryId}:section`,
    defaultSection,
  );

  // WHY: Persisted tab may hold a stale ID from a removed section. Resolve to
  // a valid section so column 1 always has an active highlight and column 2
  // always renders the matching settings panel.
  const activeSectionDef = sections.find((s) => s.id === rawActiveSection) ?? sections[0];
  const activeSection = activeSectionDef?.id ?? defaultSection;

  if (!category || sections.length === 0) return null;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Column 1: section sidebar — matches category panel style */}
      <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
        <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
          {category.label}
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          {sections.map((s) => (
            <SectionNavButton
              key={s.id}
              section={s}
              active={activeSection === s.id}
              onClick={() => setActiveSection(s.id)}
            />
          ))}
        </div>
      </aside>

      {/* Column 2: header + settings for selected section only */}
      <section className="space-y-3 rounded sf-surface-elevated p-3 md:p-4 min-h-0 overflow-x-hidden overflow-y-auto">
        {activeSectionDef && (
          <>
            {/* Section header card — matches category knob group header */}
            <header className="rounded sf-surface-elevated px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <SectionIcon sectionId={activeSectionDef.id} active />
                  <div>
                    <h3 className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
                      {activeSectionDef.label}
                    </h3>
                    {activeSectionDef.tip && (
                      <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                        {activeSectionDef.tip}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </header>

            {/* Settings for this section */}
            <div className="space-y-4">
              {activeSectionDef.customComponent === 'TierHierarchy' ? (
                <Suspense fallback={<p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading...</p>}>
                  <TierHierarchyPanel
                    runtimeDraft={runtimeDraft}
                    onStringChange={onStringChange}
                    disabled={disabled}
                  />
                </Suspense>
              ) : (
                <GenericSectionPanel
                  categoryId={categoryId}
                  sectionId={activeSection}
                  runtimeDraft={runtimeDraft}
                  onBoolChange={onBoolChange}
                  onNumberChange={onNumberChange}
                  onStringChange={onStringChange}
                  disabled={disabled}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
