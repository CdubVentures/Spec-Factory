import { useEffect, useMemo } from 'react';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { usePerKeyDoc } from '../state/perKeyDocsApi.ts';
import { displayLabel } from '../state/studioDisplayLabel.ts';
import { renderInline } from './per-key-docs/renderInline.tsx';
import { PerKeyDocSection } from './per-key-docs/PerKeyDocSection.tsx';
import { PerKeyDocSectionStrip } from './per-key-docs/PerKeyDocSectionStrip.tsx';
import type { StudioPageActivePanelDocsProps } from './studioPagePanelContracts.ts';

export function PerKeyDocsTab({
  category,
  selectedKey,
  onSelectKey,
  rules,
  fieldOrder,
}: StudioPageActivePanelDocsProps) {
  const fieldKeys = useMemo(
    () => fieldOrder.filter((key) => !key.startsWith('__grp::')),
    [fieldOrder],
  );

  useEffect(() => {
    if (fieldKeys.length === 0) {
      if (selectedKey) onSelectKey('');
      return;
    }
    if (!selectedKey || !fieldKeys.includes(selectedKey)) {
      onSelectKey(fieldKeys[0]);
    }
  }, [selectedKey, fieldKeys, onSelectKey]);

  const docQuery = usePerKeyDoc({ category, fieldKey: selectedKey });
  const structure = docQuery.data?.structure;

  const sections = structure?.sections || [];
  const headerSection = sections.find((s) => s.id === 'header');
  const numberedSections = sections.filter((s) => s.id !== 'header');
  const firstSectionId = numberedSections[0]?.id || '';

  const [activeSectionId, setActiveSectionId] = usePersistedTab<string>(
    `studio:perKeyDocs:section:${category}`,
    firstSectionId,
  );

  useEffect(() => {
    if (numberedSections.length === 0) return;
    if (!numberedSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(firstSectionId);
    }
  }, [numberedSections, activeSectionId, firstSectionId, setActiveSectionId]);

  const activeSection =
    numberedSections.find((s) => s.id === activeSectionId) || numberedSections[0];

  const ordinalWidth = Math.max(2, String(fieldKeys.length).length);

  return (
    <div className="flex gap-4 min-h-[calc(100vh-350px)]">
      <aside className="w-72 flex-shrink-0 sf-surface-elevated flex flex-col max-h-[calc(100vh-350px)] overflow-hidden">
        <header className="px-3 py-2.5 border-b sf-border-default sf-bg-surface-soft-strong">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide sf-text-muted truncate">
                Per-Key Briefs
              </h3>
              <p className="text-[11px] sf-text-subtle truncate mt-0.5">
                Read-only · {category}
              </p>
            </div>
            <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 text-[11px] font-mono rounded sf-bg-surface-soft-strong sf-text-default">
              {fieldKeys.length}
            </span>
          </div>
        </header>
        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {fieldKeys.map((key, index) => {
            const isSelected = key === selectedKey;
            const ordinal = String(index + 1).padStart(ordinalWidth, '0');
            const label = displayLabel(
              key,
              rules[key] as Record<string, unknown> | undefined,
            );
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelectKey(key)}
                  className={`group sf-tab-item w-full text-left px-2 py-1.5 rounded-md border transition-colors ${
                    isSelected
                      ? 'sf-tab-item-active border-accent shadow-sm'
                      : 'sf-bg-surface-soft sf-border-soft hover:sf-bg-surface-soft-strong'
                  }`}
                  aria-pressed={isSelected}
                  title={key}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center min-w-[1.75rem] h-5 px-1 text-[10px] rounded font-mono leading-none flex-shrink-0 ${
                        isSelected
                          ? 'sf-bg-accent text-white'
                          : 'sf-bg-surface-soft-strong sf-text-subtle'
                      }`}
                    >
                      {ordinal}
                    </span>
                    <span
                      className={`text-xs truncate sf-text-default ${
                        isSelected ? 'font-semibold' : ''
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-[2.25rem]">
                    <span className="font-mono text-[10px] sf-text-subtle truncate block">
                      {key}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex-1 min-w-0 overflow-y-auto max-h-[calc(100vh-350px)] pr-2">
        {!selectedKey ? (
          <p className="sf-text-muted mt-12 text-center text-sm">
            Select a key from the rail to view its per-key brief.
          </p>
        ) : docQuery.isLoading ? (
          <p className="sf-text-muted mt-12 text-center text-sm">
            Loading per-key brief…
          </p>
        ) : docQuery.isError ? (
          <div className="rounded sf-callout sf-callout-danger px-3 py-2 mt-4">
            <div className="text-sm font-semibold sf-status-text-danger">
              Failed to load per-key brief
            </div>
            <div className="text-xs sf-status-text-danger mt-1">
              {String((docQuery.error as Error)?.message || docQuery.error)}
            </div>
          </div>
        ) : !structure ? (
          <p className="sf-text-muted mt-12 text-center text-sm">No data.</p>
        ) : (
          <>
            {headerSection ? (
              <header className="sf-surface-elevated rounded-lg border sf-border-default p-4 mb-3">
                <h1 className="text-xl font-semibold sf-text-default">
                  {renderInline(headerSection.title)}
                </h1>
                {(headerSection.blocks || []).map((block, idx) => {
                  if (block.kind === 'paragraph') {
                    return (
                      <p key={idx} className="sf-text-muted text-sm mt-2">
                        {renderInline(block.text)}
                      </p>
                    );
                  }
                  return null;
                })}
              </header>
            ) : null}
            <PerKeyDocSectionStrip
              sections={sections}
              activeSectionId={activeSection?.id || ''}
              onSelectSection={setActiveSectionId}
            />
            {activeSection ? (
              <PerKeyDocSection section={activeSection} />
            ) : (
              <p className="sf-text-muted mt-6 text-center text-sm">
                No sections available for this key.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
