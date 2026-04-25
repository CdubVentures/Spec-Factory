interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaColor?: 'green' | 'red' | 'gray';
}

export function MetricCard({ label, value, delta, deltaColor = 'gray' }: MetricCardProps) {
  const colorMap = { green: 'sf-status-text-success', red: 'sf-status-text-danger', gray: 'sf-status-text-muted' };
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm">
      <p className="text-xs sf-status-text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {delta && <p className={`mt-1 text-sm ${colorMap[deltaColor]}`}>{delta}</p>}
    </div>
  );
}
