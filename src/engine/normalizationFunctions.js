function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toStringSafe(value) {
  return String(value ?? '').trim();
}

function asNumber(value) {
  if (isFiniteNumber(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberAndUnit(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { value: null, unit: '' };
  }
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z"%]+)?/);
  if (!match) {
    return { value: null, unit: '' };
  }
  return {
    value: asNumber(match[1]),
    unit: String(match[2] || '').toLowerCase()
  };
}

function canonicalUnitToken(unit) {
  const token = String(unit || '').trim().toLowerCase();
  if (!token) {
    return '';
  }
  if (['g', 'gram', 'grams'].includes(token)) return 'g';
  if (['oz', 'ounce', 'ounces'].includes(token)) return 'oz';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(token)) return 'lbs';
  if (['mm', 'millimeter', 'millimeters'].includes(token)) return 'mm';
  if (['cm', 'centimeter', 'centimeters'].includes(token)) return 'cm';
  if (['in', 'inch', 'inches', '"'].includes(token)) return 'in';
  return token;
}

function convertUnit(value, fromUnit, toUnit) {
  const from = canonicalUnitToken(fromUnit);
  const to = canonicalUnitToken(toUnit);
  if (!isFiniteNumber(value) || !from || !to || from === to) {
    return value;
  }
  if (from === 'oz' && to === 'g') return value * 28.3495;
  if (from === 'lbs' && to === 'g') return value * 453.592;
  if (from === 'in' && to === 'mm') return value * 25.4;
  if (from === 'cm' && to === 'mm') return value * 10;
  if (from === 'g' && to === 'oz') return value / 28.3495;
  if (from === 'g' && to === 'lbs') return value / 453.592;
  return value;
}

function parseBoolean(value) {
  const token = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(token)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(token)) {
    return false;
  }
  return null;
}

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  const token = String(value ?? '').trim();
  if (!token) {
    return null;
  }
  const parsed = new Date(token);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function formatIsoDateUtc(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toISOString().split('T')[0];
}

function parseDateField(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  const token = toStringSafe(value);
  if (!token) {
    return null;
  }

  const iso = token.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    const day = Number.parseInt(iso[3] || '1', 10);
    return formatIsoDateUtc(year, month, day);
  }

  const quarter = token.match(/^q([1-4])\s+(\d{4})$/i);
  if (quarter) {
    const month = ((Number.parseInt(quarter[1], 10) - 1) * 3) + 1;
    return formatIsoDateUtc(Number.parseInt(quarter[2], 10), month, 1);
  }

  const yearOnly = token.match(/^(\d{4})$/);
  if (yearOnly) {
    return formatIsoDateUtc(Number.parseInt(yearOnly[1], 10), 1, 1);
  }

  const monthYear = token.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthYear) {
    const parsed = new Date(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }

  const parsed = new Date(token);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split('T')[0];
}

