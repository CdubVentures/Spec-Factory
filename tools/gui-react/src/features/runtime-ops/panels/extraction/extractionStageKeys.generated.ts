// AUTO-GENERATED from src/core/config/runtimeStageDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js

export const EXTRACTION_STAGE_KEYS = [
  'screenshot',
  'video',
  'crawl4ai',
] as const;

export type ExtractionTabKey = (typeof EXTRACTION_STAGE_KEYS)[number];

export interface StageMeta {
  readonly label: string;
  readonly tip: string;
  readonly tone: 'info' | 'warning' | 'accent';
}

export const EXTRACTION_STAGE_META: Record<ExtractionTabKey, StageMeta> = {
  'screenshot': { label: 'Screenshots', tip: 'Full-page and targeted selector screenshots captured from each URL.', tone: 'info' },
  'video': { label: 'Videos', tip: 'WebM video recordings captured from each fetch worker during page interaction.', tone: 'info' },
  'crawl4ai': { label: 'Crawl4AI', tip: 'Markdown + tables + lists extracted from each URL via Python sidecar.', tone: 'accent' },
};

import type { ExtractionPhasesResponse, ExtractionPluginData } from '../../types.ts';

export interface ExtractionPanelContext {
  data: ExtractionPhasesResponse | undefined;
  persistScope: string;
  runId?: string;
}

const EMPTY_PLUGIN: ExtractionPluginData = { entries: [], total: 0 };

export const EXTRACTION_SELECT_PROPS: Record<ExtractionTabKey, (ctx: ExtractionPanelContext) => Record<string, unknown>> = {
  'screenshot': (ctx) => ({
    data: ctx.data?.plugins?.screenshot ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
    runId: ctx.runId ?? '',
  }),
  'video': (ctx) => ({
    data: ctx.data?.plugins?.video ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
    runId: ctx.runId ?? '',
  }),
  'crawl4ai': (ctx) => ({
    data: ctx.data?.plugins?.crawl4ai ?? EMPTY_PLUGIN,
    persistScope: ctx.persistScope,
    runId: ctx.runId ?? '',
  }),
};

export interface ExtractionSectionMeta {
  readonly sectionId: string;
  readonly label: string;
  readonly tip: string;
  readonly iconPath: string | null;
  readonly customComponent: string | null;
  readonly stageKey: ExtractionTabKey;
}

export const EXTRACTION_SECTION_META: Record<string, ExtractionSectionMeta> = {
  'screenshots': {
    sectionId: 'screenshots',
    label: 'Screenshots',
    tip: 'Page capture format, quality, selectors, and size limits',
    iconPath: null,
    customComponent: null,
    stageKey: 'screenshot',
  },
  'video': {
    sectionId: 'video',
    label: 'Video Recording',
    tip: 'Video capture resolution and recording settings',
    iconPath: null,
    customComponent: 'VideoRecording',
    stageKey: 'video',
  },
  'crawl4ai': {
    sectionId: 'crawl4ai',
    label: 'Crawl4AI',
    tip: 'Python-sidecar markdown + table + list extraction per URL',
    iconPath: 'M4 6h16M4 12h12M4 18h8M20 9l-4 4-2-2',
    customComponent: null,
    stageKey: 'crawl4ai',
  },
};

export const EXTRACTION_SECTION_ORDER: readonly string[] = [
  'screenshots',
  'video',
  'crawl4ai',
] as const;
