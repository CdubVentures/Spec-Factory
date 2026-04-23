export function PublishedMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      width="12"
      height="12"
      aria-label="Published"
      role="img"
    >
      <title>Published</title>
      <circle
        cx="5"
        cy="5"
        r="4"
        fill="none"
        stroke="var(--sf-success, #22c55e)"
        strokeWidth="1.5"
      />
      <text
        x="5"
        y="7.2"
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill="var(--sf-success, #22c55e)"
      >
        P
      </text>
    </svg>
  );
}
