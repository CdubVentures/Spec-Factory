interface HeroBandProps {
  /** Left side of title row: title text, subtitle, status chips */
  titleRow: React.ReactNode;
  /** Right side of title row: info chips, tips */
  trailing?: React.ReactNode;
  /** Optional footer strip below main content (inline metrics, etc.) */
  footer?: React.ReactNode;
  /** Main content: stat grid, narrative, additional sections */
  children: React.ReactNode;
}

export function HeroBand({ titleRow, trailing, footer, children }: HeroBandProps) {
  return (
    <div className="sf-surface-elevated rounded-sm border sf-border-soft px-7 py-6 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
        <div className="flex items-baseline gap-3">
          {titleRow}
        </div>
        {trailing && (
          <div className="flex items-center gap-2">
            {trailing}
          </div>
        )}
      </div>
      {children}
      {footer && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-3.5 mt-3.5 border-t sf-border-soft">
          {footer}
        </div>
      )}
    </div>
  );
}
