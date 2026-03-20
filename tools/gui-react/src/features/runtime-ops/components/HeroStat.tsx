interface HeroStatProps {
  value: string | number;
  label: string;
  colorClass?: string;
}

export function HeroStat({ value, label, colorClass = 'text-[var(--sf-token-accent)]' }: HeroStatProps) {
  return (
    <div>
      <div className={`text-4xl font-bold leading-none tracking-tight ${colorClass}`}>{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">{label}</div>
    </div>
  );
}

const GRID_CLASSES: Record<number, string> = {
  4: 'grid grid-cols-2 md:grid-cols-4 gap-6 mb-5',
  6: 'grid grid-cols-3 md:grid-cols-6 gap-6 mb-5',
};

interface HeroStatGridProps {
  columns?: 4 | 6;
  children: React.ReactNode;
}

export function HeroStatGrid({ columns = 4, children }: HeroStatGridProps) {
  return <div className={GRID_CLASSES[columns]}>{children}</div>;
}
