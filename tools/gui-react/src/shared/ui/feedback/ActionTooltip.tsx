import type { ReactElement } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

interface ActionTooltipProps {
  text: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function ActionTooltip({ text, children, side = 'top' }: ActionTooltipProps) {
  const tooltipText = String(text || '').trim();
  if (!tooltipText) return children;

  return (
    <Tooltip.Root delayDuration={180}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="sf-action-tooltip" side={side} sideOffset={8}>
          {tooltipText}
          <Tooltip.Arrow className="sf-action-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
