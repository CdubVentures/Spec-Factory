// WHY: Strip the composite provider prefix off a model identity for display.
// Persisted runs store the fully-qualified routing key (e.g.
// "lab-openai:gpt-5.4-mini") so the router can look the model up in the
// registry, but table cells and badges should show the bare model ID
// ("gpt-5.4-mini"). Mirror of src/core/llm/routeResolver.js#stripCompositeKey
// — the JS module is the behavioral SSOT.

export function displayModelName(model: string): string {
  const s = String(model || '').trim();
  const colon = s.indexOf(':');
  return colon > 0 ? s.slice(colon + 1) : s;
}
