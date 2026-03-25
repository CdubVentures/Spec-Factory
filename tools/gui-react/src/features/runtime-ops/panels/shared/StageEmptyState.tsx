import type { ReactNode } from 'react';

interface StageEmptyStateProps {
  /** HTML entity or emoji string for the centered icon */
  icon: string;
  /** Primary heading text */
  heading: string;
  /** Extended description below the heading */
  description: string;
  /** Optional extra content below the description */
  children?: ReactNode;
}

export function StageEmptyState({ icon, heading, description, children }: StageEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="text-3xl opacity-60" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="text-sm font-medium sf-text-muted">{heading}</div>
      <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">{description}</p>
      {children}
    </div>
  );
}
