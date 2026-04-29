import type { PerKeyDocSection } from '../../state/perKeyDocsApi.ts';

interface PerKeyDocSectionStripProps {
  readonly sections: readonly PerKeyDocSection[];
  readonly activeSectionId: string;
  readonly onSelectSection: (sectionId: string) => void;
}

// The Header section is rendered above the strip as the sticky title; the
// strip lists the remaining sections, numbered 1..N in MD-emission order.
export function PerKeyDocSectionStrip({
  sections,
  activeSectionId,
  onSelectSection,
}: PerKeyDocSectionStripProps) {
  const numbered = sections.filter((s) => s.id !== 'header');
  return (
    <div className="sticky top-0 z-10 pt-3 pb-2 mb-3 sf-surface-shell">
      <div className="sf-tab-strip flex flex-wrap items-center gap-1 p-1">
        {numbered.map((section, index) => {
          const isActive = activeSectionId === section.id;
          const ordinal = String(index + 1).padStart(2, '0');
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              className={`sf-tab-item inline-flex items-center gap-1.5 h-8 px-2.5 text-xs whitespace-nowrap ${
                isActive ? 'sf-tab-item-active font-semibold' : ''
              }`}
              aria-pressed={isActive}
              title={section.title}
            >
              <span
                className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 text-[10px] rounded font-mono leading-none ${
                  isActive
                    ? 'sf-bg-accent text-white'
                    : 'sf-bg-surface-soft-strong sf-text-subtle'
                }`}
              >
                {ordinal}
              </span>
              <span className="leading-none">{section.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
