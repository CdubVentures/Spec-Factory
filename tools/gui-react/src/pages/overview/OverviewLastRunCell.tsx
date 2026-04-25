import type { CatalogRow } from '../../types/product.ts';
import { pullFormatDateTime } from '../../utils/dateTime.ts';
import './OverviewLastRunCell.css';

interface OverviewLastRunCellProps {
  readonly row: CatalogRow;
}

interface WorkerRow {
  readonly label: string;
  readonly className: string;
  readonly value: string;
}

function buildWorkerRows(row: CatalogRow): readonly WorkerRow[] {
  return [
    { label: 'CEF', className: 'sf-olr-line-cef', value: row.cefLastRunAt },
    { label: 'PIF', className: 'sf-olr-line-pif', value: row.pifLastRunAt },
    { label: 'RDF', className: 'sf-olr-line-rdf', value: row.rdfLastRunAt },
    { label: 'SKU', className: 'sf-olr-line-skf', value: row.skuLastRunAt },
    { label: 'KF',  className: 'sf-olr-line-kf',  value: row.kfLastRunAt  },
  ];
}

export function OverviewLastRunCell({ row }: OverviewLastRunCellProps) {
  const rows = buildWorkerRows(row);
  return (
    <div className="sf-olr-stack">
      {rows.map((r) => (
        <div key={r.label} className={`sf-olr-line ${r.className}`}>
          <span className="sf-olr-tag">{r.label}</span>
          <span className="sf-olr-time">{r.value ? pullFormatDateTime(r.value) : '\u2014'}</span>
        </div>
      ))}
    </div>
  );
}

interface OverviewLastRunHeaderToggleProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function OverviewLastRunHeaderToggle({ open, onToggle }: OverviewLastRunHeaderToggleProps) {
  return (
    <button
      type="button"
      className="sf-olr-header-toggle"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Hide last-run column' : 'Show last-run column'}
      title={open ? 'Hide last-run timestamps' : 'Show per-worker last-run timestamps (CEF/PIF/RDF/SKU/KF)'}
    >
      <svg
        className={`sf-olr-header-caret ${open ? 'sf-olr-header-caret--open' : ''}`}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open ? <span className="sf-olr-header-label">Last Run</span> : null}
    </button>
  );
}
