/**
 * Registry of external tools and libraries used by fetch/extraction/validation panels.
 * O(1) scaling: add one entry here + one SVG in toolLogos.tsx to brand a new tool.
 */

import type { ComponentType } from 'react';
import { PlaywrightLogo, CrawleeLogo, SpecFactoryLogo } from './toolLogos.tsx';

export type ToolCategory = 'script' | 'plugin';

export interface ToolBrandEntry {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly Logo: ComponentType<{ className?: string }>;
}

export const TOOL_BRAND_REGISTRY: Readonly<Record<string, ToolBrandEntry>> = {
  playwright: {
    name: 'Playwright',
    url: 'https://playwright.dev',
    description: 'Browser automation library by Microsoft.',
    Logo: PlaywrightLogo,
  },
  crawlee: {
    name: 'Crawlee',
    url: 'https://crawlee.dev',
    description: 'Web scraping and browser automation framework by Apify.',
    Logo: CrawleeLogo,
  },
  specFactory: {
    name: 'Spec Factory',
    url: '',
    description: 'Custom pipeline logic built for this application.',
    Logo: SpecFactoryLogo,
  },
};

export function resolveToolBrand(key: string): ToolBrandEntry | undefined {
  return TOOL_BRAND_REGISTRY[key];
}
