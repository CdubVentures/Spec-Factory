import { useState } from 'react';
import { FinderRunModelBadge, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { FinderRunDiamonds, finderRunFracClass } from './FinderRunDiamonds.tsx';
import { IndexLabLink } from './IndexLabLink.tsx';

export interface CefRunPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly filled: number;
  readonly total: number;
  readonly brand: string;
  readonly baseModel: string;
}

/**
 * Overview CEF cell — clicking the rhombus diamonds opens a popover with the
 * currently-resolved CEF model and a Run button that fires against the same
 * `/color-edition-finder/:category/:productId` endpoint the main CEF panel uses,
 * so IndexLab / telemetry pickup is identical.
 */
export function CefRunPopover({ productId, category, filled, total, brand, baseModel }: CefRunPopoverProps) {
  const [open, setOpen] = useState(false);
  const fire = useFireAndForget({ type: 'cef', category, productId });
  const {
    model: resolvedModel, accessMode, modelDisplay, effortLevel,
  } = useResolvedFinderModel('colorFinder');
  const isRunning = useIsModuleRunning('cef', productId);

  const runUrl = `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  // WHY: Keep popover open after click — users spam-click to queue multiple
  // runs and watch the active strip fill in without re-opening each time.
  const onRun = () => {
    fire(runUrl, {});
  };

  return (
    <span className="sf-run-diamond-strip">
    <Popover
      open={open}
      onOpenChange={setOpen}
      triggerLabel={`CEF ${filled}/${total} runs — click to open`}
      trigger={<FinderRunDiamonds filled={filled} total={total} pulsing={isRunning} />}
    >
      <FinderRunPopoverShell
        title="Color & Edition Finder"
        meta={<>{filled}/{total} runs</>}
        modelSlot={
          <FinderRunModelBadge
            labelPrefix="CEF"
            model={modelDisplay}
            accessMode={accessMode}
            thinking={resolvedModel?.thinking ?? false}
            webSearch={resolvedModel?.webSearch ?? false}
            effortLevel={effortLevel}
          />
        }
        actions={
          <button
            type="button"
            className="sf-frp-btn-primary"
            onClick={onRun}
            disabled={!productId}
            title="Run CEF — fire-and-forget; spam-click to queue multiple runs"
          >
            Run CEF
          </button>
        }
      />
    </Popover>
      {total > 0 && (
        <IndexLabLink
          category={category}
          productId={productId}
          brand={brand}
          baseModel={baseModel}
          tabId="colorEditionFinder"
          title="Open Color & Edition Finder"
          className={`sf-run-diamond-frac ${finderRunFracClass(filled, total)}`}
        >
          {filled}/{total}
        </IndexLabLink>
      )}
    </span>
  );
}
