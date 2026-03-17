import { memo } from 'react';

type HealthStatus = 'green' | 'gray' | 'red';

interface HealthDotProps {
  status: HealthStatus;
}

const STATUS_COLORS: Record<HealthStatus, string> = {
  green: 'var(--sf-success, #22c55e)',
  gray: 'var(--sf-muted, #6b7280)',
  red: 'var(--sf-error, #dc2626)',
};

const STATUS_TITLES: Record<HealthStatus, string> = {
  green: 'Provider healthy',
  gray: 'No health data',
  red: 'Provider unreachable',
};

export const HealthDot = memo(function HealthDot({ status }: HealthDotProps) {
  return (
    <span
      className="inline-block flex-shrink-0 rounded-full"
      style={{
        width: 8,
        height: 8,
        backgroundColor: STATUS_COLORS[status],
      }}
      title={STATUS_TITLES[status]}
    />
  );
});
