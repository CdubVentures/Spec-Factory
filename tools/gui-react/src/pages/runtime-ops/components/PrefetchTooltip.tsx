import type { ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { formatTooltip as formatTooltipText } from './prefetchTooltipHelpers.js';

export const formatTooltip = formatTooltipText;

interface UiTooltipProps {
  text: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function UiTooltip({
  text,
  children,
  side = 'top',
}: UiTooltipProps) {
  return (
    <Tooltip.Root delayDuration={180}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 max-w-sm px-3 py-2 text-xs leading-snug whitespace-pre-line text-gray-900 bg-white border border-gray-200 rounded shadow-lg dark:text-gray-100 dark:bg-gray-900 dark:border-gray-700"
          side={side}
          sideOffset={6}
        >
          {text}
          <Tooltip.Arrow className="fill-white dark:fill-gray-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface TooltipBadgeProps {
  className: string;
  tooltip: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function TooltipBadge({
  className,
  tooltip,
  children,
  side = 'top',
}: TooltipBadgeProps) {
  return (
    <UiTooltip text={tooltip} side={side}>
      <span className={className}>
        {children}
      </span>
    </UiTooltip>
  );
}
