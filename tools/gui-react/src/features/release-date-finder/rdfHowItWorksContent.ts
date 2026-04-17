import type { HiwSection } from '../../shared/ui/finder/FinderHowItWorks.tsx';

export const rdfHowItWorksSections: HiwSection[] = [
  {
    num: 1,
    tone: 'accent',
    title: 'Per-Variant Discovery',
    blocks: [
      {
        kind: 'text',
        content: 'Each variant (color or edition) is researched **independently** for its first-availability release date. Results attach to the variant — not the product — so editions and limited colorways keep their own dates.',
      },
      {
        kind: 'flow',
        boxes: [
          { label: 'CEF Variants', sub: 'colors + editions', tone: 'neutral' },
          { label: 'Discovery', sub: 'web + query search', tone: 'accent' },
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
        content: 'Every date must cite **at least one evidence source** with URL, excerpt, and tier. Tier-1 (manufacturer / press release), Tier-2 (major retailer / review), Tier-3 (secondary press). Low-confidence results are held back from the publisher.',
      },
      {
        kind: 'compare',
        cards: [
          {
            tone: 'accent',
            badge: 'TIER 1',
            title: 'Authoritative',
            items: [
              'Manufacturer announcement',
              'Official press release',
              'Brand product page',
            ],
          },
          {
            tone: 'teal',
            badge: 'TIER 2',
            title: 'Verified',
            items: [
              'Major retailer (Amazon, Best Buy)',
              'Professional review site',
              'Industry publication',
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
        content: 'Candidates flow through the shared **field_candidates** publisher. A date is resolved only when its confidence passes the module threshold **and** evidence count satisfies the field rule minimum.',
      },
      {
        kind: 'flow',
        boxes: [
          { label: 'LLM Result', sub: 'date + evidence', tone: 'accent' },
          { label: 'Confidence Gate', sub: 'minConfidence %', tone: 'purple' },
          { label: 'Evidence Gate', sub: 'min_evidence_refs', tone: 'teal' },
          { label: '\u2713 Published', sub: 'variant-scoped', tone: 'green' },
        ],
      },
    ],
  },
];
