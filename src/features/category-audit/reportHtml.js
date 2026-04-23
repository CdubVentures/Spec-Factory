/**
 * HTML renderer for audit reports.
 *
 * Two entry points:
 *   - renderHtml(reportData) → string         — category-level audit report wrapper.
 *   - renderHtmlFromStructure(structure, { documentTitle, subtitleHtml }) → string
 *     pure structure consumer, used by per-key doc builder.
 *
 * Dark-theme styling mirrored from docs/audits/keys/mouse-keys-matrix.html for
 * visual continuity with the earlier manual audits.
 */

import { buildReportStructure } from './reportStructure.js';

const CSS = `
  :root {
    --bg: #0f1420;
    --panel: #161c2c;
    --panel-2: #1b2235;
    --ink: #e6ecf5;
    --muted: #9aa6b8;
    --line: #2a3350;
    --accent: #79b8ff;
    --ok: #4fd18b;
    --warn: #ffcc66;
    --err: #ff6b6b;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--ink); margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.55; }
  header { padding: 22px 32px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 10; }
  header h1 { margin: 0 0 6px; font-size: 20px; }
  header .sub { color: var(--muted); font-size: 12.5px; }
  nav.toc { padding: 10px 32px; background: var(--panel-2); border-bottom: 1px solid var(--line); position: sticky; top: 66px; z-index: 9; display: flex; flex-wrap: wrap; gap: 6px 12px; }
  nav.toc a { color: var(--accent); text-decoration: none; font-size: 11.5px; padding: 3px 7px; border-radius: 4px; background: rgba(121,184,255,0.08); }
  nav.toc a:hover { background: rgba(121,184,255,0.18); }
  main { padding: 24px 32px 80px; max-width: 1700px; margin: 0 auto; }
  section { margin: 28px 0 40px; scroll-margin-top: 130px; }
  section.level-3 { margin: 16px 0 24px; padding-left: 16px; border-left: 2px solid var(--line); }
  h2 { font-size: 16px; margin: 0 0 10px; letter-spacing: .3px; scroll-margin-top: 130px; }
  h3 { font-size: 14px; margin: 20px 0 8px; color: var(--ink); scroll-margin-top: 130px; }
  h4 { font-size: 12.5px; margin: 14px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  code { background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 3px; font-family: var(--mono); font-size: 12px; color: #ffd28a; }
  pre { background: #0b1020; border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; overflow: auto; font-family: var(--mono); font-size: 12px; color: #dde4f0; white-space: pre-wrap; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; margin: 8px 0 14px; }
  th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
  th { background: var(--panel-2); font-weight: 600; border-bottom: 2px solid var(--line); }
  tr:last-child td { border-bottom: none; }
  td code { color: #ffd28a; }
  details { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 0; margin: 8px 0; }
  details > summary { padding: 10px 14px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--ink); list-style: none; user-select: none; }
  details > summary::marker, details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "\u25B8 "; color: var(--accent); }
  details[open] > summary::before { content: "\u25BE "; }
  details > div.details-body { padding: 0 14px 12px; border-top: 1px solid var(--line); }
  .note { padding: 10px 14px; border-radius: 6px; margin: 8px 0; border-left: 3px solid var(--accent); background: rgba(121,184,255,0.05); font-size: 12.5px; }
  .note.info { border-left-color: var(--accent); background: rgba(121,184,255,0.06); }
  .note.warn { border-left-color: var(--warn); background: rgba(255,204,102,0.06); }
  .note.err  { border-left-color: var(--err);  background: rgba(255,107,107,0.06); }
  .note.good { border-left-color: var(--ok);   background: rgba(79,209,139,0.06); }
  strong { color: #ffd98a; }
`;

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderInline(text) {
  // Minimal inline markdown: `code`, **bold**. Never nest.
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_, t) => `<code>${t}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`);
  return out;
}

function renderBlock(block) {
  switch (block.kind) {
    case 'paragraph':
      return block.text.split(/\n\n+/).map((p) => `<p>${renderInline(p.replace(/\n/g, ' '))}</p>`).join('\n');
    case 'bulletList':
      return `<ul>${block.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</ul>`;
    case 'table': {
      const head = `<thead><tr>${block.headers.map((h) => `<th>${renderInline(h)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${block.rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<table>${head}${body}</table>`;
    }
    case 'codeBlock':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'details':
      return `<details><summary>${renderInline(block.summary)}</summary><div class="details-body">${block.blocks.map(renderBlock).join('\n')}</div></details>`;
    case 'subheading':
      return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
    case 'note':
      return `<div class="note ${block.tone || 'info'}">${renderInline(block.text)}</div>`;
    default:
      return '';
  }
}

function renderSection(section) {
  const headingTag = `h${Math.min(section.level || 2, 6)}`;
  const parts = [`<section id="${escapeHtml(section.id)}" class="level-${section.level || 2}"><${headingTag}>${renderInline(section.title)}</${headingTag}>`];
  for (const b of section.blocks || []) parts.push(renderBlock(b));
  if (Array.isArray(section.children)) {
    for (const child of section.children) parts.push(renderSection(child));
  }
  parts.push('</section>');
  return parts.join('\n');
}

function renderToc(sections) {
  const topLevel = sections.filter((s) => (s.level || 2) <= 2 && s.id !== 'header');
  return `<nav class="toc">${topLevel.map((s) => `<a href="#${escapeHtml(s.id)}">${renderInline(s.title)}</a>`).join('')}</nav>`;
}

/**
 * Pure structure consumer. Emits a self-contained HTML document from a
 * prebuilt { sections, meta } structure.
 *
 * @param {object} structure         — { sections, meta } from a structure builder
 * @param {object} opts
 * @param {string} opts.documentTitle — <title> + fallback h1
 * @param {string} opts.subtitleHtml  — prerendered subtitle HTML (may include tags)
 */
export function renderHtmlFromStructure(structure, { documentTitle, subtitleHtml }) {
  const [headerSection, ...body] = structure.sections;
  const headerHtml = `<header><h1>${renderInline(headerSection.title)}</h1><div class="sub">${subtitleHtml}</div></header>`;
  const tocHtml = renderToc(body);
  const bodyHtml = `<main>${[headerSection.blocks.map(renderBlock).join('\n'), ...body.map(renderSection)].join('\n')}</main>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>${CSS}</style></head>
<body>${headerHtml}${tocHtml}${bodyHtml}</body></html>`;
}

export function renderHtml(reportData) {
  const structure = buildReportStructure(reportData);
  return renderHtmlFromStructure(structure, {
    documentTitle: `Key Finder Audit \u2014 ${structure.meta.category}`,
    subtitleHtml: `Category audit report \u00B7 Consumer: <code>key_finder</code> \u00B7 Generated ${escapeHtml(structure.meta.generatedAt)}`,
  });
}
