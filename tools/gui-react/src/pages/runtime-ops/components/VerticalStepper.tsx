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
        <div className="w-6 h-6 rounded-full sf-step-index-badge flex items-center justify-center sf-text-nano font-bold">
          {index + 1}
        </div>
        {!isLast && <div className="w-0.5 flex-1 sf-meter-track mt-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold sf-text-primary">{title}</span>
          {subtitle && <span className="sf-text-nano sf-text-subtle">{subtitle}</span>}
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
