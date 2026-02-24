import type { ReactNode } from 'react';

interface StepProps {
  index: number;
  title: string;
  subtitle?: string;
  isLast?: boolean;
  children: ReactNode;
}

export function Step({ index, title, subtitle, isLast, children }: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 flex items-center justify-center text-[10px] font-bold">
          {index + 1}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</span>
          {subtitle && <span className="text-[10px] text-gray-400 dark:text-gray-500">{subtitle}</span>}
        </div>
        <div className="text-xs">{children}</div>
      </div>
    </div>
  );
}

interface VerticalStepperProps {
  children: ReactNode;
}

export function VerticalStepper({ children }: VerticalStepperProps) {
  return <div className="flex flex-col">{children}</div>;
}
