import { FieldRulesWorkbench } from '../workbench/FieldRulesWorkbench';
import { CompileReportsTab } from '../tabs/CompileReportsTab';
import { KeyNavigatorTab } from './KeyNavigatorTab';
import { MappingStudioTab } from './MappingStudioTab';
import type { StudioPageActivePanelProps } from './studioPagePanelContracts';

export function StudioPageActivePanel({
  activeTab,
  category,
  knownValuesSpecDbNotReady,
  mappingTabProps,
  keyNavigatorTabProps,
  contractTabProps,
  reportsTabProps,
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
    </>
  );
}
