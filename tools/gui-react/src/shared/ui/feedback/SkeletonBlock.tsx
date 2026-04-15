interface SkeletonBlockProps {
  /** CSS class(es) for size — must be a sf-skel-* modifier from theme.css */
  className?: string;
}

export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return <div className={`sf-shimmer${className ? ` ${className}` : ''}`} />;
}
