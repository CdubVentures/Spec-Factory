import { z, toJSONSchema } from 'zod';

// ── Zod schema (universal response) ─────────────────────────────────────────

const decisionSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  decision: z.enum(['map_to_existing', 'keep_new', 'reject', 'set_unk']),
  resolved_to: z.union([z.string(), z.number(), z.null()]),
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
// WHY: No confidence gating. The 13-step re-validation is the only gate.
// The LLM's decision + resolved_to is applied unconditionally. If the repaired
// value doesn't pass re-validation, the repair fails — that's the real check.

/**
 * Apply LLM decisions to produce a repaired value.
 * @param {{ decisions: object[]|null, currentValue: *, shape: string }} opts
 * @returns {{ value: *, applied: object[] }}
 */
export function applyRepairDecisions({ decisions, currentValue, shape }) {
  if (!decisions || decisions.length === 0) {
    return { value: currentValue, applied: [] };
  }

  const applied = [];

  for (const dec of decisions) {
    if (dec.decision === 'reject' || dec.decision === 'set_unk') {
      applied.push({ ...dec, resolvedValue: null });
      continue;
    }

    const resolvedValue = dec.decision === 'keep_new'
      ? dec.resolved_to ?? dec.value
      : dec.resolved_to;
    applied.push({ ...dec, resolvedValue });
  }

  const value = shape === 'list'
    ? buildListValue(applied)
    : buildScalarValue(applied, currentValue);

  return { value, applied };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function buildScalarValue(applied, currentValue) {
  if (applied.length === 0) return currentValue;
  const dec = applied[0];
  if (dec.decision === 'reject' || dec.decision === 'set_unk') return 'unk';
  return dec.resolvedValue;
}

function buildListValue(applied) {
  const result = [];
  for (const dec of applied) {
    if (dec.decision === 'reject' || dec.decision === 'set_unk') continue;
    result.push(dec.resolvedValue);
  }
  return result;
}
