/**
 * Markdown renderer for audit reports. Same content as the HTML
 * renderer, plain-text skin for LLM auditors.
 *
 * Two entry points:
 *   - renderMarkdown(reportData) → string         — category-level audit report wrapper.
 *   - renderMarkdownFromStructure(structure, { subtitleLine }) → string
 *     pure structure consumer, used by per-key doc builder.
 */

import { buildReportStructure } from './reportStructure.js';

function renderBlock(block) {
  switch (block.kind) {
    case 'paragraph':
      return block.text;
    case 'bulletList':
      return block.items.map((i) => `- ${i}`).join('\n');
    case 'table': {
      const head = `| ${block.headers.join(' | ')} |`;
      const sep = `| ${block.headers.map(() => '---').join(' | ')} |`;
      const body = block.rows
        .map((r) => `| ${r.map((c) => mdEscapeCell(String(c))).join(' | ')} |`)
        .join('\n');
      return [head, sep, body].join('\n');
    }
    case 'codeBlock':
      return `\`\`\`${block.lang || ''}\n${block.text}\n\`\`\``;
    case 'details':
      // Markdown has no native collapsible. Render as a sub-heading + body.
      return [`**${block.summary}**`, ...block.blocks.map(renderBlock)].join('\n\n');
    case 'subheading': {
      const hashes = '#'.repeat(Math.min((block.level || 3) + 1, 6));
      return `${hashes} ${block.text}`;
    }
    case 'note': {
      const prefix = {
        info: 'Note',
        warn: 'Warning',
        err: 'Critical',
        good: 'OK',
      }[block.tone || 'info'] || 'Note';
      return `> **${prefix}:** ${block.text}`;
    }
    default:
      return '';
  }
}

function mdEscapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderSection(section, depth = 0) {
  const level = Math.min((section.level || 2) + depth, 6);
  const hashes = '#'.repeat(level);
  const parts = [`${hashes} ${section.title}`, ''];
  for (const b of section.blocks || []) {
    parts.push(renderBlock(b));
    parts.push('');
  }
  if (Array.isArray(section.children)) {
    for (const child of section.children) {
      parts.push(renderSection(child, depth));
    }
  }
  return parts.join('\n');
}

/**
 * Pure structure consumer. Emits a Markdown document from a prebuilt
 * { sections, meta } structure.
 *
 * @param {object} structure         — { sections, meta } from a structure builder
 * @param {object} opts
 * @param {string} opts.subtitleLine — italicized subtitle line rendered below the H1
 */
export function renderMarkdownFromStructure(structure, { subtitleLine }) {
  const lines = [];
  const [headerSection, ...body] = structure.sections;
  lines.push(`# ${headerSection.title}`, '');
  lines.push(subtitleLine, '');
  for (const b of headerSection.blocks) {
    lines.push(renderBlock(b));
    lines.push('');
  }
  for (const s of body) {
    lines.push(renderSection(s));
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

export function renderMarkdown(reportData) {
  const structure = buildReportStructure(reportData);
  return renderMarkdownFromStructure(structure, {
    subtitleLine: `_Category audit report \u00B7 Consumer: \`key_finder\` \u00B7 Generated ${structure.meta.generatedAt}_`,
  });
}
