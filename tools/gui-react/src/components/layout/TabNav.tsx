import { NavLink } from 'react-router-dom';
import { useUiStore } from '../../stores/uiStore';
import { isTestCategory } from '../../utils/testMode';

interface TabDef {
  path: string;
  label: string;
  disabledOnAll?: boolean;
  disabledOnTest?: boolean;
  dividerAfter?: boolean;
  dividerBefore?: boolean;
}

const CATALOG_TABS: TabDef[] = [
  { path: '/', label: 'Overview' },
  { path: '/categories', label: 'Categories' },
  { path: '/catalog', label: 'Catalog', disabledOnTest: true },
  { path: '/product', label: 'Selected Product', dividerAfter: true },
  { path: '/studio', label: 'Field Rules Studio', disabledOnAll: true, disabledOnTest: true },
  { path: '/test-mode', label: 'Field Test', dividerAfter: true },
];

const OPS_TABS: TabDef[] = [
  { path: '/indexing', label: 'Indexing Lab', disabledOnAll: true, disabledOnTest: true },
  { path: '/runtime-ops', label: 'Runtime Ops', disabledOnTest: true },
  { path: '/llm-settings', label: 'Review LLM', disabledOnAll: true, dividerBefore: true },
  { path: '/review', label: 'Review Grid', disabledOnAll: true },
  { path: '/review-components', label: 'Review Components', disabledOnAll: true, dividerAfter: true },
  { path: '/billing', label: 'Billing & Learning', disabledOnTest: true },
  { path: '/storage', label: 'Storage' },
];

const activeCls = 'border-transparent text-accent dark:text-accent-dark';
const inactiveCls = 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200';
const baseCls = 'inline-flex items-center px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors';
const disabledCls = `${baseCls} border-transparent opacity-40 cursor-not-allowed text-gray-600 dark:text-gray-400`;

function TabGroup({ tabs, isAll, isTestMode }: { tabs: TabDef[]; isAll: boolean; isTestMode: boolean }) {
  return (
    <>
      {tabs.map((tab) => {
        const disabled = (isAll && tab.disabledOnAll) || (isTestMode && tab.disabledOnTest);
        if (disabled) {
          const title = isTestMode && tab.disabledOnTest
            ? 'Not available in Field Test'
            : 'Select a specific category to use this tab';
          return (
            <span
              key={tab.path}
              className="inline-flex items-center"
            >
              {tab.dividerBefore && (
                <span className="self-center mr-1 text-gray-300 dark:text-gray-600 select-none">|</span>
              )}
              <span
                className={disabledCls}
                title={title}
              >
                {tab.label}
              </span>
              {tab.dividerAfter && (
                <span className="self-center ml-1 text-gray-300 dark:text-gray-600 select-none">|</span>
              )}
            </span>
          );
        }
        return (
          <span key={tab.path} className="inline-flex items-center">
            {tab.dividerBefore && (
              <span className="self-center mr-1 text-gray-300 dark:text-gray-600 select-none">|</span>
            )}
            <NavLink
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls}`}
            >
              {tab.label}
            </NavLink>
            {tab.dividerAfter && (
              <span className="self-center ml-1 text-gray-300 dark:text-gray-600 select-none">|</span>
            )}
          </span>
        );
      })}
    </>
  );
}

export function TabNav() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';
  const testMode = isTestCategory(category);

  const borderCls = testMode
    ? 'border-b-2 border-amber-400 dark:border-amber-500'
    : 'border-b border-gray-200 dark:border-gray-700';

  return (
    <nav className={`flex items-center ${borderCls} bg-white dark:bg-gray-800 px-4 overflow-x-auto`}>
      <TabGroup tabs={CATALOG_TABS} isAll={isAll} isTestMode={testMode} />
      <TabGroup tabs={OPS_TABS} isAll={isAll} isTestMode={testMode} />
    </nav>
  );
}
