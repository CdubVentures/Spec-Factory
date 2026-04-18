// Central date/time formatting for the GUI frontend.
// Storage stays UTC; display is driven by user-selected timezone + date format
// (persisted in useUiStore, top-right Appearance panel).
// Uses native Intl.DateTimeFormat — no external date library.
//
// ── WHICH HELPER TO USE ──────────────────────────────────────────────────────
// Reactive page component (single call site)        → useFormatDate/Time/DateTime
// Shared or hot component (tooltips, table cells)   → pullFormatDate/Time/DateTime
// Product-field cell values (release_date etc.)     → formatCellValue (fieldNormalize.ts)
// Non-React context (sort, filter, comparators)     → pure formatDate/Time/DateTime
// Column header showing the active zone label       → useTimezoneLabel
// Elapsed / relative timer (compare against Date.now()) → parseBackendMs
//
// Never render dates via new Date().toLocaleString() / .split('T')[0] / .slice(0, 10)
// or hardcode 'America/Los_Angeles'. Never parse backend timestamps with
// new Date(iso).getTime() or Date.parse(iso) when comparing to Date.now() —
// SQLite emits TZ-less UTC strings that those paths treat as local time.
// See docs/07-patterns/anti-patterns.md.
// Adding a new timezone or date format option: extend SF_TIMEZONE_OPTIONS /
// SF_DATE_FORMAT_OPTIONS in stores/uiStore.ts plus the switch in formatDate +
// formatDateYMD. One-file-rule — no other changes required.

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../stores/uiStore.ts';

export type DateFormat = 'MM-DD-YY' | 'MM-DD-YYYY' | 'YYYY-MM-DD' | 'DD-MM-YY';

type Nullable = string | null | undefined;

// WHY: Intl.DateTimeFormat constructors load ICU locale data and cost ~1-5ms each.
// Cached by option-key so 1000+ table cells don't each pay the instantiation cost.
const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
function getFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let fmt = FORMATTER_CACHE.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', options);
    FORMATTER_CACHE.set(key, fmt);
  }
  return fmt;
}

