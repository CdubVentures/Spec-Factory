// WHY: Body for Cross-Field Constraints panel — thin wrapper around
// KeyConstraintEditor so the drawer's Constraints tab and Key Navigator's
// Cross-Field Constraints section share one source.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { KeyConstraintEditor } from "../../KeyConstraintEditor.tsx";
import { arrN } from "../../../state/nestedValueHelpers.ts";

export interface KeyConstraintsBodyProps extends KeySectionBaseProps {
  fieldOrder: string[];
  editedRules: Record<string, Record<string, unknown>>;
}

export function KeyConstraintsBody({
  selectedKey,
  currentRule,
  updateField,
  fieldOrder,
  editedRules,
}: KeyConstraintsBodyProps) {
  return (
    <KeyConstraintEditor
      currentKey={selectedKey}
      constraints={arrN(currentRule, "constraints")}
      onChange={(next) => updateField(selectedKey, "constraints", next)}
      fieldOrder={fieldOrder}
      rules={editedRules}
    />
  );
}
