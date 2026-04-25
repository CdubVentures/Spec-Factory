import { FlagIcon } from '../icons/FlagIcon.tsx';
import { DrawerSection, DrawerCard } from '../overlay/DrawerShell.tsx';
import { getFlagInfo } from '../../../utils/flagDescriptions.ts';
import { humanizeField } from '../../../utils/fieldNormalize.ts';
import { usePersistedToggle } from '../../../hooks/useSessionPersistence.ts';

interface FlagsSectionProps {
  reasonCodes: string[];
}

export function FlagsSection({ reasonCodes }: FlagsSectionProps) {
  const [expanded, toggleExpanded] = usePersistedToggle('flags:detail', false);

  if (reasonCodes.length === 0) return null;

  return (
    <DrawerSection
      title={`Flags (${reasonCodes.length})`}
      meta={
        <button
          onClick={() => toggleExpanded()}
          className="sf-icon-button text-[10px] sf-status-text-muted font-mono w-5 h-5 flex items-center justify-center rounded"
        >
          {expanded ? '−' : '+'}
        </button>
      }
    >
      {expanded ? (
        <div className="space-y-2">
          {reasonCodes.map((code) => {
            const info = getFlagInfo(code);
            return (
              <DrawerCard key={code} className="border-l-2 border-l-amber-400">
                <div className="flex items-center gap-1.5">
                  <FlagIcon className="w-3 h-3 sf-status-text-warning flex-shrink-0" />
                  <span className="text-xs font-semibold sf-text-primary">{info.label}</span>
                </div>
                <p className="text-[11px] sf-status-text-muted">{info.description}</p>
                <p className="text-[11px] sf-status-text-info">{info.recommendation}</p>
              </DrawerCard>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {reasonCodes.map((code) => {
            const info = getFlagInfo(code);
            return (
              <span
                key={code}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 sf-chip-warning-soft text-[10px] rounded"
              >
                <FlagIcon className="w-2.5 h-2.5" />
                {info.label}
              </span>
            );
          })}
        </div>
      )}
    </DrawerSection>
  );
}

interface FlagsOverviewSectionProps {
  flaggedProperties: Array<{ key: string; reasonCodes: string[] }>;
  getLabel?: (key: string) => string;
}

export function FlagsOverviewSection({ flaggedProperties, getLabel = humanizeField }: FlagsOverviewSectionProps) {
  const [expanded, toggleExpanded] = usePersistedToggle('flags:overview', false);

  if (flaggedProperties.length === 0) return null;

  const totalFlags = flaggedProperties.reduce((sum, p) => sum + p.reasonCodes.length, 0);

  return (
    <DrawerSection
      title={`Flags (${totalFlags} across ${flaggedProperties.length} properties)`}
      meta={
        <button
          onClick={() => toggleExpanded()}
          className="sf-icon-button text-[10px] sf-status-text-muted font-mono w-5 h-5 flex items-center justify-center rounded"
        >
          {expanded ? '−' : '+'}
        </button>
      }
    >
      {expanded ? (
        <div className="space-y-2">
          {flaggedProperties.map(({ key, reasonCodes }) => (
            <DrawerCard key={key} className="border-l-2 border-l-amber-400">
              <div className="flex items-center gap-1.5 mb-1">
                <FlagIcon className="w-3 h-3 sf-status-text-warning flex-shrink-0" />
                <span className="text-xs font-semibold sf-text-primary">{getLabel(key)}</span>
              </div>
              {reasonCodes.map((code) => {
                const info = getFlagInfo(code);
                return (
                  <div key={code} className="pl-4 text-[11px]">
                    <span className="sf-status-text-warning font-medium">{info.label}</span>
                    <span className="sf-status-text-muted mx-1">—</span>
                    <span className="sf-status-text-muted">{info.description}</span>
                  </div>
                );
              })}
            </DrawerCard>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {flaggedProperties.map(({ key, reasonCodes }) => (
            <span
              key={key}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 sf-chip-warning-soft text-[10px] rounded"
            >
              <FlagIcon className="w-2.5 h-2.5" />
              {getLabel(key)}: {reasonCodes.map((c) => getFlagInfo(c).label).join(', ')}
            </span>
          ))}
        </div>
      )}
    </DrawerSection>
  );
}
