import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '../../stores/uiStore.ts';
import { isTestCategory } from '../../utils/testMode.ts';
import { GLOBAL_TABS, CATALOG_TABS, OPS_TABS, SETTINGS_TABS, type TabDef } from '../../registries/pageRegistry.ts';
import { useSerperCreditQuery, creditChipClass, formatCredit } from '../../hooks/useSerperCreditQuery.ts';
import { hasLlmKeyGateErrors, deriveSerperKeyGateError } from '../../hooks/llmKeyGateHelpers.js';
import { api } from '../../api/client.ts';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import type { IndexingLlmConfigResponse } from '../../features/indexing/types.ts';

const activeCls = 'border-accent text-accent';
const inactiveCls = 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300/70 dark:hover:text-white';
const baseCls = 'inline-flex items-center px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors';
const disabledCls = `${baseCls} border-transparent opacity-40 cursor-not-allowed text-slate-400/70`;

function TabGroup({ tabs, isTestMode }: { tabs: readonly TabDef[]; isTestMode: boolean }) {
  return (
    <>
      {tabs.map((tab) => {
        const disabled = isTestMode && tab.disabledOnTest;
        if (disabled) {
          const title = 'Not available in Field Test';
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

const sectionLabelCls = 'inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider select-none';
const sectionIconCls = 'w-3.5 h-3.5';

// WHY: Globe icon — signals "not scoped to a category"
const globalIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor" className={sectionIconCls} aria-hidden="true">
    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.06-1.06l1.06 1.06ZM10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" clipRule="evenodd" />
    <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM2 10a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 2 10ZM15 10a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 15 10Z" />
  </svg>
);

// WHY: Tag/folder icon — signals "scoped to selected category"
const categoryIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor" className={sectionIconCls} aria-hidden="true">
    <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" />
  </svg>
);

const gearIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor" className={sectionIconCls} aria-hidden="true">
    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
  </svg>
);

export function TabNav() {
  const category = useUiStore((s) => s.category);
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
      {/* Global group — far left */}
      <div className="flex items-center gap-0.5 pr-3 border-r sf-border-default mr-1">
        <span className={`${sectionLabelCls} text-slate-400 dark:text-slate-500`} title="Cross-category surfaces">
          {globalIcon}
        </span>
        <TabGroup tabs={GLOBAL_TABS} isTestMode={testMode} />
      </div>

      {/* Category group — center */}
      <div className="flex items-center gap-0.5">
        <span className={`${sectionLabelCls} text-slate-400 dark:text-slate-500`} title="Scoped to selected category">
          {categoryIcon}
        </span>
        <TabGroup tabs={CATALOG_TABS} isTestMode={testMode} />
        <TabGroup tabs={OPS_TABS} isTestMode={testMode} />
      </div>

      {/* Settings group — pushed to far right */}
      <div className="ml-auto flex items-center gap-0.5 pl-3 border-l sf-border-default">
        <span className={`${sectionLabelCls} text-slate-400 dark:text-slate-500`}>
          {gearIcon}
        </span>
        <TabGroup tabs={SETTINGS_TABS} isTestMode={testMode} />
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
