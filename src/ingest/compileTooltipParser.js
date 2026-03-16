import fs from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeText,
  isObject,
  normalizeFieldKey,
  sortDeep,
  stableSortStrings
} from './compileUtils.js';

export function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function tooltipHtmlToMarkdown(rawHtml) {
  const raw = decodeHtmlEntities(rawHtml);
  if (!normalizeText(raw)) {
    return '';
  }
  const withBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li)\s*>/gi, '\n')
    .replace(/<\s*strong[^>]*>/gi, '**')
    .replace(/<\/\s*strong\s*>/gi, '**')
    .replace(/<[^>]+>/g, ' ');
  return withBreaks
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function parseTooltipJson(raw = '', sourceName = '') {
  const entries = {};
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  const bucket = isObject(payload?.tooltips) ? payload.tooltips : payload;
  if (!isObject(bucket)) {
    return entries;
  }
  for (const [rawKey, value] of Object.entries(bucket)) {
    const key = normalizeFieldKey(rawKey);
    if (!key) {
      continue;
    }
    if (typeof value === 'string') {
      const markdown = normalizeText(value);
      if (!markdown) {
        continue;
      }
      entries[key] = {
        key,
        source: sourceName,
        html: '',
        markdown
      };
      continue;
    }
    if (!isObject(value)) {
      continue;
    }
    const html = normalizeText(value.html || '');
    const markdown = normalizeText(
      value.markdown
      || value.md
      || value.tooltip_md
      || value.text
      || ''
    ) || (html ? tooltipHtmlToMarkdown(html) : '');
    if (!html && !markdown) {
      continue;
    }
    entries[key] = {
      key,
      source: sourceName,
      html,
      markdown
    };
  }
  return entries;
}

export function parseTooltipMarkdown(raw = '', sourceName = '') {
  const entries = {};
  const lines = String(raw || '').split(/\r?\n/);
  let currentKey = '';
  let buffer = [];
  const commit = () => {
    if (!currentKey) {
      return;
    }
    const markdown = buffer.map((line) => normalizeText(line)).filter(Boolean).join('\n');
    if (!markdown) {
      return;
    }
    entries[currentKey] = {
      key: currentKey,
      source: sourceName,
      html: '',
      markdown
    };
  };
  for (const line of lines) {
    const headingMatch = String(line || '').match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      commit();
      currentKey = normalizeFieldKey(String(headingMatch[1] || '').replace(/`/g, ''));
      buffer = [];
      continue;
    }
    if (currentKey) {
      buffer.push(line);
    }
  }
  commit();
  return entries;
}

export function parseTooltipJs(raw = '', sourceName = '') {
  const entries = {};
  const bodyMatch = String(raw || '').match(/export\s+const\s+TOOLTIPS\s*=\s*{([\s\S]*?)}\s*;/i);
  const body = bodyMatch ? bodyMatch[1] : String(raw || '');
  const templatePattern = /([A-Za-z0-9_]+)\s*:\s*`([\s\S]*?)`\s*(?:,|$)/g;
  templatePattern.lastIndex = 0;
  let match = null;
  while ((match = templatePattern.exec(body)) !== null) {
    const key = normalizeFieldKey(match[1]);
    const html = normalizeText(match[2]);
    if (!key || !html) {
      continue;
    }
    entries[key] = {
      key,
      source: sourceName,
      html,
      markdown: tooltipHtmlToMarkdown(html)
    };
  }
  if (Object.keys(entries).length > 0) {
    return entries;
  }
  const stringPattern = /["']([A-Za-z0-9_\- ]+)["']\s*:\s*["']([^"']+)["']\s*(?:,|$)/g;
  stringPattern.lastIndex = 0;
  while ((match = stringPattern.exec(body)) !== null) {
    const key = normalizeFieldKey(match[1]);
    const markdown = normalizeText(match[2]);
    if (!key || !markdown) {
      continue;
    }
    entries[key] = {
      key,
      source: sourceName,
      html: '',
      markdown
    };
  }
  return entries;
}

export function resolveTooltipCandidatePaths({ categoryRoot, map }) {
  const configuredPath = normalizeText(
    map?.tooltip_source?.path
    || map?.tooltip_bank_path
    || map?.tooltip_file
    || ''
  );
  const candidates = [];
  if (configuredPath) {
    const categoryRelative = path.isAbsolute(configuredPath)
      ? path.resolve(configuredPath)
      : path.resolve(categoryRoot, configuredPath);
    candidates.push(categoryRelative);
    if (!path.isAbsolute(configuredPath)) {
      candidates.push(path.resolve(configuredPath));
    }
  }
  return {
    configuredPath,
    candidates: stableSortStrings(candidates)
  };
}

export async function loadTooltipLibrary({ categoryRoot, map = {} }) {
  const entries = {};
  const files = [];
  const { configuredPath, candidates } = resolveTooltipCandidatePaths({ categoryRoot, map });
  let selectedMissing = false;
  let selectedConfigured = false;
  const fileCandidates = [];

  if (candidates.length > 0) {
    selectedConfigured = true;
    fileCandidates.push(...candidates);
  } else {
    let dirEntries = [];
    try {
      dirEntries = await fs.readdir(categoryRoot, { withFileTypes: true });
    } catch {
      return {
        entries,
        files,
        selectedMissing,
        selectedConfigured
      };
    }
    const tooltipFiles = dirEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^hbs_tooltips/i.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((fileName) => path.join(categoryRoot, fileName));
    fileCandidates.push(...tooltipFiles);
  }

  let anyReadable = false;
  const seenFiles = new Set();
  for (const fullPath of fileCandidates) {
    const resolved = path.resolve(fullPath);
    if (seenFiles.has(resolved)) {
      continue;
    }
    seenFiles.add(resolved);
    let raw = '';
    try {
      raw = await fs.readFile(resolved, 'utf8');
      anyReadable = true;
    } catch {
      continue;
    }
    const fileName = path.basename(resolved);
    files.push(fileName);
    const ext = path.extname(resolved).toLowerCase();
    const parsed = ext === '.json'
      ? parseTooltipJson(raw, fileName)
      : (ext === '.md' || ext === '.markdown')
        ? parseTooltipMarkdown(raw, fileName)
        : parseTooltipJs(raw, fileName);
    for (const [key, row] of Object.entries(parsed)) {
      entries[key] = row;
    }
  }

  if (selectedConfigured && !anyReadable && configuredPath) {
    selectedMissing = true;
  }

  return {
    entries: sortDeep(entries),
    files,
    selectedMissing,
    selectedConfigured,
    configuredPath
  };
}
