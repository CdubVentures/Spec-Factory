import { z } from 'zod';
import { evidenceRefsSchema } from '../../core/finder/evidencePromptFragment.js';
import { valueConfidenceSchema } from '../../core/finder/valueConfidencePromptFragment.js';

/**
 * Zod schema for the Color & Edition Finder LLM response (per-variant evidence).
 *
 * Shape:
 * - colors[i] = { name: "<atom>", confidence, evidence_refs: [...] }
 *   evidence_refs are scoped to THAT color atom; confidence is the LLM's
 *   overall rating for this value, calibrated against the cited evidence.
 * - editions[slug] = { display_name, colors: [combo], confidence, evidence_refs: [...] }
 * - default_color must equal colors[0].name
 *
 * A source URL may appear on multiple items if it genuinely covers them all.
 */
const colorItemSchema = z.object({
  name: z.string(),
  confidence: valueConfidenceSchema.default(0),
  evidence_refs: evidenceRefsSchema,
});

const editionItemSchema = z.object({
  display_name: z.string().default(''),
  colors: z.array(z.string()),
  confidence: valueConfidenceSchema.default(0),
  evidence_refs: evidenceRefsSchema,
});

export const colorEditionFinderResponseSchema = z.object({
  colors: z.array(colorItemSchema),
  color_names: z.record(z.string(), z.string()).default({}),
  editions: z.record(z.string(), editionItemSchema).default({}),
  default_color: z.string().default(''),
  siblings_excluded: z.array(z.string()).default([]),
  discovery_log: z.object({
    confirmed_from_known: z.array(z.string()).default([]),
    added_new: z.array(z.string()).default([]),
    rejected_from_known: z.array(z.string()).default([]),
    urls_checked: z.array(z.string()).default([]),
    queries_run: z.array(z.string()).default([]),
  }).default({
    confirmed_from_known: [],
    added_new: [],
    rejected_from_known: [],
    urls_checked: [],
    queries_run: [],
  }),
});

/* ── Variant identity check response schema ───────────────────── */

/**
 * LLM response for variant identity check (Run 2+).
 *
 * Actions:
 * - match: Same variant — confirm identity, optionally update mutable fields. match = existing variant_id.
 * - new: Genuinely new variant — create with new hash. match = null.
 * - reject: Hallucinated/garbage discovery — skip entirely. match = null.
 */
const variantMappingSchema = z.object({
  new_key: z.string(),
  match: z.string().nullable(),
  action: z.enum(['match', 'new', 'reject']),
  reason: z.string(),
  verified: z.boolean().default(false),
  preferred_label: z.string().optional(),
  confidence: valueConfidenceSchema.default(0),
  evidence_refs: evidenceRefsSchema,
});

const orphanRemapSchema = z.object({
  orphan_key: z.string(),
  action: z.enum(['remap', 'dead']),
  remap_to: z.string().nullable(),
  reason: z.string(),
});

export const variantIdentityCheckResponseSchema = z.object({
  mappings: z.array(variantMappingSchema),
  remove: z.array(z.string()).default([]),
  orphan_remaps: z.array(orphanRemapSchema).default([]),
});
