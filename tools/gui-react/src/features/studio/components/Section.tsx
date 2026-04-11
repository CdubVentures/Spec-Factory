import type { ReactNode } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";

interface SectionProps {
  title: ReactNode;
  children: ReactNode;
  persistKey: string;
  defaultOpen?: boolean;
  titleTooltip?: string;
  centerTitle?: boolean;
  disabled?: boolean;
}

export function Section({
  title,
  children,
  persistKey,
  defaultOpen = false,
  titleTooltip,
  centerTitle = false,
  disabled = false,
}: SectionProps) {
  const [open, , setOpen] = usePersistedToggle(persistKey, defaultOpen);
  const titleCls = centerTitle
    ? "text-center leading-snug"
    : "text-left pl-1 leading-snug";

  return (
    <div className="relative border sf-border-default rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full min-h-9 flex items-center gap-2 px-3 py-2 text-sm font-semibold sf-bg-surface-soft sf-dk-surface-700a50 sf-hover-bg-surface-soft-strong sf-dk-hover-surface-700 rounded relative"
      >
        {centerTitle ? (
          <>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              {open ? "-" : "+"}
            </span>
            <span className={`w-full ${titleCls}`}>{title}</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              {open ? "-" : "+"}
            </span>
            <span className={titleCls}>{title}</span>
          </>
        )}
      </button>
      {titleTooltip ? (
        <span
          className="absolute"
          style={{
            right: "-10px",
            top: "-2px",
            transform: "translateY(-16px)",
          }}
        >
          <Tip text={titleTooltip} />
        </span>
      ) : null}
      {open ? <div className={`p-3 space-y-3${disabled ? ' opacity-50 pointer-events-none select-none' : ''}`}>{children}</div> : null}
    </div>
  );
}

// WHY: Visual sub-grouping within a Section. Provides a label + optional disabled state
// with a subtle border separator. Not collapsible — just a layout grouping.
interface SubSectionProps {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  disabledHint?: string;
}

export function SubSection({ label, children, disabled, disabledHint }: SubSectionProps) {
  return (
    <div className={`border-t sf-border-default pt-3 first:border-t-0 first:pt-0${disabled ? ' opacity-50' : ''}`}>
      <div className="text-[11px] font-semibold sf-text-subtle mb-2 uppercase tracking-wide">{label}</div>
      <div className={disabled ? 'pointer-events-none' : ''}>
        {children}
      </div>
      {disabled && disabledHint ? (
        <div className="text-xs sf-text-subtle italic mt-1">{disabledHint}</div>
      ) : null}
    </div>
  );
}
