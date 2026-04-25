import { useNavigate } from 'react-router-dom';
import { useIndexLabStore } from '../../features/indexing/state/indexlabStore.ts';
import { useTabStore } from '../../stores/tabStore.ts';
import type { CatalogRow } from '../../types/product.ts';
import './OverviewLinksCell.css';

interface OverviewLinksCellProps {
  readonly row: CatalogRow;
  readonly category: string;
}

interface LinkSpec {
  readonly tabId: string;
  readonly label: string;
  readonly className: string;
  readonly title: string;
}

const LINKS: readonly LinkSpec[] = [
  { tabId: 'colorEditionFinder',  label: 'CEF', className: 'sf-ol-link-cef', title: 'Open Color & Edition Finder for this product' },
  { tabId: 'productImageFinder',  label: 'PIF', className: 'sf-ol-link-pif', title: 'Open Product Image Finder for this product' },
  { tabId: 'releaseDateFinder',   label: 'RDF', className: 'sf-ol-link-rdf', title: 'Open Release Date Finder for this product' },
  { tabId: 'skuFinder',           label: 'SKU', className: 'sf-ol-link-skf', title: 'Open SKU Finder for this product' },
  { tabId: 'keyFinder',           label: 'KF',  className: 'sf-ol-link-kf',  title: 'Open Key Finder for this product' },
];

export function OverviewLinksCell({ row, category }: OverviewLinksCellProps) {
  const navigate = useNavigate();

  const open = (tabId: string) => {
    // WHY: IndexingPage's drill-down Model column is indexed by base_model
    // (see deriveFilteredCatalog.ts). Writing row.model would mismatch, and
    // the picker's self-healing effect (indexingCatalogDerivations.ts) would
    // call setPickerModel(base_model) — that setter cascade-wipes
    // pickerProductId, which hides the tab bar.
    useIndexLabStore.setState({
      pickerBrand: row.brand,
      pickerModel: row.base_model,
      pickerProductId: row.productId,
      pickerRunId: '',
    });
    useTabStore.getState().set(
      `indexing:tab:active:${row.productId}:${category}`,
      tabId,
    );
    navigate('/indexing');
  };

  return (
    <div className="sf-ol-links">
      {LINKS.map((l) => (
        <button
          key={l.tabId}
          type="button"
          className={`sf-ol-link ${l.className}`}
          title={l.title}
          onClick={(e) => { e.stopPropagation(); open(l.tabId); }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

interface OverviewLinksHeaderToggleProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function OverviewLinksHeaderToggle({ open, onToggle }: OverviewLinksHeaderToggleProps) {
  return (
    <button
      type="button"
      className="sf-ol-header-toggle"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Hide deep-link column' : 'Show deep-link column'}
      title={open ? 'Hide deep-links' : 'Show deep-links to Indexing Lab (CEF/PIF/RDF/SKU/KF)'}
    >
      <svg
        className={`sf-ol-header-caret ${open ? 'sf-ol-header-caret--open' : ''}`}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open ? <span className="sf-ol-header-label">Links</span> : null}
    </button>
  );
}
