import { z, toJSONSchema } from 'zod';

// ── Zod schema (Section 14 universal response) ──────────────────────────────

const decisionSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  decision: z.enum(['map_to_existing', 'keep_new', 'reject', 'set_unk']),
  resolved_to: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const repairResponseZodSchema = z.object({
  status: z.enum(['repaired', 'rerun_recommended']),
  reason: z.union([z.string(), z.null()]),
  decisions: z.array(decisionSchema),
});

// WHY: Strips $schema key — LLM providers don't expect it.
const { $schema, ...jsonSchema } = toJSONSchema(repairResponseZodSchema);
export const repairResponseJsonSchema = jsonSchema;

// ── Confidence thresholds (Section 14) ───────────────────────────────────────

const AUTO_APPLY = 0.8;
const REVIEW_FLOOR = 0.5;

// ── parseRepairResponse ──────────────────────────────────────────────────────

/**
 * Validate raw LLM response against the universal repair schema.
 * @param {*} raw - Parsed JSON object from LLM
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function parseRepairResponse(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Response must be a non-null object' };
  }
  const parsed = repairResponseZodSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map(i => i.message).join('; ') };
  }
  return { ok: true, data: parsed.data };
}

// ── applyRepairDecisions ─────────────────────────────────────────────────────

/**
 * Apply LLM decisions to produce a repaired value.
 * @param {{ decisions: object[]|null, currentValue: *, shape: string }} opts
 * @returns {{ value: *, confidence: number, applied: object[], skipped: object[] }}
 */
export function applyRepairDecisions({ decisions, currentValue, shape }) {
  if (!decisions || decisions.length === 0) {
    return { value: currentValue, confidence: 0, applied: [], skipped: [] };
  }

  const applied = [];
  const skipped = [];

  for (const dec of decisions) {
    if (dec.decision === 'reject' || dec.decision === 'set_unk') {
      applied.push({ ...dec, resolvedValue: 'unk', flagged: false });
      continue;
    }

    if (dec.confidence < REVIEW_FLOOR) {
      skipped.push(dec);
      continue;
    }

    const flagged = dec.confidence < AUTO_APPLY;
    const resolvedValue = dec.decision === 'keep_new'
      ? dec.resolved_to ?? dec.value
      : dec.resolved_to;
    applied.push({ ...dec, resolvedValue, flagged });
  }

  const value = shape === 'list'
    ? buildListValue(applied, skipped)
    : buildScalarValue(applied, skipped, currentValue);

  const confidences = applied.map(a => a.confidence).filter(c => typeof c === 'number');
  const confidence = confidences.length > 0 ? Math.min(...confidences) : 0;

  return { value, confidence, applied, skipped };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function buildScalarValue(applied, skipped, currentValue) {
  if (applied.length === 0 && skipped.length > 0) return 'unk';
  if (applied.length === 0) return currentValue;

  const dec = applied[0];
  if (dec.decision === 'reject' || dec.decision === 'set_unk') return 'unk';
  return dec.resolvedValue;
}

function buildListValue(applied, skipped) {
  const result = [];
  for (const dec of applied) {
    if (dec.decision === 'reject' || dec.decision === 'set_unk') continue;
    result.push(dec.resolvedValue);
  }
  return result;
}
