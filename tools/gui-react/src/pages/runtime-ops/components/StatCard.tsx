import { Tip } from '../../../components/common/Tip';

interface StatCardProps {
  label: string;
  value: string | number;
  tip?: string;
}

export function StatCard({ label, value, tip }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}
