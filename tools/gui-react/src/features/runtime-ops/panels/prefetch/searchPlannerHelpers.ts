import type { PrefetchLlmCall, SearchPlanPass } from '../../types';

/* ── Normalize helpers ─────────────────────────────────────────────── */

export function normalizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function normalizeToken(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function uniqueSorted(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const token = normalizeToken(value);
    if (token) unique.add(token);
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function normalizeQuery(query: string): string {
  return String(query || '').trim();
}

/* ── JSON parsing ──────────────────────────────────────────────────── */

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* ── Planner payload parsing ───────────────────────────────────────── */

export interface PlannerPromptInput {
  criticalFields: string[];
  missingCriticalFields: string[];
  existingQueries: string[];
  product?: {
    category?: string;
    brand?: string;
    model?: string;
    variant?: string;
  };
}

export interface PlannerInputSummary {
  callCountWithPayload: number;
  criticalFields: string[];
  missingCriticalFields: string[];
  existingQueries: string[];
  products: string[];
}

export function parsePlannerPayload(promptPreview: string | null): PlannerPromptInput | null {
  if (!promptPreview) return null;
  const topLevel = safeParseJson(promptPreview);
  const parseObject = (value: unknown): PlannerPromptInput | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const candidate: PlannerPromptInput = {
      criticalFields: normalizeList(source.criticalFields),
      missingCriticalFields: normalizeList(source.missingCriticalFields),
      existingQueries: normalizeList(source.existingQueries),
      product:
        source.product && typeof source.product === 'object' && !Array.isArray(source.product)
          ? source.product as PlannerPromptInput['product']
          : undefined,
    };
    if (
      candidate.criticalFields.length > 0
      || candidate.missingCriticalFields.length > 0
      || candidate.existingQueries.length > 0
      || !!candidate.product
    ) {
      return candidate;
    }
    return null;
  };

  const direct = parseObject(topLevel);
  if (direct) return direct;

  const nestedUser = topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel)
    ? String((topLevel as Record<string, unknown>).user || '')
    : '';
  return parseObject(safeParseJson(nestedUser));
}

/* ── Path detection ────────────────────────────────────────────────── */

export function isSchema4PlannerPath(calls: PrefetchLlmCall[]): boolean {
  if (calls.length === 0) return false;
  return calls.some((call) => call.reason === 'needset_search_planner');
}

export function isTierEnhancePath(plans: SearchPlanPass[]): boolean {
  return plans.some((p) => p.mode === 'tier_enhance');
}

/* ── Pass reason mapping ───────────────────────────────────────────── */

export function planReason(passName: string, index: number): string {
  const normalized = String(passName || '').trim().toLowerCase();
  if (normalized.startsWith('discovery_planner') || normalized === 'primary' || normalized === 'pass_primary') return 'discovery_planner_primary';
  return `pass_${String(index + 1)}`;
}

/* ── Aggregate planner input summary ───────────────────────────────── */

export function buildPlannerInputSummary(callPayloads: Array<PlannerPromptInput | null>): PlannerInputSummary {
  const out: PlannerInputSummary = {
    callCountWithPayload: 0,
    criticalFields: [],
    missingCriticalFields: [],
    existingQueries: [],
    products: [],
  };
  const criticalFields: string[] = [];
  const missingFields: string[] = [];
  const existingQueries: string[] = [];
  const products: string[] = [];
  for (const payload of callPayloads) {
    if (!payload) continue;
    out.callCountWithPayload += 1;
    criticalFields.push(...normalizeList(payload.criticalFields));
    missingFields.push(...normalizeList(payload.missingCriticalFields));
    existingQueries.push(...normalizeList(payload.existingQueries));
    if (payload.product) {
      const product = payload.product || {};
      const category = normalizeToken(String(product.category || '').trim());
      const brand = String(product.brand || '').trim();
      const model = String(product.model || '').trim();
      const variant = String(product.variant || '').trim();
      const productId = [category, brand, model, variant].filter(Boolean).join(' : ').trim();
      if (productId) products.push(productId);
    }
  }
  out.criticalFields = uniqueSorted(criticalFields);
  out.missingCriticalFields = uniqueSorted(missingFields);
  out.existingQueries = uniqueSorted(existingQueries);
  out.products = uniqueSorted(products);
  return out;
}
