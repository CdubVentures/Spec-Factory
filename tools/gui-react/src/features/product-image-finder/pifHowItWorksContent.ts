/**
 * PIF "How It Works" content — pure data, no JSX.
 *
 * Consumed by FinderHowItWorks to render the explainer section
 * between the KPI grid and the All Images gallery.
 */

import type { HiwSection } from '../../shared/ui/finder/FinderHowItWorks.tsx';

export const pifHowItWorksSections: HiwSection[] = [
  {
    num: 1,
    tone: 'accent',
    title: 'Pipeline',
    blocks: [
      {
        kind: 'text',
        content: 'Discovers images for **each variant independently** using LLM web search, validates quality, removes backgrounds, then ranks candidates with a vision model.',
      },
      {
        kind: 'flow',
        boxes: [
          { label: 'CEF Variants', sub: 'colors + editions', tone: 'neutral' },
          { label: 'Loop', sub: 'per-view search', tone: 'accent' },
          { label: 'Quality Gate', sub: 'dedup + dimensions', tone: 'green' },
          { label: 'RMBG 2.0', sub: 'bg removal', tone: 'purple' },
          { label: 'Vision Eval', sub: 'rank best', tone: 'teal' },
        ],
      },
    ],
  },
  {
    num: 2,
    tone: 'teal',
    title: 'The Carousel Loop',
    blocks: [
      {
        kind: 'text',
        content: 'Each LLM call targets **one priority view** but keeps side-catches for any other view found. The loop cycles through views in budget order, then heroes, then stops.',
      },
      {
        kind: 'flow',
        loopArrow: true,
        boxes: [
          { label: 'Pick Focus View', sub: 'highest-priority gap', tone: 'accent' },
          { label: 'LLM Search', sub: '+discovery log', tone: 'purple' },
          { label: 'Download & Gate', sub: 'persist to disk', tone: 'green' },
          { label: 'Re-evaluate', sub: 'satisfied? next view', tone: 'teal' },
        ],
      },
      {
        kind: 'callout',
        tone: 'teal',
        icon: '\u{1F4A1}',
        content: 'When all views are satisfied or budget-exhausted, the loop switches to **hero mode**, then completes.',
      },
    ],
  },
  {
    num: 3,
    tone: 'green',
    title: 'Views vs Heroes',
    blocks: [
      {
        kind: 'compare',
        cards: [
          {
            tone: 'accent',
            badge: 'VIEW',
            title: '8 Product Angles',
            items: [
              'top, bottom, left, right, front, rear, angle, sangle',
              'Background removed (RMBG 2.0)',
              'Searched first, one at a time',
              'Budget: **5** calls / view, target: **3** images',
            ],
          },
          {
            tone: 'purple',
            badge: 'HERO',
            title: 'Lifestyle Shots',
            items: [
              'Full-scene 16:9 marketing images',
              'Background kept (context matters)',
              'Searched after all views done',
              'Budget: **3** calls, target: **3** images',
            ],
          },
        ],
      },
    ],
  },
  {
    num: 4,
    tone: 'orange',
    title: 'Learning (Per Variant)',
    blocks: [
      {
        kind: 'text',
        content: 'Every call returns a **discovery log** (URLs checked + queries run). The next call \u2014 whether view or hero, within the same loop or a future run \u2014 receives the full accumulated history so it **never repeats the same search**.',
      },
      {
        kind: 'learn-chain',
        cells: [
          {
            tone: 'accent',
            label: 'Call 1 \u00B7 View: Top',
            detail: 'Searches corsair.com, bestbuy.com. Finds 2 images. Logs URLs + queries.',
          },
          {
            tone: 'green',
            label: 'Call 2 \u00B7 View: Left',
            detail: 'Receives call 1\'s log \u2014 "don\'t repeat these." Tries new sources instead.',
          },
          {
            tone: 'purple',
            label: 'Call 5 \u00B7 Hero',
            detail: 'Receives calls 1\u20134\'s combined log. Finds lifestyle shots from entirely new sources.',
          },
        ],
      },
      {
        kind: 'callout',
        tone: 'orange',
        icon: '\u{1F4DA}',
        content: '**Images accumulate, not replace.** Run 1 finds 3 images, Run 2 finds 3 more \u2014 you now have ~6 unique images. The discovery log also persists, so future runs pick up where you left off.',
      },
    ],
  },
  {
    num: 5,
    tone: 'purple',
    title: 'Quality & Dedup',
    blocks: [
      {
        kind: 'flow',
        boxes: [
          { label: 'URL Dedup', sub: 'already fetched?', tone: 'accent' },
          { label: 'Hash Dedup', sub: 'same file bytes?', tone: 'purple' },
          { label: 'Dimensions', sub: 'per-view min W\u00D7H', tone: 'teal' },
          { label: '\u2713 Kept', sub: 'persisted', tone: 'green' },
        ],
      },
    ],
  },
  {
    num: 6,
    tone: 'amber',
    title: 'Evaluation & Carousel Slots',
    blocks: [
      {
        kind: 'text',
        content: 'A **vision LLM** ranks candidates per view. Carousel slots auto-fill from the winner, but you can always override by dragging an image to a slot.',
      },
      {
        kind: 'slot-steps',
        steps: [
          { tone: 'green', label: '1. Manual Override', detail: 'Drag an image to a slot \u2192 always wins.' },
          { tone: 'accent', label: '2. Eval Winner', detail: 'Vision LLM\'s top pick fills automatically.' },
          { tone: 'muted', label: '3. Empty', detail: 'No images found yet for this slot.' },
        ],
      },
    ],
  },
  {
    num: 7,
    tone: 'muted',
    title: 'Key Settings',
    span: 2,
    blocks: [
      {
        kind: 'table',
        headers: ['Setting', 'Default', 'Controls'],
        defaultCol: 1,
        rows: [
          ['`satisfactionThreshold`', '3', 'Images per view to be "satisfied"'],
          ['`viewAttemptBudget`', '5', 'Max LLM calls per unsatisfied view'],
          ['`reRunBudget`', '1', 'Extra calls for already-satisfied views'],
          ['`heroAttemptBudget`', '3', 'Max LLM calls for hero search'],
          ['`heroCount`', '3', 'Target hero images per variant'],
          ['`evalThumbSize`', '768', 'Thumbnail size for vision eval'],
        ],
      },
    ],
  },
];
