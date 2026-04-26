import { useRunningModulesForProductOrdered } from '../../features/operations/hooks/useFinderOperations.ts';
import { MODULE_LABEL, MiniIcon } from '../../features/operations/components/moduleIcons.tsx';
import './LiveOpsCell.css';

export interface LiveOpsCellProps {
  readonly category: string;
  readonly productId: string;
}

export function LiveOpsCell({ category, productId }: LiveOpsCellProps) {
  const mods = useRunningModulesForProductOrdered(category, productId);

  if (mods.length === 0) {
    return <span className="sf-live-empty" aria-label="No live operations">{'\u2014'}</span>;
  }

  return (
    <ul
      className="sf-live-stack"
      aria-label={`Live operations: ${mods.map((m) => MODULE_LABEL[m] ?? m).join(', ')}`}
    >
      {mods.map((mod) => (
        <li key={mod} className={`sf-live-item sf-live-item-${mod}`}>
          <span className="sf-live-ring" aria-hidden>
            <span className="sf-live-glyph"><MiniIcon mod={mod} /></span>
          </span>
          <span className="sf-live-tag">{MODULE_LABEL[mod] ?? mod.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  );
}
