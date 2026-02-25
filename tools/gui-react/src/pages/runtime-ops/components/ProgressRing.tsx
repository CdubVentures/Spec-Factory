import { pctString } from '../helpers';

interface ProgressRingProps {
  numerator: number;
  denominator: number;
  label?: string;
  size?: number;
  strokeWidth?: number;
  variant?: 'percentage' | 'fraction';
}

export function ProgressRing({
  numerator,
  denominator,
  label,
  size = 64,
  strokeWidth = 4,
  variant = 'percentage',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = denominator > 0 ? Math.min(1, numerator / denominator) : 0;
  const colorClass = variant === 'fraction'
    ? 'text-emerald-500'
    : pct >= 0.7 ? 'text-emerald-500' : pct >= 0.4 ? 'text-yellow-500' : 'text-red-400';

  return (
    <div className="text-center shrink-0">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" className={`${colorClass} transition-all duration-500`} strokeWidth={strokeWidth}
            strokeDasharray={`${pct * circumference} ${circumference}`}
            strokeDashoffset={0} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {variant === 'fraction' ? (
            <>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{numerator}</span>
              <span className="text-[9px] text-gray-400 dark:text-gray-500 -mt-0.5">/ {denominator}</span>
            </>
          ) : (
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{pctString(pct)}</span>
          )}
        </div>
      </div>
      {label && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>}
    </div>
  );
}
