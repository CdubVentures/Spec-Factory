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
  { path: '/product', label: 'Selected Product', dividerAfter: true },
  { path: '/categories', label: 'Categories' },
  { path: '/catalog', label: 'Catalog', disabledOnTest: true, dividerAfter: true },
  { path: '/studio', label: 'Field Rules Studio', disabledOnAll: true, disabledOnTest: true, dividerAfter: true },
];

const OPS_TABS: TabDef[] = [
  { path: '/indexing', label: 'Indexing Lab', disabledOnAll: true, disabledOnTest: true },
  { path: '/pipeline-settings', label: 'Pipeline Settings', disabledOnAll: true, disabledOnTest: true },
  { path: '/runtime-ops', label: 'Runtime Ops', disabledOnTest: true },
  { path: '/llm-settings', label: 'Review LLM', disabledOnAll: true, dividerBefore: true },
  { path: '/review', label: 'Review Grid', disabledOnAll: true },
  { path: '/review-components', label: 'Review Components', disabledOnAll: true, dividerAfter: true },
  { path: '/billing', label: 'Billing & Learning', disabledOnTest: true },
  { path: '/storage', label: 'Storage' },
];

const activeCls = 'border-accent text-accent';
const inactiveCls = 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300/70 dark:hover:text-white';
const baseCls = 'inline-flex items-center px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors';
const disabledCls = `${baseCls} border-transparent opacity-40 cursor-not-allowed text-slate-400/70`;

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
                <span className="self-center mr-1 text-slate-300 dark:text-white/35 select-none">|</span>
              )}
              <span
                className={disabledCls}
                title={title}
              >
                {tab.label}
              </span>
              {tab.dividerAfter && (
                <span className="self-center ml-1 text-slate-300 dark:text-white/35 select-none">|</span>
              )}
            </span>
          );
        }
        return (
          <span key={tab.path} className="inline-flex items-center">
            {tab.dividerBefore && (
                <span className="self-center mr-1 text-slate-300 dark:text-white/35 select-none">|</span>
            )}
            <NavLink
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) => `${baseCls} ${isActive ? activeCls : inactiveCls}`}
            >
              {tab.label}
            </NavLink>
            {tab.dividerAfter && (
                <span className="self-center ml-1 text-slate-300 dark:text-white/35 select-none">|</span>
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

  const borderCls = 'border-b sf-border-default';

  return (
    <nav className={`sf-tab-nav flex items-center ${borderCls} px-4 overflow-x-auto`}>
      <TabGroup tabs={CATALOG_TABS} isAll={isAll} isTestMode={testMode} />
      <TabGroup tabs={OPS_TABS} isAll={isAll} isTestMode={testMode} />
    </nav>
  );
}
