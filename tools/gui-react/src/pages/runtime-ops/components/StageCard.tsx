interface StageCardProps {
  label: string;
  value: number;
  className: string;
}

export function StageCard({ label, value, className }: StageCardProps) {
  return (
    <div className={`min-w-[8rem] px-3 py-2 rounded border ${className}`}>
      <div className="text-[10px] uppercase tracking-wider font-medium opacity-80">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
