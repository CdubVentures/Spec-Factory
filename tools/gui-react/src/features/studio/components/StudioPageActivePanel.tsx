import { FieldRulesWorkbench } from '../workbench/FieldRulesWorkbench.tsx';
import { CompileReportsTab } from '../tabs/CompileReportsTab.tsx';
import { KeyNavigatorTab } from './KeyNavigatorTab.tsx';
import { MappingStudioTab } from './MappingStudioTab.tsx';
import { PerKeyDocsTab } from './PerKeyDocsTab.tsx';
import type { StudioPageActivePanelProps } from './studioPagePanelContracts.ts';

export function StudioPageActivePanel({
  activeTab,
  category,
  knownValuesSpecDbNotReady,
  mappingTabProps,
  keyNavigatorTabProps,
  contractTabProps,
  reportsTabProps,
  docsTabProps,
}: StudioPageActivePanelProps) {
  return (
    <>
      {knownValuesSpecDbNotReady ? (
        <div className="rounded sf-callout sf-callout-warning px-3 py-2">
          <div className="text-sm font-semibold sf-status-text-warning">
            Known values authority unavailable
          </div>
          <div className="text-xs sf-status-text-warning mt-1">
            SpecDb is not ready for {category}. Run compile/sync, then refresh
            to load authoritative enum values.
          </div>
        </div>
      ) : null}

      {activeTab === 'mapping' ? (
        <MappingStudioTab {...mappingTabProps} />
      ) : null}

      {activeTab === 'keys' ? (
        <KeyNavigatorTab {...keyNavigatorTabProps} />
      ) : null}

      {activeTab === 'contract' ? (
        <FieldRulesWorkbench {...contractTabProps} />
      ) : null}

      {activeTab === 'reports' ? (
        <CompileReportsTab {...reportsTabProps} />
      ) : null}

      {activeTab === 'docs' ? (
        <PerKeyDocsTab {...docsTabProps} />
      ) : null}
    </>
  );
}
