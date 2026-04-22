/**
 * Filter-bar icon set — small inline SVGs used by SearchBox, tools cluster,
 * and clear buttons. All 16x16 viewBox, 1.5 stroke. Color inherits via
 * `currentColor`. Size via className.
 */

import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'xmlns'>;

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 4h8v1.5H4zM4 7.25h8v1.5H4zM4 10.5h8v1.5H4z" />
    </svg>
  );
}

export function CollapseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 5.5h8V7H4zM4 9h8v1.5H4z" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M13 4a6 6 0 1 0 1.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 2v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <rect x="7.25" y="6.75" width="1.5" height="4.75" rx="0.75" fill="currentColor" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
    </svg>
  );
}
