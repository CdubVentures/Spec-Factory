import { z } from 'zod';

// WHY: Shared evidence-ref shape — {url, tier} per source, per-discovery.
// Used by evidence_refs on the response (keyed by color atom / edition slug)
// and by variant identity-check mappings.
const evidenceRefSchema = z.object({
  url: z.string(),
  tier: z.string(),
});

/**
 * Zod schema for the Color & Edition Finder LLM response.
 *
 * - colors: flat array of ALL product colors (colors[0] = default)
 * - editions: keyed by slug, each with its own colors subset
 * - default_color: must equal colors[0]
 * - evidence_refs: keyed by color atom or edition slug → array of {url, tier}
 */
export const colorEditionFinderResponseSchema = z.object({
  colors: z.array(z.string()),
  color_names: z.record(z.string(), z.string()).default({}),
  editions: z.record(z.string(), z.object({
    display_name: z.string().default(''),
    colors: z.array(z.string()),
  })).default({}),
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
  evidence_refs: z.record(z.string(), z.array(evidenceRefSchema)).default({}),
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
  evidence_refs: z.array(evidenceRefSchema).default([]),
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
