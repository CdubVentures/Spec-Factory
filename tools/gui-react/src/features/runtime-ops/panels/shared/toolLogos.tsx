/**
 * Inline SVG logo components for tool branding in fetch/extraction/validation panels.
 * All use currentColor for theme compatibility. Sized via className.
 */

interface LogoProps {
  className?: string;
}

/** Code/script badge — curly braces icon for custom scripts that wrap external APIs. */
export function ScriptIcon({ className = 'w-5 h-5' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

/** Playwright logo — stylized play triangle. */
export function PlaywrightLogo({ className = 'w-5 h-5' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#2EAD33" />
      <polygon points="9,6 19,12 9,18" fill="white" />
    </svg>
  );
}

/** Crawlee logo — hexagon mark. */
export function CrawleeLogo({ className = 'w-5 h-5' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="#FF6F00" />
      <text x="12" y="15.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">C</text>
    </svg>
  );
}

/** Spec Factory app logo — geometric diamond/prism. */
export function SpecFactoryLogo({ className = 'w-5 h-5' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" opacity="0.15" />
      <polygon points="12,2 22,12 12,22 2,12" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <polygon points="12,6 18,12 12,18 6,12" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
