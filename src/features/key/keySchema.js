/**
 * Key Finder — Zod schemas (Phase 2 stub).
 *
 * Phase 2 ships the LLM config plumbing + finder module registration; the
 * actual orchestrator lands in Phase 3. These schemas are the minimum viable
 * shape for codegen to emit the phase schema preview. They will be refined
 * when runtime orchestration is wired.
 *
 * Exports:
 *   - keyFinderResponseSchema — LLM response shape (per-key, per-product)
 */

import { z } from 'zod';

const EvidenceEntry = z.object({
  url: z.string(),
  snippet: z.string().optional(),
});

const DiscoveryLog = z.object({
  urls_checked: z.array(z.string()).default([]),
  queries_run: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

export const keyFinderResponseSchema = z.object({
  field_key: z.string(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).default(0),
  evidence: z.array(EvidenceEntry).default([]),
  discovery_log: DiscoveryLog.default({ urls_checked: [], queries_run: [], notes: '' }),
});
