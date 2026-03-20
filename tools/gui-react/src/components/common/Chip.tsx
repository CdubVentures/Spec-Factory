interface ChipProps {
  label: string;
  className?: string;
}

export function Chip({ label, className }: ChipProps) {
  return (
    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] ${className || 'sf-chip-accent'} border-[1.5px] border-current`}>
      {label}
    </span>
  );
}
