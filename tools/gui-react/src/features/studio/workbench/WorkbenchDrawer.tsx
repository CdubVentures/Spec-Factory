import { useEffect, useState } from 'react';

import { api } from '../../../api/client.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { humanizeField } from '../../../utils/fieldNormalize.ts';
import { buildNextConsumerOverrides } from '../state/studioBehaviorContracts.ts';
import { useStudioFieldRulesActions } from '../state/studioFieldRulesController.ts';
import { SystemBadges } from './SystemBadges.tsx';
import { WorkbenchDrawerTabContent } from './WorkbenchDrawerTabContent.tsx';
import { strN } from './workbenchHelpers.ts';
import type { DownstreamSystem } from './systemMapping.ts';
import type { DrawerTab } from './workbenchTypes.ts';
import type {
  ComponentDbResponse,
  ComponentSource,
  EnumEntry,
} from '../../../types/studio.ts';

interface Props {
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse;
  componentSources: ComponentSource[];
  onCommitImmediate: () => void;
  onClose: () => void;
  onNavigate: (key: string) => void;
}

const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'contract', label: 'Contract' },
  { id: 'parse', label: 'Parse' },
  { id: 'enum', label: 'Enum' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'search', label: 'Search' },
  { id: 'deps', label: 'Deps' },
  { id: 'preview', label: 'Preview' },
];

const DRAWER_TAB_IDS = [
  'contract',
  'parse',
  'enum',
  'evidence',
  'search',
  'deps',
  'preview',
] as const satisfies ReadonlyArray<DrawerTab>;

const TEXT_GRAY_400 = 'sf-text-subtle';
const TEXT_GRAY_500 = 'sf-text-subtle';
const DRAWER_ICON_BUTTON_CLASS = `${TEXT_GRAY_400} hover:sf-text-muted disabled:opacity-30 text-sm`;
const DRAWER_CLOSE_BUTTON_CLASS = `${TEXT_GRAY_400} hover:sf-text-muted text-lg leading-none`;
const FIELD_KEY_BADGE_CLASS = `text-[10px] ${TEXT_GRAY_400} font-mono`;
const DRAWER_TAB_IDLE_CLASS = `border-transparent ${TEXT_GRAY_500} hover:sf-text-muted`;
const DRAWER_SHELL_CLASS = 'border-l sf-border-default sf-surface-shell overflow-y-auto';
const DRAWER_HEADER_CLASS = 'sticky top-0 z-10 sf-surface-shell border-b sf-border-default px-4 py-3';

export function WorkbenchDrawer({
  category,
  fieldKey,
  rule,
  fieldOrder,
  knownValues,
  enumLists,
  componentDb,
  componentSources,
  onCommitImmediate,
  onClose,
  onNavigate,
}: Props) {
  const [activeTab, setActiveTab] = usePersistedTab<DrawerTab>(
    'studio:workbench:drawerTab',
    'contract',
    { validValues: DRAWER_TAB_IDS },
  );
  const [consistencyPending, setConsistencyPending] = useState(false);
  const [consistencyMessage, setConsistencyMessage] = useState('');
  const [consistencyError, setConsistencyError] = useState('');
  const { updateField } = useStudioFieldRulesActions();

  const update = (path: string, value: unknown) => updateField(fieldKey, path, value);

  useEffect(() => {
    setConsistencyMessage('');
    setConsistencyError('');
  }, [fieldKey]);

  async function runEnumConsistency(options?: {
    formatGuidance?: string;
    reviewEnabled?: boolean;
  }) {
    if (consistencyPending) return;
    setConsistencyPending(true);
    setConsistencyMessage('');
    setConsistencyError('');
    try {
      const response = await api.post(`/studio/${category}/enum-consistency`, {
        field: fieldKey,
        apply: options?.reviewEnabled !== false,
        formatGuidance: options?.formatGuidance,
        reviewEnabled: options?.reviewEnabled,
      }) as {
        ok?: boolean;
        applied?: { changed?: number };
        skipped_reason?: string | null;
        error?: string;
      };
      if (response?.ok === false) {
        throw new Error(response?.error || 'Consistency run failed.');
      }
      const changed = Number(response?.applied?.changed || 0);
      if (changed > 0) {
        setConsistencyMessage(`Consistency applied ${changed} change${changed === 1 ? '' : 's'}.`);
      } else if (response?.skipped_reason) {
        setConsistencyMessage(`Consistency skipped: ${String(response.skipped_reason).replace(/_/g, ' ')}.`);
      } else {
        setConsistencyMessage('Consistency finished with no changes.');
      }
    } catch (error) {
      setConsistencyError(error instanceof Error ? error.message : 'Consistency run failed.');
    } finally {
      setConsistencyPending(false);
    }
  }

  const handleConsumerToggle = (
    fieldPath: string,
    system: DownstreamSystem,
    enabled: boolean,
  ) => {
    const currentConsumers = (rule.consumers || {}) as Record<string, Record<string, boolean>>;
    update('consumers', buildNextConsumerOverrides(currentConsumers, fieldPath, system, enabled));
    onCommitImmediate();
  };

  const B = ({ p }: { p: string }) => (
    <SystemBadges fieldPath={p} rule={rule} onToggle={handleConsumerToggle} />
  );

  const idx = fieldOrder.indexOf(fieldKey);
  const prevKey = idx > 0 ? fieldOrder[idx - 1] : null;
  const nextKey = idx < fieldOrder.length - 1 ? fieldOrder[idx + 1] : null;

  const reqLevel = strN(
    rule,
    'priority.required_level',
    strN(rule, 'required_level', 'expected'),
  );
  const reqColors: Record<string, string> = {
    identity: 'sf-llm-soft-badge',
    required: 'sf-chip-danger',
    critical: 'sf-chip-danger',
    expected: 'sf-chip-info',
    optional: 'sf-chip-neutral',
  };

  return (
    <div className={DRAWER_SHELL_CLASS} style={{ maxHeight: 'calc(100vh - 340px)' }}>
      <div className={DRAWER_HEADER_CLASS}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => prevKey && onNavigate(prevKey)}
              disabled={!prevKey}
              className={DRAWER_ICON_BUTTON_CLASS}
              title="Previous field"
            >
              &#9664;
            </button>
            <button
              onClick={() => nextKey && onNavigate(nextKey)}
              disabled={!nextKey}
              className={DRAWER_ICON_BUTTON_CLASS}
              title="Next field"
            >
              &#9654;
            </button>
          </div>
          <button
            onClick={onClose}
            className={DRAWER_CLOSE_BUTTON_CLASS}
            title="Close"
          >
            &#10005;
          </button>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{humanizeField(fieldKey)}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={FIELD_KEY_BADGE_CLASS}>{fieldKey}</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${reqColors[reqLevel] || reqColors.optional}`}>
              {reqLevel}
            </span>
          </div>
        </div>

        <div className="flex gap-0.5 mt-3 -mb-px">
          {DRAWER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-t border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : DRAWER_TAB_IDLE_CLASS
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <WorkbenchDrawerTabContent
          activeTab={activeTab}
          category={category}
          fieldKey={fieldKey}
          rule={rule}
          knownValues={knownValues}
          enumLists={enumLists}
          componentDb={componentDb}
          componentSources={componentSources}
          consistencyPending={consistencyPending}
          consistencyMessage={consistencyMessage}
          consistencyError={consistencyError}
          onRunConsistency={runEnumConsistency}
          onUpdate={update}
          onNavigate={onNavigate}
          B={B}
        />
      </div>
    </div>
  );
}
