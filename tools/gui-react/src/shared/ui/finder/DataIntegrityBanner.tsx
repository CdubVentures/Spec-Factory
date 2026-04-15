/**
 * DataIntegrityBanner — shared warning banner for finder data issues.
 *
 * Renders an inline SVG warning icon + red text banner. Designed to be
 * reusable across all finder modules (PIF orphans, stale prices, bad SKUs, etc.).
 */

interface DataIntegrityBannerProps {
  readonly message: string;
}

export function DataIntegrityBanner({ message }: DataIntegrityBannerProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded sf-surface-elevated border border-[var(--sf-status-danger)] bg-[color-mix(in_srgb,var(--sf-status-danger)_8%,transparent)]">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className="w-4 h-4 shrink-0"
        aria-hidden="true"
      >
        <path
          d="M10 2L1.5 17h17L10 2z"
          stroke="var(--sf-status-danger)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M10 8v4"
          stroke="var(--sf-status-danger)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.5" r="0.8" fill="var(--sf-status-danger)" />
      </svg>
      <span className="text-[10px] font-semibold sf-status-text-danger leading-tight">
        {message}
      </span>
    </div>
  );
}
