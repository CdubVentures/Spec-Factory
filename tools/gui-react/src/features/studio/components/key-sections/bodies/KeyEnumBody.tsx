// WHY: Body for Enum Policy panel — thin wrapper around EnumConfigurator
// (already shared) so the drawer's Enum tab and Key Navigator's Enum Policy
// section share one source.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import type { EnumEntry } from "../../../../../types/studio.ts";
import { EnumConfigurator } from "../../EnumConfigurator.tsx";
import { strN } from "../../../state/nestedValueHelpers.ts";

export interface KeyEnumBodyProps extends KeySectionBaseProps {
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
}

export function KeyEnumBody({
  selectedKey,
  currentRule,
  updateField,
  knownValues,
  enumLists,
  BadgeRenderer: B,
  disabled,
}: KeyEnumBodyProps) {
  const contractType = strN(currentRule, "contract.type");
  return (
    <EnumConfigurator
      fieldKey={selectedKey}
      rule={currentRule}
      knownValues={knownValues}
      enumLists={enumLists}
      contractType={contractType}
      onUpdate={(path, value) => updateField(selectedKey, path, value)}
      isEgLocked={!!disabled}
      renderLabelSuffix={(path) => <B p={path} />}
    />
  );
}
