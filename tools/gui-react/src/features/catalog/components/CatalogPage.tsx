import { usePersistedTab } from '../../../stores/tabStore';
import { TabStrip } from '../../../shared/ui/navigation/TabStrip';
import { BrandManager } from '../../studio';
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
      <TabStrip
        tabs={subTabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
        className="inline-flex gap-1 p-1 sf-tab-strip"
      />

      {activeTab === 'brands' && <BrandManager />}
      {activeTab === 'models' && <ProductManager />}
    </div>
  );
}
