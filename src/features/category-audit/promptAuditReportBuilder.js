import fs from 'node:fs/promises';
import path from 'node:path';

import { escapeHtml, renderHtmlFromStructure } from './reportHtml.js';
import { renderMarkdownFromStructure } from './reportMarkdown.js';
import { extractPromptAuditData } from './promptAuditData.js';
import {
  buildPromptAuditPromptStructure,
  buildPromptAuditSummaryStructure,
} from './promptAuditStructure.js';

function resolveCategoryOutputRoot(outputRoot, category) {
  const root = path.resolve(outputRoot);
  const categoryRoot = path.resolve(root, category);
  if (categoryRoot !== root && categoryRoot.startsWith(`${root}${path.sep}`)) {
    return categoryRoot;
  }
  throw new Error(`generatePromptAuditReports: unsafe category output path for ${category}`);
}

function resolvePerPromptCategoryPath(outputRoot, category) {
  const perPromptRoot = path.resolve(outputRoot, 'per-prompt');
  const basePath = path.resolve(perPromptRoot, category);
  if (basePath !== perPromptRoot && basePath.startsWith(`${perPromptRoot}${path.sep}`)) {
    return basePath;
  }
  throw new Error(`generatePromptAuditReports: unsafe per-prompt output path for ${category}`);
}

function safeSegment(value) {
  const segment = String(value || '').replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return segment || 'prompt';
}

async function writeStructurePair({ structure, htmlPath, mdPath, documentTitle, subtitleHtml, subtitleLine }) {
  const htmlText = renderHtmlFromStructure(structure, { documentTitle, subtitleHtml });
  const mdText = renderMarkdownFromStructure(structure, { subtitleLine });
  await fs.writeFile(htmlPath, htmlText, 'utf8');
  await fs.writeFile(mdPath, mdText, 'utf8');
}

export async function generatePromptAuditReports({
  category,
  moduleSettings = {},
  globalFragments = {},
  outputRoot,
  now = new Date(),
}) {
  if (!category || typeof category !== 'string') {
    throw new Error('generatePromptAuditReports: category is required');
  }
  if (!outputRoot || typeof outputRoot !== 'string') {
    throw new Error('generatePromptAuditReports: outputRoot is required');
  }

  const auditData = extractPromptAuditData({
    category,
    moduleSettings,
    globalFragments,
    now,
  });

  const categoryRoot = resolveCategoryOutputRoot(outputRoot, category);
  await fs.mkdir(categoryRoot, { recursive: true });
  const summaryBaseName = `${category}-prompt-audit-summary`;
  const summaryHtmlPath = path.join(categoryRoot, `${summaryBaseName}.html`);
  const summaryMdPath = path.join(categoryRoot, `${summaryBaseName}.md`);
  const summaryStructure = buildPromptAuditSummaryStructure(auditData);
  await writeStructurePair({
    structure: summaryStructure,
    htmlPath: summaryHtmlPath,
    mdPath: summaryMdPath,
    documentTitle: `Prompt Audit - ${category}`,
    subtitleHtml: `Prompt audit summary &middot; category: <code>${escapeHtml(category)}</code> &middot; generated ${escapeHtml(auditData.generatedAt)}`,
    subtitleLine: `_Prompt audit summary - category: \`${category}\` - generated ${auditData.generatedAt}_`,
  });

  const basePath = resolvePerPromptCategoryPath(outputRoot, category);
  await fs.rm(basePath, { recursive: true, force: true });
  await fs.mkdir(basePath, { recursive: true });

  const reports = [];
  for (const prompt of auditData.prompts) {
    const ownerDir = path.join(basePath, safeSegment(prompt.owner));
    await fs.mkdir(ownerDir, { recursive: true });
    const slug = safeSegment(prompt.slug);
    const htmlPath = path.join(ownerDir, `${slug}.html`);
    const mdPath = path.join(ownerDir, `${slug}.md`);
    const structure = buildPromptAuditPromptStructure(prompt, {
      category,
      generatedAt: auditData.generatedAt,
      globalPrompts: auditData.globalPrompts,
    });
    await writeStructurePair({
      structure,
      htmlPath,
      mdPath,
      documentTitle: `Prompt Audit - ${category}/${prompt.owner}/${prompt.slug}`,
      subtitleHtml: `Prompt brief &middot; category: <code>${escapeHtml(category)}</code> &middot; owner: <code>${escapeHtml(prompt.owner)}</code> &middot; generated ${escapeHtml(auditData.generatedAt)}`,
      subtitleLine: `_Prompt brief - category: \`${category}\` - owner: \`${prompt.owner}\` - generated ${auditData.generatedAt}_`,
    });
    reports.push({
      owner: prompt.owner,
      slug: prompt.slug,
      title: prompt.title,
      htmlPath,
      mdPath,
    });
  }

  return {
    summary: {
      htmlPath: summaryHtmlPath,
      mdPath: summaryMdPath,
    },
    perPromptReports: {
      basePath,
      count: reports.length,
      reports,
    },
    generatedAt: auditData.generatedAt,
    stats: auditData.stats,
  };
}
