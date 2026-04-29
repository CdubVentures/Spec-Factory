import { Fragment } from 'react';
import { renderInline } from './renderInline.tsx';
import type {
  PerKeyDocBlock,
  PerKeyDocNoteTone,
} from '../../state/perKeyDocsApi.ts';

const NOTE_TONE_TO_CALLOUT: Record<PerKeyDocNoteTone, string> = {
  info: 'sf-callout sf-callout-info',
  warn: 'sf-callout sf-callout-warning',
  err: 'sf-callout sf-callout-danger',
  good: 'sf-callout sf-callout-success',
};

function ParagraphBlock({ text }: { readonly text: string }) {
  // The MD renderer splits paragraphs on blank lines and joins inline newlines.
  const paragraphs = text.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, idx) => (
        <p key={idx} className="sf-text-default leading-relaxed my-2">
          {renderInline(para.replace(/\n/g, ' '))}
        </p>
      ))}
    </>
  );
}

function BulletListBlock({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1 my-2">
      {items.map((item, idx) => (
        <li key={idx} className="sf-text-default">
          {renderInline(item)}
        </li>
      ))}
    </ul>
  );
}

function TableBlock({
  headers,
  rows,
}: {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-sm border sf-border-default rounded sf-bg-surface-soft">
        <thead className="sf-bg-surface-soft-strong">
          <tr>
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-3 py-2 text-left font-semibold sf-text-default border-b sf-border-default align-top"
              >
                {renderInline(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b sf-border-soft last:border-b-0">
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className="px-3 py-2 align-top sf-text-default break-words"
                >
                  {renderInline(String(cell ?? ''))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ text }: { readonly text: string }) {
  return (
    <pre className="sf-bg-surface-deepest sf-text-default border sf-border-default rounded p-3 my-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed font-mono">
      <code>{text}</code>
    </pre>
  );
}

function DetailsBlock({
  summary,
  blocks,
}: {
  readonly summary: string;
  readonly blocks: readonly PerKeyDocBlock[];
}) {
  return (
    <details className="my-3 rounded border sf-border-default sf-bg-surface-soft">
      <summary className="cursor-pointer px-3 py-2 font-semibold sf-text-default select-none">
        {renderInline(summary)}
      </summary>
      <div className="px-3 py-2 border-t sf-border-soft">
        {blocks.map((block, idx) => (
          <BlockRenderer key={idx} block={block} />
        ))}
      </div>
    </details>
  );
}

function SubheadingBlock({
  level,
  text,
}: {
  readonly level: number;
  readonly text: string;
}) {
  const clamped = Math.min(Math.max(level, 3), 6);
  if (clamped === 3) {
    return (
      <h3 className="text-base font-semibold sf-text-default mt-4 mb-2">
        {renderInline(text)}
      </h3>
    );
  }
  if (clamped === 4) {
    return (
      <h4 className="text-sm font-semibold sf-text-muted uppercase tracking-wide mt-3 mb-1">
        {renderInline(text)}
      </h4>
    );
  }
  if (clamped === 5) {
    return (
      <h5 className="text-xs font-semibold sf-text-muted uppercase tracking-wide mt-2 mb-1">
        {renderInline(text)}
      </h5>
    );
  }
  return (
    <h6 className="text-xs font-semibold sf-text-subtle mt-2 mb-1">
      {renderInline(text)}
    </h6>
  );
}

function NoteBlock({
  tone,
  text,
}: {
  readonly tone?: PerKeyDocNoteTone;
  readonly text: string;
}) {
  const cls = NOTE_TONE_TO_CALLOUT[tone || 'info'];
  return (
    <div className={`${cls} rounded px-3 py-2 my-3 text-sm`}>
      {renderInline(text)}
    </div>
  );
}

export function BlockRenderer({ block }: { readonly block: PerKeyDocBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <ParagraphBlock text={block.text} />;
    case 'bulletList':
      return <BulletListBlock items={block.items} />;
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'codeBlock':
      return <CodeBlock text={block.text} />;
    case 'details':
      return <DetailsBlock summary={block.summary} blocks={block.blocks} />;
    case 'subheading':
      return <SubheadingBlock level={block.level} text={block.text} />;
    case 'note':
      return <NoteBlock tone={block.tone} text={block.text} />;
    default:
      return <Fragment />;
  }
}
