interface SectionHeaderProps {
  children: React.ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
      <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">{children}</span>
    </div>
  );
}
