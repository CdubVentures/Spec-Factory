import type { ReactNode } from 'react';

interface ReviewToolbarProps {
  readonly children: ReactNode;
}

export function ReviewToolbar({ children }: ReviewToolbarProps) {
  return (
    <div className="sf-review-toolbar sf-review-brand-filter-bar flex items-center gap-1.5 py-1 px-1 rounded overflow-x-auto">
      {children}
    </div>
  );
}
