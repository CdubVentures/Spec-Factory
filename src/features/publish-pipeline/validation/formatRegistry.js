// WHY: O(1) scaling. Adding a format = add one entry. No pipeline changes.
// Only templates with genuinely strict structural formats get regexes.
// Generic templates (text_field, number types) rely on checkType and normalization.
export const FORMAT_REGISTRY = {
  list_of_tokens_delimited: /^[a-z][a-z0-9-]*(\+[a-z][a-z0-9-]*)*$/,
  boolean_yes_no_unk:       /^(yes|no|unk)$/,
  date_field:               /^\d{4}-\d{2}-\d{2}$/,
};
