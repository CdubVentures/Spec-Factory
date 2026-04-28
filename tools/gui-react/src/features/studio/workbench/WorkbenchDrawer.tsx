import { usePersistedTab } from '../../../stores/tabStore.ts';
import { humanizeField } from '../../../utils/fieldNormalize.ts';
import { useStudioFieldRulesActions, useStudioFieldRulesState } from '../state/studioFieldRulesController.ts';
import { SystemBadges } from './SystemBadges.tsx';
import { WorkbenchDrawerTabContent } from './WorkbenchDrawerTabContent.tsx';
import { strN } from './workbenchHelpers.ts';
import type { DrawerTab } from './workbenchTypes.ts';
import type { EnumEntry } from '../../../types/studio.ts';

interface Props {
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  onCommitImmediate: () => void;
  onClose: () => void;
  onNavigate: (key: string) => void;
}

// WHY: Tab order mirrors the Key Navigator panel order exactly so the two
// surfaces are 1:1. Adding a panel = add an entry here AND a body component.
const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'contract', label: 'Contract' },
  { id: 'priority', label: 'Priority' },
  { id: 'aiAssist', label: 'Ai Assist' },
  { id: 'enum', label: 'Enum Policy' },
  { id: 'constraints', label: 'Cross-Field Constraints' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'tooltip', label: 'Tooltip / Guidance' },
  { id: 'search', label: 'Search Hints & Aliases' },
];

const DRAWER_TAB_IDS = [
  'contract',
  'priority',
  'aiAssist',
  'enum',
  'constraints',
  'evidence',
  'tooltip',
  'search',
] as const satisfies ReadonlyArray<DrawerTab>;

// WHY: When a key is EG-locked (preset-managed), only Tooltip and Search Hints
// stay editable — matches Key Navigator where KeyTooltipSection and
// KeySearchHintsSection do not pass `disabled`, while every other section does.
const EG_EDITABLE_TABS: ReadonlySet<DrawerTab> = new Set(['tooltip', 'search']);

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
  onCommitImmediate,
  onClose,
  onNavigate,
}: Props) {
  const [activeTab, setActiveTab] = usePersistedTab<DrawerTab>(
    'studio:workbench:drawerTab',
    'contract',
    { validValues: DRAWER_TAB_IDS },
  );
  const { updateField } = useStudioFieldRulesActions();
  const { egLockedKeys } = useStudioFieldRulesState();
  const isEgLocked = egLockedKeys.includes(fieldKey);

  const update = (path: string, value: unknown) => updateField(fieldKey, path, value);

  const B = ({ p }: { p: string }) => (
    <SystemBadges fieldPath={p} />
  );

  const idx = fieldOrder.indexOf(fieldKey);
  const prevKey = idx > 0 ? fieldOrder[idx - 1] : null;
  const nextKey = idx < fieldOrder.length - 1 ? fieldOrder[idx + 1] : null;

  const reqLevel = strN(
    rule,
    'priority.required_level',
    strN(rule, 'required_level', 'non_mandatory'),
  );
  const reqColors: Record<string, string> = {
    mandatory: 'sf-chip-danger',
    non_mandatory: 'sf-chip-neutral',
  };

  const tabIsLocked = isEgLocked && !EG_EDITABLE_TABS.has(activeTab);

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
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${reqColors[reqLevel] || reqColors.non_mandatory}`}>
              {reqLevel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-0.5 mt-3 -mb-px">
          {DRAWER_TABS.map((tab) => {
            const isLockedTab = isEgLocked && !EG_EDITABLE_TABS.has(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-t border-b-2 ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : DRAWER_TAB_IDLE_CLASS
                } ${isLockedTab ? 'opacity-50' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {isEgLocked && (
        <div className="mx-4 mt-3 px-3 py-2 rounded sf-surface-alt sf-border-soft border text-[11px] sf-text-subtle flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>EG-managed field. Only Tooltip / Guidance and Search Hints &amp; Aliases can be customized.</span>
        </div>
      )}

      <div className={`p-4 space-y-3 ${tabIsLocked ? 'pointer-events-none opacity-40' : ''}`}>
        <WorkbenchDrawerTabContent
          activeTab={activeTab}
          category={category}
          fieldKey={fieldKey}
          rule={rule}
          knownValues={knownValues}
          enumLists={enumLists}
          fieldOrder={fieldOrder}
          onUpdate={update}
          onNavigate={onNavigate}
          isEgLocked={isEgLocked}
          disabled={tabIsLocked}
          B={B}
        />
      </div>
    </div>
  );
}
