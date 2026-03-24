import { humanizeField } from '../../utils/fieldNormalize.ts';

interface AvailabilityGuidanceProps {
  fieldsBelow: string[];
  criticalBelow: string[];
  missingRequired: string[];
  getLabel?: (key: string) => string;
}

export function AvailabilityGuidance({ fieldsBelow, criticalBelow, missingRequired, getLabel = humanizeField }: AvailabilityGuidanceProps) {
  if (fieldsBelow.length === 0 && criticalBelow.length === 0 && missingRequired.length === 0) {
    return (
      <div className="sf-callout sf-callout-success rounded p-3 text-sm">
        All fields meet their targets.
      </div>
    );
  }

  return (
    <div className="sf-surface-card rounded p-3 space-y-3">
      <h3 className="text-sm font-semibold">Field Availability Guidance</h3>

      {criticalBelow.length > 0 && (
        <div>
          <p className="text-xs font-medium sf-status-text-danger mb-1">
            Critical Fields Below Target ({criticalBelow.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {criticalBelow.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-xs sf-chip-danger">
                {getLabel(f)}
              </span>
            ))}
          </div>
        </div>
      )}

      {missingRequired.length > 0 && (
        <div>
          <p className="text-xs font-medium sf-status-text-warning mb-1">
            Missing Required Fields ({missingRequired.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {missingRequired.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-xs sf-chip-warning-strong">
                {getLabel(f)}
              </span>
            ))}
          </div>
        </div>
      )}

      {fieldsBelow.length > 0 && (
        <div>
          <p className="text-xs font-medium sf-status-text-warning mb-1">
            Fields Below Pass Target ({fieldsBelow.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {fieldsBelow.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded text-xs sf-chip-warning-soft">
                {getLabel(f)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
