import { Tip } from '../../../shared/ui/feedback/Tip';

interface StatCardProps {
  label: string;
  value: string | number;
  tip?: string;
}

export function StatCard({ label, value, tip }: StatCardProps) {
  return (
    <div className="sf-surface-card rounded px-3 py-2 min-w-[8rem]">
      <div className="sf-text-nano font-medium sf-text-subtle uppercase tracking-wider">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className="text-lg font-semibold sf-text-primary mt-0.5">{value}</div>
    </div>
  );
}
