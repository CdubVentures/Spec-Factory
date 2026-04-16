/**
 * FinderDiscoveryDetails — shared collapsible discovery/details toggle.
 *
 * Both CEF and PIF run history rows show collapsible discovery data
 * (URLs checked, queries run, plus module-specific sections).
 * This component standardizes the visual pattern.
 */
import { memo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { Chip } from '../feedback/Chip.tsx';

export interface DiscoverySection {
  /** Section heading (e.g. "URLs Checked", "Confirmed from Known"). */
  readonly title: string;
  /** Display format: 'chips' renders as colored pills, 'lines' renders as monospace text lines. */
  readonly format: 'chips' | 'lines';
  /** CSS class applied to each chip (only used when format = 'chips'). */
  readonly chipClass?: string;
  /** Items to render — strings shown as chip labels or text lines. */
  readonly items: readonly string[];
}

interface FinderDiscoveryDetailsProps {
  /** Heading for the toggle button (e.g. "Discovery Details", "Discovery Log"). */
  readonly title?: string;
  readonly sections: readonly DiscoverySection[];
  readonly storageKey: string;
}

export const FinderDiscoveryDetails = memo(function FinderDiscoveryDetails({
  title = 'Discovery Details',
  sections,
  storageKey,
}: FinderDiscoveryDetailsProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);

  const nonEmpty = sections.filter((s) => s.items.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <div className="sf-surface-panel border sf-border-soft rounded-md">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle flex items-center gap-1 text-left"
      >
        <span className={`inline-block transition-transform duration-150 text-[8px] ${open ? 'rotate-90' : ''}`}>
          &#9656;
        </span>
        {title}
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2.5">
          {nonEmpty.map((section) => (
            <div key={section.title}>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">
                {section.title}{section.format === 'lines' ? ` (${section.items.length})` : ''}
              </div>
              {section.format === 'chips' ? (
                <div className="flex flex-wrap gap-1">
                  {section.items.map((item) => (
                    <Chip key={item} label={item} className={section.chipClass ?? 'sf-chip-neutral'} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item, i) => (
                    <span
                      key={`${item}-${i}`}
                      className="text-[10px] font-mono sf-text-subtle truncate max-w-full"
                      title={item}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
