export type RuntimeStepId =
  | 'run-setup'
  | 'run-output'
  | 'scoring-evidence'
  | 'automation'
  | 'observability-trace'
  | 'fetch-network'
  | 'browser-rendering'
  | 'parsing'
  | 'ocr'
  | 'planner-triage'
  | 'llm-cortex';

interface RuntimeFlowStepIconProps {
  id: RuntimeStepId;
  active: boolean;
  enabled?: boolean;
}

export function RuntimeFlowStepIcon({
  id,
  active,
  enabled = true,
}: RuntimeFlowStepIconProps) {
  const toneClass = active
    ? 'sf-callout sf-callout-info'
    : 'sf-callout sf-callout-neutral';

  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {id === 'run-setup' ? (
          <>
            <path d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="9" cy="6" r="1.4" />
            <circle cx="15" cy="12" r="1.4" />
            <circle cx="11" cy="18" r="1.4" />
          </>
        ) : null}
        {id === 'run-output' ? (
          <>
            <path d="M4 6h16v12H4z" />
            <path d="M4 11h16" />
            <path d="M8 15h8" />
          </>
        ) : null}
        {id === 'scoring-evidence' ? (
          <>
            <path d="M12 3v18" />
            <path d="M5 7l7 5-7 5" />
            <path d="M19 7l-7 5 7 5" />
          </>
        ) : null}
        {id === 'automation' ? (
          <>
            <circle cx="12" cy="12" r="5" />
            <path d="M12 7V3M12 21v-4M17 12h4M3 12h4" />
            <path d="M15.5 8.5l2-2M6.5 17.5l2-2M15.5 15.5l2 2M6.5 6.5l2 2" />
            <path d="M16 12l-2.5-1.5v3z" />
          </>
        ) : null}
        {id === 'observability-trace' ? (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" />
            <path d="M7 3v3M17 3v3" />
          </>
        ) : null}
        {id === 'fetch-network' ? (
          <>
            <path d="M12 4v4M12 16v4" />
            <path d="M4 12h4M16 12h4" />
            <circle cx="12" cy="12" r="2" />
            <path d="M8.5 8.5l-2-2M17.5 17.5l-2-2M15.5 8.5l2-2M6.5 17.5l2-2" />
          </>
        ) : null}
        {id === 'browser-rendering' ? (
          <>
            <rect x="3" y="4" width="18" height="14" rx="1.5" />
            <path d="M3 8h18" />
            <circle cx="5.5" cy="6" r="0.7" />
            <circle cx="7.8" cy="6" r="0.7" />
            <circle cx="10.1" cy="6" r="0.7" />
            <path d="M7 12h10M7 15h6" />
          </>
        ) : null}
        {id === 'parsing' ? (
          <>
            <path d="M7 4h10v16H7z" />
            <path d="M5 6l2-2M5 18l2 2M19 6l-2-2M19 18l-2 2" />
            <path d="M10 9h4M10 12h4M10 15h2" />
          </>
        ) : null}
        {id === 'ocr' ? (
          <>
            <path d="M5 4h4M15 4h4M5 20h4M15 20h4" />
            <path d="M4 5v4M4 15v4M20 5v4M20 15v4" />
            <path d="M8 9h8M8 12h6M8 15h8" />
          </>
        ) : null}
        {id === 'planner-triage' ? (
          <>
            <circle cx="6" cy="6" r="2" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
            <path d="M8 6h8" />
            <path d="M12 8v8" />
          </>
        ) : null}
        {id === 'llm-cortex' ? (
          <>
            <rect x="6" y="4" width="12" height="16" rx="2" />
            <path d="M10 8h4M10 12h4M10 16h4" />
            <path d="M6 9H3M6 15H3M18 9h3M18 15h3" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
