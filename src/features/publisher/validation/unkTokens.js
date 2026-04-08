// WHY own set: shared UNKNOWN_VALUE_TOKENS includes "none" (semantic value in Field Studio,
// e.g. lighting: "none") and excludes tbd/tba/not available/not applicable/em-dash/en-dash.
// SSOT: universal-validator-reference.html Section 16, line 1797-1798.
export const UNK_TOKENS = new Set([
  'unk', 'unknown', 'n/a', 'na', 'not available',
  'not applicable', 'tbd', 'tba', 'unspecified', '-', '\u2014', '\u2013',
]);
