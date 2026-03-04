import { usePersistedTab } from '../../stores/tabStore';
import { BrandManager } from '../studio/BrandManager';
import { ProductManager } from './ProductManager';

const TAB_IDS = ['brands', 'models'] as const;
type CatalogTab = (typeof TAB_IDS)[number];

const subTabs = [
  { id: 'brands', label: 'Brands' },
  { id: 'models', label: 'Models' },
] as const;

export function CatalogPage() {
  const [activeTab, setActiveTab] = usePersistedTab<CatalogTab>(
    'catalog:tab:main',
    'brands',
    { validValues: TAB_IDS },
  );

  return (
    <div className="space-y-4 sf-text-primary sf-border-default">
      {/* Sub-tab bar */}
      <div className="inline-flex gap-1 p-1 sf-tab-strip">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium sf-tab-item ${
              activeTab === tab.id ? 'sf-tab-item-active' : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'brands' && <BrandManager />}
      {activeTab === 'models' && <ProductManager />}
    </div>
  );
}
