// WHY own set: shared UNKNOWN_VALUE_TOKENS includes "none" (semantic value in Field Studio,
// e.g. lighting: "none") and excludes tbd/tba/not available/not applicable/em-dash/en-dash.
// These tokens represent user input strings that mean "no data" — they normalize to null.
export const ABSENCE_TOKENS = new Set([
  'unk', 'unknown', 'n/a', 'na', 'not available',
  'not applicable', 'tbd', 'tba', 'unspecified', '-', '\u2014', '\u2013',
]);
