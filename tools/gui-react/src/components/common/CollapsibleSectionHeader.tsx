interface CollapsibleSectionHeaderProps {
  children: React.ReactNode;
  summary?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

export function CollapsibleSectionHeader({ children, summary, isOpen, onToggle }: CollapsibleSectionHeaderProps) {
  return (
    <div
      onClick={onToggle}
      className="flex items-baseline gap-2 pt-2 pb-1.5 border-b-[1.5px] border-[var(--sf-token-text-primary)] cursor-pointer select-none"
    >
      <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary flex-1">{children}</span>
      <span className="text-[11px] font-mono sf-text-subtle">
        {summary && <>{summary} &middot; </>}{isOpen ? 'collapse \u25B4' : 'expand \u25BE'}
      </span>
    </div>
  );
}
