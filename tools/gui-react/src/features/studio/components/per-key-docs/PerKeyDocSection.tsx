import { BlockRenderer } from './BlockRenderer.tsx';
import { renderInline } from './renderInline.tsx';
import type { PerKeyDocSection as PerKeyDocSectionType } from '../../state/perKeyDocsApi.ts';

interface PerKeyDocSectionProps {
  readonly section: PerKeyDocSectionType;
  readonly nested?: boolean;
}

export function PerKeyDocSection({ section, nested }: PerKeyDocSectionProps) {
  const blocks = section.blocks || [];
  const children = section.children || [];
  return (
    <section
      id={section.id}
      className={
        nested
          ? 'pl-4 border-l-2 sf-border-soft my-4'
          : 'sf-surface-elevated rounded-lg border sf-border-default p-4 my-4'
      }
    >
      {nested ? (
        <h3 className="text-base font-semibold sf-text-default mb-2">
          {renderInline(section.title)}
        </h3>
      ) : (
        <h2 className="text-lg font-semibold sf-text-default mb-3">
          {renderInline(section.title)}
        </h2>
      )}
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
      {children.map((child) => (
        <PerKeyDocSection key={child.id} section={child} nested />
      ))}
    </section>
  );
}
