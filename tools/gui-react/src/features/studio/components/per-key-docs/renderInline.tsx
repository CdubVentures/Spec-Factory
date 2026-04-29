import { Fragment, type ReactNode } from 'react';

// Minimal inline markdown matcher — handles `code` spans and **bold**.
// Mirrors the renderer in src/features/category-audit/reportHtml.js so the
// in-Studio HTML preview stays byte-equivalent in text content to the .md.
const TOKEN_RE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

export function renderInline(text: string): ReactNode {
  if (!text) return '';
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  match = TOKEN_RE.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={parts.length} className="sf-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={parts.length} className="sf-text-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    lastIndex = match.index + token.length;
    match = TOKEN_RE.exec(text);
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.map((node, idx) => <Fragment key={idx}>{node}</Fragment>);
}
