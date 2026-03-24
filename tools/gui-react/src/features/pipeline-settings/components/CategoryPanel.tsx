// WHY: Renders a full settings category with a section sub-tab sidebar
// and the active section panel. Matches the existing RuntimeSettingsFlowCard grid layout.

import { GenericSectionPanel } from './GenericSectionPanel';
import { findCategory } from '../state/SettingsCategoryRegistry';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry';
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

  if (!category || sections.length === 0) return null;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="flex flex-col gap-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`text-left px-3 py-2 rounded sf-text-label font-semibold transition-colors ${
              activeSection === s.id
                ? 'sf-surface-elevated sf-text-primary'
                : 'sf-text-muted hover:sf-surface-soft'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <section className="rounded sf-surface-elevated p-3 md:p-4 space-y-3">
        <GenericSectionPanel
          categoryId={categoryId}
          sectionId={activeSection}
          runtimeDraft={runtimeDraft}
          onBoolChange={onBoolChange}
          onNumberChange={onNumberChange}
          onStringChange={onStringChange}
          disabled={disabled}
        />
      </section>
    </div>
  );
}
