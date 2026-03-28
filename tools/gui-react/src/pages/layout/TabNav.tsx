import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '../../stores/uiStore.ts';
import { isTestCategory } from '../../utils/testMode.ts';
import { CATALOG_TABS, OPS_TABS, SETTINGS_TABS, type TabDef } from '../../registries/pageRegistry.ts';
import { useSerperCreditQuery, creditChipClass, formatCredit } from '../../hooks/useSerperCreditQuery.ts';
import { hasLlmKeyGateErrors, deriveSerperKeyGateError } from '../../hooks/llmKeyGateHelpers.js';
import { api } from '../../api/client.ts';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import type { IndexingLlmConfigResponse } from '../../features/indexing/types.ts';

const activeCls = 'border-accent text-accent';
const inactiveCls = 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300/70 dark:hover:text-white';
const baseCls = 'inline-flex items-center px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors';
const disabledCls = `${baseCls} border-transparent opacity-40 cursor-not-allowed text-slate-400/70`;

function TabGroup({ tabs, isAll, isTestMode }: { tabs: readonly TabDef[]; isAll: boolean; isTestMode: boolean }) {
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

const gearIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
  </svg>
);

export function TabNav() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';
  const testMode = isTestCategory(category);
  const { data: serper } = useSerperCreditQuery();
  const { data: llmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const llmKeysMissing = hasLlmKeyGateErrors(llmConfig?.routing_snapshot);
  const serperKeyMissing = Boolean(deriveSerperKeyGateError(serper));

  const borderCls = 'border-b sf-border-default';

  return (
    <nav className={`sf-tab-nav flex items-center ${borderCls} px-4 overflow-x-auto`}>
      <TabGroup tabs={CATALOG_TABS} isAll={isAll} isTestMode={testMode} />
      <TabGroup tabs={OPS_TABS} isAll={isAll} isTestMode={testMode} />

      {/* Settings group — pushed to far right */}
      <div className="ml-auto flex items-center gap-0.5 pl-4 border-l sf-border-default">
        <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
          {gearIcon}
          Settings
        </span>
        <TabGroup tabs={SETTINGS_TABS} isAll={isAll} isTestMode={testMode} />
        {serper?.configured && (
          <span className="ml-1.5 pl-1.5 border-l sf-border-default inline-flex items-center" title="Serper API credits remaining">
            <Chip
              label={`Serper: ${formatCredit(serper.credit)}`}
              className={creditChipClass(serper.credit)}
            />
          </span>
        )}
        {(llmKeysMissing || serperKeyMissing) && (
          <span className="ml-1.5 pl-1.5 border-l sf-border-default inline-flex items-center gap-1" title="API keys missing — pipeline runs blocked">
            {llmKeysMissing && <Chip label="LLM Keys Missing" className="sf-chip-danger" />}
            {serperKeyMissing && <Chip label="Serper Key Missing" className="sf-chip-danger" />}
          </span>
        )}
      </div>
    </nav>
  );
}