// WHY: Date parsing is ~1μs per call but adds up at 1000+ cells. Short-circuit
// invalid/empty input with a single branch before Date construction.
//
// WHY (timezone normalization): SQLite's datetime('now') returns UTC timestamps
// WITHOUT any timezone suffix (e.g. "2026-04-17 21:24:10"). JavaScript's Date
// constructor treats TZ-less strings as LOCAL time, so 21:24 UTC would be shown
// as 21:24 local — a 7-hour skew for PDT viewers. Normalize SQLite-format
// strings to proper ISO-UTC ("2026-04-17T21:24:10Z") before parsing.
const SQLITE_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;
function toValidDate(iso: Nullable): Date | null {
  if (!iso) return null;
  const normalized = typeof iso === 'string' && SQLITE_DATETIME.test(iso)
    ? iso.replace(' ', 'T') + 'Z'
    : iso;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

// WHY: Elapsed/relative timers that compare backend timestamps against Date.now()
// must use this normalizer. SQLite's datetime('now') returns TZ-less UTC strings
// that JavaScript would otherwise parse as local time (causing 7h PDT skew).
// Returns epoch-ms for arithmetic; NaN for missing/invalid input — callers should
// guard with Number.isFinite() before using the result.
export function parseBackendMs(iso: Nullable): number {
  const d = toValidDate(iso);
  return d ? d.getTime() : Number.NaN;
}

// WHY: formatToParts returns a small array. Single pass via for-loop is faster than
// three .find() calls (which each do their own O(n) scan).
function extractDateParts(parts: Intl.DateTimeFormatPart[]): { yyyy: string; mm: string; dd: string } | null {
  let yyyy = '', mm = '', dd = '';
  for (const p of parts) {
    if (p.type === 'year') yyyy = p.value;
    else if (p.type === 'month') mm = p.value;
    else if (p.type === 'day') dd = p.value;
  }
  return (yyyy && mm && dd) ? { yyyy, mm, dd } : null;
}

function extractTimeParts(parts: Intl.DateTimeFormatPart[]): { hour: string; minute: string; second: string; dayPeriod: string } {
  let hour = '', minute = '', second = '', dayPeriod = '';
  for (const p of parts) {
    if (p.type === 'hour') hour = p.value;
    else if (p.type === 'minute') minute = p.value;
    else if (p.type === 'second') second = p.value;
    else if (p.type === 'dayPeriod') dayPeriod = p.value;
  }
  return { hour, minute, second, dayPeriod };
}

export function formatDate(iso: Nullable, timeZone: string, fmt: DateFormat): string {
  const date = toValidDate(iso);
  if (!date) return '';
  try {
    const formatter = getFormatter(`d:${timeZone}`, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = extractDateParts(formatter.formatToParts(date));
    if (!parts) return '';
    const { yyyy, mm, dd } = parts;
    switch (fmt) {
      case 'MM-DD-YY': return `${mm}-${dd}-${yyyy.slice(-2)}`;
      case 'MM-DD-YYYY': return `${mm}-${dd}-${yyyy}`;
      case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
      case 'DD-MM-YY': return `${dd}-${mm}-${yyyy.slice(-2)}`;
    }
  } catch {
    return '';
  }
}

export function formatTime(
  iso: Nullable,
  timeZone: string,
  hour12: boolean = true,
  withSeconds: boolean = false,
): string {
  const date = toValidDate(iso);
  if (!date) return '';
  try {
    const key = `t:${timeZone}:${hour12 ? '12' : '24'}:${withSeconds ? 's' : ''}`;
    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12,
    };
    if (withSeconds) options.second = '2-digit';
    const { hour, minute, second, dayPeriod } = extractTimeParts(
      getFormatter(key, options).formatToParts(date),
    );
    if (!hour || !minute) return '';
    const core = withSeconds && second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
    return hour12 && dayPeriod ? `${core} ${dayPeriod}` : core;
  } catch {
    return '';
  }
}

export function formatDateTime(
  iso: Nullable,
  timeZone: string,
  fmt: DateFormat,
  hour12: boolean = true,
): string {
  const datePart = formatDate(iso, timeZone, fmt);
  if (!datePart) return '';
  const timePart = formatTime(iso, timeZone, hour12);
  return timePart ? `${datePart} ${timePart}` : datePart;
}

/** Reformat a plain YYYY-MM-DD string (backend day buckets) without timezone conversion. */
export function formatDateYMD(ymd: Nullable, fmt: DateFormat): string {
  if (!ymd || ymd.length < 10) return ymd ? String(ymd) : '';
  const yyyy = ymd.slice(0, 4);
  const mm = ymd.slice(5, 7);
  const dd = ymd.slice(8, 10);
  // Cheap validation: separators and digit positions
  if (ymd[4] !== '-' || ymd[7] !== '-') return String(ymd);
  switch (fmt) {
    case 'MM-DD-YY': return `${mm}-${dd}-${yyyy.slice(-2)}`;
    case 'MM-DD-YYYY': return `${mm}-${dd}-${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD-MM-YY': return `${dd}-${mm}-${yyyy.slice(-2)}`;
  }
}

export function formatTimezoneLabel(timeZone: string, refDate: Date = new Date()): string {
  try {
    const parts = getFormatter(`tz:${timeZone}`, {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(refDate);
    for (const p of parts) {
      if (p.type !== 'timeZoneName') continue;
      const name = p.value;
      if (name && !name.startsWith('GMT') && !name.startsWith('UTC+') && !name.startsWith('UTC-')) {
        return name;
      }
      break;
    }
  } catch {
    // fall through
  }
  return timeZone;
}

// ── Reactive hooks (for page-level components) ───────────────────────────────
// WHY: One combined selector via useShallow — consumers only re-render when tz
// or dateFormat actually changes, not on any other ui-store update.

interface DateSettings {
  readonly timeZone: string;
  readonly dateFormat: DateFormat;
}

const selectDateSettings = (s: { userTimezone: string; dateFormat: DateFormat }): DateSettings => ({
  timeZone: s.userTimezone,
  dateFormat: s.dateFormat,
});

function useDateSettings(): DateSettings {
  return useUiStore(useShallow(selectDateSettings));
}

export function useFormatDate(): (iso: Nullable) => string {
  const { timeZone, dateFormat } = useDateSettings();
  return useCallback((iso) => formatDate(iso, timeZone, dateFormat), [timeZone, dateFormat]);
}

export function useFormatTime(
  hour12: boolean = true,
  withSeconds: boolean = false,
): (iso: Nullable) => string {
  const { timeZone } = useDateSettings();
  return useCallback(
    (iso) => formatTime(iso, timeZone, hour12, withSeconds),
    [timeZone, hour12, withSeconds],
  );
}

export function useFormatDateTime(hour12: boolean = true): (iso: Nullable) => string {
  const { timeZone, dateFormat } = useDateSettings();
  return useCallback(
    (iso) => formatDateTime(iso, timeZone, dateFormat, hour12),
    [timeZone, dateFormat, hour12],
  );
}

export function useFormatDateYMD(): (ymd: Nullable) => string {
  const { dateFormat } = useDateSettings();
  return useCallback((ymd) => formatDateYMD(ymd, dateFormat), [dateFormat]);
}

export function useTimezoneLabel(): string {
  const { timeZone } = useDateSettings();
  return formatTimezoneLabel(timeZone);
}

// ── Pull-based getters (no subscription, for hot paths) ──────────────────────
// WHY: For components rendered in large counts (cell tooltips, table cells,
// run history rows), subscription overhead dominates. These pull current
// settings imperatively; components pick up new settings on next re-render.

function readDateSettings(): DateSettings {
  const s = useUiStore.getState();
  return { timeZone: s.userTimezone, dateFormat: s.dateFormat };
}

export function pullFormatDate(iso: Nullable): string {
  const { timeZone, dateFormat } = readDateSettings();
  return formatDate(iso, timeZone, dateFormat);
}

export function pullFormatTime(iso: Nullable, hour12: boolean = true, withSeconds: boolean = false): string {
  const { timeZone } = readDateSettings();
  return formatTime(iso, timeZone, hour12, withSeconds);
}

export function pullFormatDateTime(iso: Nullable, hour12: boolean = true): string {
  const { timeZone, dateFormat } = readDateSettings();
  return formatDateTime(iso, timeZone, dateFormat, hour12);
}

export function pullFormatDateYMD(ymd: Nullable): string {
  const { dateFormat } = readDateSettings();
  return formatDateYMD(ymd, dateFormat);
}

// WHY: Product field values sometimes carry plain YYYY-MM-DD date strings
// (e.g. release_date). Detect those and reformat per user preference so they
// match the rest of the UI; leave all other values untouched.
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export function maybeFormatDateValue(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  return ISO_DATE_ONLY.test(s) ? pullFormatDateYMD(s) : s;
}
