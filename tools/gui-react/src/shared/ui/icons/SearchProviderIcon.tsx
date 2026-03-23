// WHY: Inline SVG icons for search engine providers.
// No icon library — follows project pattern (FlagIcon.tsx).
// Uses currentColor so icons inherit text color from parent.

interface IconProps {
  size?: number;
  className?: string;
}

function GoogleIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" opacity=".8" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".7" />
      <path d="M5.84 14.09A6.97 6.97 0 0 1 5.47 12c0-.72.13-1.43.37-2.09V7.07H2.18A11.96 11.96 0 0 0 .95 12c0 1.94.46 3.77 1.23 5.09l3.66-2.84v-.16z" opacity=".6" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.99 14.97.96 12 .96 7.7.96 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".9" />
    </svg>
  );
}

function BingIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 2v17.5l4.5 2.5 8-4.5v-5L10 9V2H5zm5 7.5l7.5 3v4L10 20v-6.5l-3-1.5V5l3 1.5v3z" opacity=".85" />
    </svg>
  );
}

function BraveIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L4 6v4c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4zm0 2.18L18 7.5v2.5c0 4.52-3.13 8.72-6 9.93C9.13 18.72 6 14.52 6 10V7.5L12 4.18z" opacity=".85" />
      <path d="M12 7l-3 1.5v3L12 13l3-1.5v-3L12 7z" opacity=".6" />
    </svg>
  );
}

function SearxngIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6M11 8v6" strokeWidth="1.5" />
    </svg>
  );
}

function DualIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="12" r="6" opacity=".7" />
      <circle cx="15" cy="12" r="6" opacity=".7" />
    </svg>
  );
}

function GenericSearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

const PROVIDER_ICON_MAP: Record<string, (props: IconProps) => JSX.Element> = {
  serper: GoogleIcon,
  google: GoogleIcon,
  bing: BingIcon,
  'brave-api': BraveIcon,
  brave: BraveIcon,
  searxng: SearxngIcon,
  duckduckgo: SearxngIcon,
  dual: DualIcon,
};

interface SearchProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

export function SearchProviderIcon({ provider, size = 14, className }: SearchProviderIconProps) {
  const token = String(provider || '').trim().toLowerCase();

  if (token.includes('+')) {
    const parts = token.split('+').map((p) => p.trim()).filter(Boolean);
    return (
      <span className={`inline-flex items-center gap-0.5 ${className || ''}`}>
        {parts.map((p, i) => {
          const Icon = PROVIDER_ICON_MAP[p] ?? GenericSearchIcon;
          return <Icon key={`${p}-${i}`} size={size} />;
        })}
      </span>
    );
  }

  const Icon = PROVIDER_ICON_MAP[token] ?? GenericSearchIcon;
  return <Icon size={size} className={className} />;
}