function normalizeUrlField(value) {
  const raw = toStringSafe(value);
  if (!raw) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseBooleanTemplate(value) {
  const token = toStringSafe(value).toLowerCase();
  if (!token) {
    return null;
  }
  if (['true', '1', 'yes', 'y', 'on'].includes(token)) return 'yes';
  if (['false', '0', 'no', 'n', 'off'].includes(token)) return 'no';
  if (['unk', 'unknown', 'n/a', 'na'].includes(token)) return 'unk';
  return null;
}

function parseIntegerField(value) {
  const numeric = asNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.round(numeric);
}

function parseNumberWithExpectedUnit(value, expectedUnit = '', acceptedUnits = []) {
  const text = toStringSafe(value);
  if (!text) {
    return { value: null, unit: '' };
  }

  const compact = text.replace(/,/g, '').trim();
  const scaled = compact.match(/^(-?\d+(?:\.\d+)?)\s*([kK])(?:\s*([a-zA-Z"%]+))?$/);
  if (scaled) {
    const numeric = Number.parseFloat(scaled[1]);
    if (!Number.isFinite(numeric)) {
      return { value: null, unit: '' };
    }
    const suffixUnit = canonicalUnitToken(scaled[3] || expectedUnit || '');
    return { value: numeric * 1000, unit: suffixUnit };
  }

  const parsed = parseNumberAndUnit(compact);
  if (parsed.value === null) {
    return parsed;
  }

  const parsedUnit = canonicalUnitToken(parsed.unit);
  if (!parsedUnit) {
    return { value: parsed.value, unit: canonicalUnitToken(expectedUnit) };
  }

  const allowed = new Set(
    [expectedUnit, ...acceptedUnits]
      .map((entry) => canonicalUnitToken(entry))
      .filter(Boolean)
  );
  if (allowed.size > 0 && !allowed.has(parsedUnit)) {
    return { value: null, unit: parsedUnit };
  }

  return { value: parsed.value, unit: parsedUnit };
}

function applyNumericRounding(value, decimals = 0) {
  if (!Number.isFinite(value)) {
    return value;
  }
  const scale = 10 ** Math.max(0, Number(decimals) || 0);
  return Math.round(value * scale) / scale;
}

function parseNumberListWithUnit(value, options = {}) {
  const expectedUnit = canonicalUnitToken(options.unit || '');
  const acceptedUnits = Array.isArray(options.unitAccepts) ? options.unitAccepts : [];
  const parts = parseList(value);
  const out = [];
  for (const part of parts) {
    const parsed = parseNumberWithExpectedUnit(part, expectedUnit, acceptedUnits);
    if (parsed.value === null) {
      return null;
    }
    let numeric = parsed.value;
    if (expectedUnit && parsed.unit && parsed.unit !== expectedUnit) {
      numeric = convertUnit(numeric, parsed.unit, expectedUnit);
    }
    out.push(applyNumericRounding(numeric, options.decimals ?? 0));
  }
  return out;
}

function parseNumberOrRangeList(value, options = {}) {
  const expectedUnit = canonicalUnitToken(options.unit || '');
  const acceptedUnits = Array.isArray(options.unitAccepts) ? options.unitAccepts : [];
  const rangeSeparators = Array.isArray(options.rangeSeparators) && options.rangeSeparators.length > 0
    ? options.rangeSeparators
    : ['-'];

  const splitRange = (text) => {
    for (const sep of rangeSeparators) {
      const idx = text.indexOf(sep);
      if (idx > 0) {
        return [text.slice(0, idx), text.slice(idx + sep.length)];
      }
    }
    return null;
  };

  const parts = parseList(value);
  const out = [];
  for (const part of parts) {
    const trimmed = toStringSafe(part);
    if (!trimmed) continue;
    const range = splitRange(trimmed);
    if (range) {
      for (const side of range) {
        const parsed = parseNumberWithExpectedUnit(side, expectedUnit, acceptedUnits);
        if (parsed.value === null) {
          return null;
        }
        let numeric = parsed.value;
        if (expectedUnit && parsed.unit && parsed.unit !== expectedUnit) {
          numeric = convertUnit(numeric, parsed.unit, expectedUnit);
        }
        out.push(applyNumericRounding(numeric, options.decimals ?? 0));
      }
      continue;
    }

    const parsed = parseNumberWithExpectedUnit(trimmed, expectedUnit, acceptedUnits);
    if (parsed.value === null) {
      return null;
    }
    let numeric = parsed.value;
    if (expectedUnit && parsed.unit && parsed.unit !== expectedUnit) {
      numeric = convertUnit(numeric, parsed.unit, expectedUnit);
    }
    out.push(applyNumericRounding(numeric, options.decimals ?? 0));
  }
  return out;
}

function resolveModeAlias(modeText, aliasMap = {}, fallbackMode = 'unknown') {
  const normalized = toStringSafe(modeText).toLowerCase();
  if (!normalized) {
    return fallbackMode;
  }
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (normalized === canonical.toLowerCase()) {
      return canonical;
    }
    if (Array.isArray(aliases) && aliases.some((alias) => normalized === String(alias).trim().toLowerCase())) {
      return canonical;
    }
  }
  return fallbackMode;
}

function parseLatencyModeList(value, options = {}) {
  const text = Array.isArray(value) ? value.join(', ') : toStringSafe(value);
  if (!text) {
    return [];
  }
  const modeAliases = options.modeAliases || {};
  const fallbackMode = toStringSafe(options.defaultMode || 'unknown').toLowerCase() || 'unknown';
  const decimals = options.decimals ?? 2;
  const pattern = /(-?\d+(?:\.\d+)?)\s*(?:ms)?\s*([^0-9,;|/]*)/ig;
  const out = [];

  for (const match of text.matchAll(pattern)) {
    const numeric = Number.parseFloat(match[1]);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const mode = resolveModeAlias(match[2], modeAliases, fallbackMode);
    out.push({
      ms: applyNumericRounding(numeric, decimals),
      mode
    });
  }

  return out.length > 0 ? out : null;
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const token = String(value ?? '').trim();
  if (!token) {
    return [];
  }
  return token
    .split(/[,;|/]+/)
    .map((part) => String(part || '').trim())
    .filter(Boolean);
}

function stripUnitSuffix(value) {
  const token = toStringSafe(value).replace(/[a-zA-Z%°]+$/, '').trim();
  return asNumber(token);
}

function stripCommas(value) {
  return toStringSafe(value).replace(/,/g, '');
}

function parsePollingList(value) {
  const values = parseList(value)
    .map((entry) => Number.parseInt(stripCommas(entry), 10))
    .filter((entry) => Number.isFinite(entry));
  return [...new Set(values)].sort((a, b) => b - a);
}

function parseDimensionList(value) {
  const text = Array.isArray(value) ? value.join(' ') : toStringSafe(value);
  const matches = text.match(/[\d.]+/g) || [];
  if (matches.length < 3) {
    return null;
  }
  const length = asNumber(matches[0]);
  const width = asNumber(matches[1]);
  const height = asNumber(matches[2]);
  if (length === null || width === null || height === null) {
    return null;
  }
  return {
    length,
    width,
    height
  };
}

function normalizeColorList(value) {
  return parseList(value)
    .map((entry) => toStringSafe(entry).toLowerCase())
    .filter(Boolean);
}

function parseLatencyList(value) {
  const parts = parseList(value);
  const out = [];
  for (const part of parts) {
    const match = String(part).match(/([\d.]+)\s*(wireless|wired|bluetooth|usb|2\.4g|2\.4ghz)?/i);
    if (!match) {
      continue;
    }
    const latency = asNumber(match[1]);
    if (latency === null) {
      continue;
    }
    out.push({
      value: latency,
      mode: toStringSafe(match[2] || 'default').toLowerCase()
    });
  }
  return out;
}

function parseDateSerial(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return toStringSafe(value);
}

function normalizeBoolean(value) {
  return parseBoolean(value);
}

export const NORMALIZATION_FUNCTIONS = {
  asNumber,
  parseNumberAndUnit,
  parseNumberWithExpectedUnit,
  canonicalUnitToken,
  convertUnit,
  parseBoolean,
  parseBooleanTemplate,
  parseDate,
  parseDateField,
  parseList,
  parseIntegerField,
  normalizeUrlField,
  parseNumberListWithUnit,
  parseNumberOrRangeList,
  parseLatencyModeList,
  applyNumericRounding,
  strip_unit_suffix: stripUnitSuffix,
  strip_commas: stripCommas,
  oz_to_g: (value) => {
    const numeric = asNumber(value);
    return numeric === null ? null : Math.round(convertUnit(numeric, 'oz', 'g'));
  },
  lbs_to_g: (value) => {
    const numeric = asNumber(value);
    return numeric === null ? null : Math.round(convertUnit(numeric, 'lbs', 'g'));
  },
  inches_to_mm: (value) => {
    const numeric = asNumber(value);
    return numeric === null ? null : Number.parseFloat(convertUnit(numeric, 'in', 'mm').toFixed(1));
  },
  cm_to_mm: (value) => {
    const numeric = asNumber(value);
    return numeric === null ? null : Number.parseFloat(convertUnit(numeric, 'cm', 'mm').toFixed(1));
  },
  parse_polling_list: parsePollingList,
  parse_dimension_list: parseDimensionList,
  normalize_color_list: normalizeColorList,
  parse_latency_list: parseLatencyList,
  parse_date_serial: parseDateSerial,
  normalize_boolean: normalizeBoolean
};

export {
  asNumber,
  applyNumericRounding,
  stripUnitSuffix,
  stripCommas,
  parseBooleanTemplate,
  parseDateField,
  parsePollingList,
  parseIntegerField,
  normalizeUrlField,
  parseNumberListWithUnit,
  parseNumberOrRangeList,
  parseNumberWithExpectedUnit,
  parseLatencyModeList,
  parseDimensionList,
  normalizeColorList,
  parseLatencyList,
  parseDateSerial,
  normalizeBoolean,
  parseBoolean,
  parseDate,
  parseList,
  parseNumberAndUnit,
  convertUnit,
  canonicalUnitToken
};
