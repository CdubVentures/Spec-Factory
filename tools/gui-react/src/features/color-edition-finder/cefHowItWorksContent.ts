/**
 * CEF "How It Works" content — pure data, no JSX.
 *
 * Consumed by FinderHowItWorks to render the explainer section
 * between the KPI grid and the Selected State card.
 */

import type { HiwSection } from '../../shared/ui/finder/FinderHowItWorks.tsx';

export const cefHowItWorksSections: HiwSection[] = [
  /* ── Row 1: Pipeline + Gates (2 cols) ─────────────────────────── */
  {
    num: 1,
    tone: 'accent',
    title: 'Pipeline',
    blocks: [
      {
        kind: 'flow',
        boxes: [
          { label: 'Product', sub: 'brand + model', tone: 'neutral' },
          { label: 'LLM Search', sub: 'web discovery', tone: 'accent' },
          { label: 'Palette Gate', sub: 'valid atoms', tone: 'green' },
          { label: 'Identity Judge', sub: 'run 2+ / web verify', tone: 'purple' },
          { label: 'Candidates', sub: 'review queue', tone: 'teal' },
        ],
      },
    ],
  },
  {
    num: 2,
    tone: 'green',
    title: 'Two Validation Gates',
    blocks: [
      {
        kind: 'compare',
        cards: [
          {
            tone: 'green',
            badge: 'GATE 1',
            title: 'Palette & Field Rules',
            items: [
              'Every atom must exist in **registered palette**',
              'Hard reject \u2192 entire run discarded',
              'Soft reject \u2192 auto-repair',
            ],
          },
          {
            tone: 'purple',
            badge: 'GATE 2',
            title: 'Identity Judge (Run 2+)',
            items: [
              'Compares against **variant registry** with web verification',
              'LLM judges: **match**, **new**, or **reject** (verified via official sources)',
              'Picks better labels via `preferred_label`, blocks slug drift + type crossing',
              'Ambiguity-aware: sibling model count + risk level inform decisions',
            ],
          },
        ],
      },
    ],
  },

  /* ── Row 2: Learning + What's Fed Back (2 cols) ───────────────── */
  {
    num: 3,
    tone: 'orange',
    title: 'Learning (Cross-Run)',
    blocks: [
      {
        kind: 'text',
        content: 'Each run feeds forward: accumulated **URLs** tell the LLM which pages to skip, **known findings** tell it what to re-verify and expand beyond.',
      },
      {
        kind: 'learn-chain',
        cells: [
          { tone: 'accent', label: 'Run 1', detail: 'Finds black, white. Logs URLs + queries.' },
          { tone: 'green', label: 'Run 2', detail: 'Skips visited pages. Finds limited edition.' },
          { tone: 'purple', label: 'Run 3', detail: 'Hits page 2, review sites for anything missed.' },
        ],
      },
      {
        kind: 'callout',
        tone: 'orange',
        icon: '\u{1F4A1}',
        content: 'URLs are **informational, not blocking** \u2014 the LLM can revisit if needed. Queries are audit-only by default so search results stay fresh.',
      },
    ],
  },
  {
    num: 4,
    tone: 'amber',
    title: 'Discovery Log Fields',
    blocks: [
      {
        kind: 'table',
        headers: ['Field', 'Injected?', 'Purpose'],
        rows: [
          ['**Known colors**', '\u2714', 'Re-verify + find missing'],
          ['**Known color names**', '\u2714', 'Use existing marketing names'],
          ['**Known editions**', '\u2714', 'Re-verify + find missing'],
          ['**URLs checked**', '\u2714', 'Skip visited pages'],
          ['**Queries run**', '\u2718 audit', 'Stored for debug only'],
          ['**Confirmed/added/rejected**', '\u2718 indirect', 'Audit trail per run'],
          ['**Siblings excluded**', '\u2718 audit', 'Re-discovered each run'],
        ],
      },
    ],
  },

  /* ── Row 3: Variant Registry + Delete Variant (2 cols) ────────── */
  {
    num: 5,
    tone: 'purple',
    title: 'Variant Registry',
    blocks: [
      {
        kind: 'text',
        content: 'Each color/edition gets a **permanent variant ID** (hash). The identity judge preserves IDs across runs, verifies discoveries via web, and picks the most accurate label.',
      },
      {
        kind: 'slot-steps',
        steps: [
          { tone: 'green', label: 'Match', detail: 'Same variant \u2192 keeps `variant_id`, updates metadata. `preferred_label` overrides if judge finds a better name.' },
          { tone: 'accent', label: 'New', detail: 'Genuinely new + web-verified \u2192 fresh `variant_id`.' },
          { tone: 'muted', label: 'Reject', detail: 'Hallucinated / unverifiable \u2192 discarded entirely.' },
        ],
      },
      {
        kind: 'callout',
        tone: 'purple',
        icon: '\u{1F517}',
        content: 'Variant IDs **link CEF to PIF**. Atom renames propagate to images, evals, and carousel slots. Post-sync **backfill** auto-heals stale variant IDs on PIF images.',
      },
    ],
  },
  {
    num: 6,
    tone: 'accent',
    title: 'Delete Variant (Cascade)',
    blocks: [
      {
        kind: 'flow',
        boxes: [
          { label: 'Variants', sub: 'DELETE', tone: 'accent' },
          { label: 'Candidates', sub: 'strip', tone: 'orange' },
          { label: 'CEF', sub: 'registry + selected', tone: 'green' },
          { label: 'Publish', sub: 're-derive', tone: 'teal' },
          { label: 'PIF', sub: 'all data', tone: 'purple' },
        ],
      },
      {
        kind: 'text',
        content: '**5-step cascade:** `variants` row \u2192 strip atoms/slug from `field_candidates` \u2192 remove from CEF `variant_registry` + recalc selected \u2192 re-derive published from remaining \u2192 **PIF total cleanup** (images, evals, carousel slot, per-run history).',
      },
      {
        kind: 'callout',
        tone: 'accent',
        icon: '\u{26A0}\u{FE0F}',
        content: 'PIF cleanup is **total** \u2014 all images, eval records, and the carousel slot for that variant are permanently removed from JSON and SQL.',
      },
    ],
  },

  /* ── Row 4: Delete Run + Settings (2 cols) ────────────────────── */
  {
    num: 7,
    tone: 'teal',
    title: 'Delete Run (Evidence Strip)',
    blocks: [
      {
        kind: 'flow',
        boxes: [
          { label: 'SQL Run', sub: 'DELETE', tone: 'accent' },
          { label: 'JSON Run', sub: 'recalculate', tone: 'green' },
          { label: 'Candidates', sub: 'strip source', tone: 'orange' },
          { label: 'Publish', sub: 're-derive', tone: 'teal' },
        ],
      },
      {
        kind: 'text',
        content: 'Strips the run\'s **candidate evidence** from `field_candidates`, recalculates selected state. **Variants and PIF are untouched** \u2014 only discovery history removed.',
      },
      {
        kind: 'callout',
        tone: 'teal',
        icon: '\u{1F6E1}\u{FE0F}',
        content: '**Delete-all-runs** clears all history but variants, PIF images, and carousel slots **survive**. Published state re-derives from variants SSOT.',
      },
    ],
  },
  {
    num: 8,
    tone: 'muted',
    title: 'Key Settings',
    blocks: [
      {
        kind: 'table',
        headers: ['Setting', 'Default', 'Controls'],
        defaultCol: 1,
        rows: [],
      },
    ],
  },
];
