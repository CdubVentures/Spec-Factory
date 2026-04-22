// WHY: Row-scope action button. Fixed h-7 / text-[9px] / px-2 so every
// variant / per-key / group row renders pixel-identical buttons regardless of
// intent. Sizing is NOT overridable — that's the point of the primitive.

import { memo, type ReactNode } from 'react';
import { Spinner } from '../feedback/Spinner.tsx';
import {
  resolveIntentClassName,
  shouldBlockClick,
  shouldShowSpinner,
  type ActionButtonIntent,
} from './internals.ts';

export interface RowActionButtonProps {
  readonly intent: ActionButtonIntent;
  /** Visible label. ReactNode so callers can embed inline suffixes. */
  readonly label: ReactNode;
  readonly onClick: () => void;
  /** Only effective when intent is a locking intent ('locked' | 'stop'). Shows spinner + blocks click. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly title?: string;
  readonly ariaLabel?: string;
  /** Optional width class (e.g. 'w-16', 'w-20'). Siblings in the same row/cluster
   *  should share this value so every button lines up cleanly. Empty = content width. */
  readonly width?: string;
}

export const RowActionButton = memo(function RowActionButton({
  intent,
  label,
  onClick,
  busy = false,
  disabled = false,
  icon,
  title,
  ariaLabel,
  width,
}: RowActionButtonProps) {
  const intentCls = resolveIntentClassName(intent);
  const showSpinner = shouldShowSpinner(intent, busy);
  const blocked = shouldBlockClick(intent, busy, disabled);
  const widthCls = width ? ` ${width}` : '';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!blocked) onClick();
      }}
      disabled={blocked}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1 h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded whitespace-nowrap ${intentCls} disabled:opacity-40 disabled:cursor-not-allowed${widthCls}`}
    >
      {showSpinner && <Spinner className="h-2.5 w-2.5" />}
      {!showSpinner && icon != null && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
    </button>
  );
});
