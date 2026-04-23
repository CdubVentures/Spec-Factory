// WHY: Single source of truth for runtime stage definitions (prefetch + fetch + extraction).
// GUI codegen (tools/gui-react/scripts/generateRuntimeStageKeys.js) reads this
// to generate TypeScript key arrays, types, and metadata — zero manual frontend duplication.
// Adding a new stage = add one entry here + run codegen + create panel component.

export const PREFETCH_STAGE_DEFS = Object.freeze([
  { key: 'needset',           label: 'NeedSet',           tip: 'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence \u2014 the higher the score, the more important it is to find.', tone: 'warning' },
  { key: 'brand_resolver',    label: 'Brand Resolver',    tip: 'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.', tone: 'warning' },
  { key: 'search_profile',    label: 'Search Profile',    tip: 'The search plan \u2014 all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.', tone: 'info' },
  { key: 'search_planner',    label: 'Search Planner',    tip: 'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.', tone: 'warning' },
  { key: 'query_journey',     label: 'Query Journey',     tip: 'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.', tone: 'info' },
  { key: 'search_results',    label: 'Search Results',    tip: 'Raw results returned by configured providers for each query.\nSupports Google, Bing, SearXNG, and Dual mode, including provider usage counts.', tone: 'accent' },
  { key: 'serp_selector',     label: 'SERP Selector',     tip: 'LLM-based URL selector that decides which search results are worth fetching.\nClassifies each URL as approved (fetch now), candidate (backup), or reject (skip).', tone: 'warning' },
  { key: 'domain_classifier', label: 'Domain Classifier', tip: 'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and routes them to queues.\nUses deterministic heuristics \u2014 no LLM call.', tone: 'info' },
]);

export const FETCH_STAGE_DEFS = Object.freeze([
  { key: 'stealth',         label: 'Stealth',         tip: 'Anti-detection fingerprint injection \u2014 masks webdriver flag, spoofs plugins and languages.', tone: 'info' },
  { key: 'cookie_consent',      label: 'Cookie Consent',      tip: 'Auto-dismiss cookie/privacy consent banners before page interaction.', tone: 'info' },
  { key: 'overlay_dismissal',  label: 'Overlay Dismissal',  tip: 'Detect and dismiss non-cookie popups \u2014 newsletter signups, chat widgets, paywalls, age gates, and scroll-locked body states.', tone: 'info' },
  { key: 'auto_scroll',        label: 'Auto-Scroll',        tip: 'Scroll passes to trigger lazy-loaded content and reveal dynamic elements.', tone: 'info' },
  { key: 'dom_expansion', label: 'DOM Expansion',  tip: 'Click expand/show-more buttons to reveal collapsed sections and tables.', tone: 'info' },
  { key: 'css_override',  label: 'CSS Override',   tip: 'Force display:block on hidden elements for full capture (brute-force fallback).', tone: 'info' },
]);

// WHY: settingsSection is the Pipeline Settings GUI projection for this plugin.
// After Phase 1a refactor, SettingsCategoryRegistry auto-derives its extraction
// sections from here — one entry per extraction stage def with a settingsSection.
// iconPath is an optional single-path SVG 'd' attribute; when null, CategoryPanel
// falls back to its hardcoded iconPaths map (preserves legacy multi-element icons
// for screenshots + video which can't codegen-round-trip). customComponent names
// a lazy-loaded overlay panel (e.g. 'VideoRecording' for the ffmpeg-aware panel).
export const EXTRACTION_STAGE_DEFS = Object.freeze([
  {
    key: 'screenshot',
    label: 'Screenshots',
    tip: 'Full-page and targeted selector screenshots captured from each URL.',
    tone: 'info',
    settingsSection: {
      id: 'screenshots',
      label: 'Screenshots',
      tip: 'Page capture format, quality, selectors, and size limits',
      iconPath: null,
      customComponent: null,
    },
  },
  {
    key: 'video',
    label: 'Videos',
    tip: 'WebM video recordings captured from each fetch worker during page interaction.',
    tone: 'info',
    settingsSection: {
      id: 'video',
      label: 'Video Recording',
      tip: 'Video capture resolution and recording settings',
      iconPath: null,
      customComponent: 'VideoRecording',
    },
  },
  {
    key: 'crawl4ai',
    label: 'Crawl4AI',
    tip: 'Markdown + tables + lists extracted from each URL via Python sidecar.',
    tone: 'accent',
    settingsSection: {
      id: 'crawl4ai',
      label: 'Crawl4AI',
      tip: 'Python-sidecar markdown + table + list extraction per URL',
      iconPath: 'M4 6h16M4 12h12M4 18h8M20 9l-4 4-2-2',
      customComponent: null,
    },
  },
]);
