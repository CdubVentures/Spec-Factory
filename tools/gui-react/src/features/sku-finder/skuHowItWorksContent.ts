import type { HiwSection } from '../../shared/ui/finder/FinderHowItWorks.tsx';

export const skuHowItWorksSections: HiwSection[] = [
  {
    num: 1,
    tone: 'accent',
    title: 'Per-Variant Discovery',
    blocks: [
      {
        kind: 'text',
        content: 'Each variant (color or edition) is researched **independently** for its manufacturer part number (MPN). Results attach to the variant — not the product — so a \u201CBlack\u201D and \u201CWhite\u201D colorway each get their own MPN when the manufacturer assigns one.',
      },
      {
        kind: 'flow',
        boxes: [
          { label: 'CEF Variants', sub: 'colors + editions', tone: 'neutral' },
          { label: 'MPN Discovery', sub: 'web + query search', tone: 'accent' },
          { label: 'Validate', sub: 'confidence gate', tone: 'teal' },
          { label: 'Publish', sub: 'field_candidates', tone: 'green' },
        ],
      },
    ],
  },
  {
    num: 2,
    tone: 'teal',
    title: 'Evidence & Confidence',
    blocks: [
      {
        kind: 'text',
        content: 'Every MPN must cite **at least one evidence source**. Tier-1 = manufacturer product page or JSON-LD `mpn` / `productID` metadata. Tier-2 = major retailer listing that exposes the MPN (not the retailer SKU). Tier-3 = press / review. ASINs, UPC / EANs, and retailer-scoped SKUs are rejected — they are not MPNs.',
      },
      {
        kind: 'compare',
        cards: [
          {
            tone: 'accent',
            badge: 'TIER 1',
            title: 'Authoritative',
            items: [
              'Manufacturer product page',
              'JSON-LD `mpn` field',
              'Official spec sheet / datasheet',
            ],
          },
          {
            tone: 'teal',
            badge: 'TIER 2',
            title: 'Verified',
            items: [
              'Major retailer listing (MPN shown)',
              'Industry review site',
              'Distributor catalog',
            ],
          },
        ],
      },
    ],
  },
  {
    num: 3,
    tone: 'orange',
    title: 'Cooldowns & Dedup',
    blocks: [
      {
        kind: 'text',
        content: 'URLs and queries checked in past runs are fed forward as a **discovery log** so the LLM doesn\u2019t repeat itself. Global URL and Query cooldown windows (default 90 days) gate re-checks across finders.',
      },
      {
        kind: 'callout',
        tone: 'orange',
        icon: '\u{1F4DA}',
        content: 'Running a variant a second time **augments** the discovery log — the LLM picks up where the previous run left off.',
      },
    ],
  },
  {
    num: 4,
    tone: 'purple',
    title: 'Publish Gate',
    blocks: [
      {
        kind: 'text',
        content: 'Candidates flow through the shared **field_candidates** publisher. An MPN is resolved only when its confidence passes the global **publishConfidenceThreshold** (Publisher settings) **and** evidence count satisfies the field rule minimum.',
      },
      {
        kind: 'flow',
        boxes: [
          { label: 'LLM Result', sub: 'MPN + evidence', tone: 'accent' },
          { label: 'Confidence Gate', sub: 'publishConfidenceThreshold', tone: 'purple' },
          { label: 'Evidence Gate', sub: 'min_evidence_refs', tone: 'teal' },
          { label: '\u2713 Published', sub: 'variant-scoped', tone: 'green' },
        ],
      },
    ],
  },
];
