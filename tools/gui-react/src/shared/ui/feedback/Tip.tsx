import * as Tooltip from '@radix-ui/react-tooltip';
import type { CSSProperties } from 'react';

export function Tip({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  if (!text) return null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          tabIndex={0}
          className={`sf-tip-trigger inline-flex shrink-0 items-center justify-center rounded-full align-middle cursor-help focus:outline-none ml-1 ${className || ''}`.trim()}
          style={{
            width: '0.95em',
            height: '0.95em',
            ...style
          }}
        >
          ?
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="sf-tooltip-content z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line rounded shadow-lg"
          sideOffset={5}
        >
          {text}
          <Tooltip.Arrow className="sf-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
