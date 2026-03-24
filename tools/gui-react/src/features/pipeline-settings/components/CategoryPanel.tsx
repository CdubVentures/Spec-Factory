// WHY: Renders a full settings category matching the Convergence panel layout.
// Column 1: styled nav sidebar with icons (select one section).
// Column 2: header card + settings for the SELECTED section only.

import { GenericSectionPanel } from './GenericSectionPanel';
import { findCategory } from '../state/SettingsCategoryRegistry';
import type { SettingsCategoryId, SettingsSectionDef } from '../state/SettingsCategoryRegistry';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps';
import { usePersistedTab } from '../../../stores/tabStore';

export interface CategoryPanelProps {
  categoryId: SettingsCategoryId;
  runtimeDraft: Record<string, unknown>;
  onBoolChange: (key: string, next: boolean) => void;
  onNumberChange: (key: string, eventValue: string, bounds: NumberBound) => void;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

// WHY: SVG icon per section — same pattern as ConvergenceGroupIcon.
function SectionIcon({ sectionId, active }: { sectionId: string; active: boolean }) {
  const toneClass = active ? 'sf-callout sf-callout-info' : 'sf-callout sf-callout-neutral';

  const iconPaths: Record<string, React.ReactNode> = {
    'run-setup': <><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></>,
    output: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>,
    'storage-cloud': <><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></>,
    observability: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    discovery: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    budgets: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    network: <><path d="M13 2 3 14h9l-1 8 10-12h-9Z" /></>,
    browser: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
    screenshots: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    provider: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><path d="M4 22v-7" /></>,
    models: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.27 6.96 12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></>,
    limits: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></>,
    schema: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
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
            <div className="sf-text-label font-semibold leading-5">
              {section.label}
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

  const [activeSection, setActiveSection] = usePersistedTab(
    `pipeline-settings:${categoryId}:section`,
    defaultSection,
  );

  const activeSectionDef = sections.find((s) => s.id === activeSection) ?? sections[0];

  if (!category || sections.length === 0) return null;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Column 1: section sidebar — matches Convergence panel style */}
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
            {/* Section header card — matches Convergence knob group header */}
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
              <GenericSectionPanel
                categoryId={categoryId}
                sectionId={activeSection}
                runtimeDraft={runtimeDraft}
                onBoolChange={onBoolChange}
                onNumberChange={onNumberChange}
                onStringChange={onStringChange}
                disabled={disabled}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
