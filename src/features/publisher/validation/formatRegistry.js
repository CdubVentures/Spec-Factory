// WHY: O(1) scaling. Adding a format = add one entry. No pipeline changes.
// Only types with genuinely strict structural formats get regexes.
// Generic types (string, number) rely on type coercion and normalization.
export const FORMAT_REGISTRY = {
  boolean: /^(yes|no)$/,
  date:    /^\d{4}-\d{2}-\d{2}$/,
  url:     /^https?:\/\/.+/,
};
