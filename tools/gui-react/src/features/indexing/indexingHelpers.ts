import type { TimedIndexLabEvent } from './types.ts';

export function normalizeToken(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function getRefetchInterval(
  isRunning: boolean,
  isCollapsed: boolean,
  activeMs = 2000,
  idleMs = 10000
): number | false {
  if (isCollapsed) return false;
  return isRunning ? activeMs : idleMs;
}

export function truthyFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  const token = normalizeToken(value);
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
}

export function cleanVariant(value: string) {
  const text = String(value || '').trim();
  return text || '';
}

export function displayVariant(value: string) {
  const cleaned = cleanVariant(value);
  return cleaned || '(base / no variant)';
}

export function ambiguityLevelFromFamilyCount(count: number) {
  const safe = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
  if (safe >= 9) return 'extra_hard';
  if (safe >= 6) return 'very_hard';
  if (safe >= 4) return 'hard';
  if (safe >= 2) return 'medium';
  if (safe === 1) return 'easy';
  return 'unknown';
}

export function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  const digits = size >= 100 || idx === 0 ? 0 : 1;
  return `${formatNumber(size, digits)} ${units[idx]}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toLocaleString();
}

export function providerFromModelToken(value: string) {
  const token = normalizeToken(value);
  if (!token) return 'openai';
  if (token.startsWith('gemini')) return 'gemini';
  if (token.startsWith('deepseek')) return 'deepseek';
  return 'openai';
}

export function stripThinkTags(raw: string) {
  return String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function extractJsonCandidate(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1).trim();
  }
  return '';
}

export function extractBalancedJsonSegments(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const segments: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (ch === '\\') {
          escaping = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) {
        depth += 1;
        continue;
      }
      if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          segments.push(text.slice(start, i + 1).trim());
          break;
        }
      }
    }
  }
  return segments;
}

export function tryJsonParseCandidate(candidate: string): unknown | null {
  const token = String(candidate || '').trim();
  if (!token) return null;
  const variants = [token];
  const withoutTrailingCommas = token.replace(/,\s*([}\]])/g, '$1').trim();
  if (withoutTrailingCommas && withoutTrailingCommas !== token) {
    variants.push(withoutTrailingCommas);
  }
  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch {
      // continue
    }
  }
  return null;
}

export function parseJsonLikeText(value: string): unknown | null {
  const text = String(value || '').trim();
  if (!text) return null;

  const candidates: string[] = [];
  const push = (candidate: string) => {
    const token = String(candidate || '').trim();
    if (!token) return;
    if (!candidates.includes(token)) candidates.push(token);
  };

  const stripped = stripThinkTags(text);
  push(text);
  push(stripped);
  push(extractJsonCandidate(text));
  push(extractJsonCandidate(stripped));

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null = null;
  while ((fenceMatch = fenceRegex.exec(stripped)) !== null) {
    push(String(fenceMatch[1] || '').trim());
  }

  for (const segment of extractBalancedJsonSegments(stripped)) {
    push(segment);
  }
  for (const segment of extractBalancedJsonSegments(text)) {
    push(segment);
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const parsed = tryJsonParseCandidate(candidates[i]);
    if (parsed === null) continue;
    if (typeof parsed === 'string') {
      const nested = tryJsonParseCandidate(parsed);
      if (nested !== null) return nested;
    }
    return parsed;
  }

  return null;
}

export function prettyJsonText(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = parseJsonLikeText(text);
  if (parsed !== null) {
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      // fall through
    }
  }
  return stripThinkTags(text) || text;
}

export function isJsonText(value: string) {
  return parseJsonLikeText(String(value || '')) !== null;
}

export function hostFromUrl(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function looksLikeGraphqlUrl(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return text.includes('/graphql') || text.includes('graphql?') || text.includes('operationname=');
}

export function looksLikeJsonUrl(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return /\.json($|[?#])/i.test(text) || /[?&]format=json/i.test(text) || text.includes('/json');
}

export function looksLikePdfUrl(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return /\.pdf($|[?#])/i.test(text);
}

export function formatDuration(ms: number) {
  const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function percentileMs(values: number[], percentile = 95) {
  const clean = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const rank = Math.max(0, Math.min(clean.length - 1, Math.ceil((percentile / 100) * clean.length) - 1));
  return clean[rank] || 0;
}

export function formatLatencyMs(value: number) {
  const safe = Math.max(0, Number(value) || 0);
  if (safe >= 1000) {
    return `${formatNumber(safe / 1000, 2)} s`;
  }
  return `${formatNumber(safe, 0)} ms`;
}

// ── Query Family Badge Registry ─────────────────────────────────────
// WHY: Single source of truth for query family → badge class mapping.
// Adding a new query family requires editing only this record.

const QUERY_FAMILY_BADGES: Record<string, string> = {
  manufacturer_html:    'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
  manual_pdf:           'bg-violet-600 text-white dark:bg-violet-500 dark:text-white',
  support_docs:         'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-white',
  review_lookup:        'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
  benchmark_lookup:     'bg-teal-600 text-white dark:bg-teal-500 dark:text-white',
  fallback_web:         'bg-slate-500 text-white dark:bg-slate-400 dark:text-white',
  targeted_single:      'bg-orange-500 text-white dark:bg-orange-400 dark:text-white',
  targeted_single_field:'bg-orange-500 text-white dark:bg-orange-400 dark:text-white',
  spec_sheet:           'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white',
  review:               'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
  product_page:         'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
};

const QUERY_FAMILY_FALLBACK = 'bg-gray-500 text-white dark:bg-gray-400 dark:text-white';

export function queryFamilyBadge(family: string): string {
  return QUERY_FAMILY_BADGES[normalizeToken(family)] ?? QUERY_FAMILY_FALLBACK;
}

export function computeActivityStats(
  events: TimedIndexLabEvent[],
  nowMs: number,
  predicate: (event: TimedIndexLabEvent) => boolean
) {
  const oneMinuteMs = 60_000;
  const currentWindowMinutes = 2;
  const horizonMinutes = 10;
  let currentEvents = 0;
  const bucketCounts = new Array(horizonMinutes).fill(0);
  for (const event of events) {
    if (!predicate(event)) continue;
    const ageMs = nowMs - event.tsMs;
    if (ageMs < 0 || ageMs > horizonMinutes * oneMinuteMs) continue;
    if (ageMs <= currentWindowMinutes * oneMinuteMs) currentEvents += 1;
    const bucketIdx = Math.floor(ageMs / oneMinuteMs);
    if (bucketIdx >= 0 && bucketIdx < horizonMinutes) {
      bucketCounts[bucketIdx] += 1;
    }
  }
  const peak = Math.max(1, ...bucketCounts);
  return {
    currentPerMin: currentEvents / currentWindowMinutes,
    peakPerMin: peak
  };
}
