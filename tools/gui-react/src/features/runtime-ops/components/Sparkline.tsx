interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 120, height = 32, className }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ display: 'block' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="rgb(var(--sf-color-accent-rgb))"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
