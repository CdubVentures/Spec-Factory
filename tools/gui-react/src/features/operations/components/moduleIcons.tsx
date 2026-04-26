// WHY: Single source of truth for per-module visuals (icon + label + canonical
// order). Consumed by the Overview ActiveAndSelectedRow strip and the Live Ops
// column. Adding a new worker type means one edit here.

export const MODULE_ORDER: readonly string[] = ['cef', 'pif', 'rdf', 'skf', 'kf', 'pipeline'];

export const MODULE_LABEL: Readonly<Record<string, string>> = {
  cef: 'CEF',
  pif: 'PIF',
  rdf: 'RDF',
  skf: 'SKU',
  kf: 'KF',
  pipeline: 'PL',
};

export function MiniIcon({ mod }: { mod: string }) {
  if (mod === 'cef') {
    return (
      <svg viewBox="0 0 22 10" width="14" height="7" aria-hidden>
        <polygon points="5,1 9,5 5,9 1,5" fill="currentColor" opacity="0.85" />
        <polygon points="17,1 21,5 17,9 13,5" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }
  if (mod === 'pif') {
    return (
      <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <circle cx="6" cy="6" r="1.2" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }
  if (mod === 'rdf' || mod === 'skf') {
    return (
      <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
        <polygon points="6,1 11,6 6,11 1,6" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (mod === 'kf') {
    return (
      <svg viewBox="0 0 24 8" width="16" height="6" aria-hidden>
        {[3, 9, 15, 21].map((cx, i) => (
          <circle key={cx} cx={cx} cy="4" r="2.2" fill="currentColor" opacity={1 - i * 0.15} />
        ))}
      </svg>
    );
  }
  if (mod === 'pipeline') {
    return (
      <svg viewBox="0 0 24 8" width="16" height="6" aria-hidden>
        {[0, 5, 10, 15, 20].map((x, i) => (
          <rect key={x} x={x} y="1.5" width="3.5" height="5" fill="currentColor" opacity={1 - i * 0.15} rx="0.6" />
        ))}
      </svg>
    );
  }
  return null;
}
