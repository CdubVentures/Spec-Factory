import { useState, useMemo } from "react";
import { CONSTRAINT_OPS } from "../state/studioConstraintGroups.ts";
import { selectCls, STUDIO_TIPS } from "./studioConstants.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { StaticBadges } from "./StaticBadges.tsx";
import type { FieldRule } from "../../../types/studio.ts";

export interface MappingConstraintEditorProps {
  constraints: string[];
  onChange: (next: string[]) => void;
  componentPropertyKeys: string[];
  fieldOrder: string[];
  rules: Record<string, FieldRule>;
}

export function MappingConstraintEditor({
  constraints,
  onChange,
  componentPropertyKeys,
  fieldOrder,
  rules,
}: MappingConstraintEditorProps) {
  const [adding, setAdding] = useState(false);
  const [leftField, setLeftField] = useState("");
  const [op, setOp] = useState<string>("<=");
  const [rightField, setRightField] = useState("");

  function addConstraint() {
    const expr = `${leftField} ${op} ${rightField}`.trim();
    if (!leftField || !rightField) return;
    onChange([...constraints, expr]);
    setLeftField("");
    setOp("<=");
    setRightField("");
    setAdding(false);
  }

  function removeConstraint(idx: number) {
    onChange(constraints.filter((_, i) => i !== idx));
  }

  // Left side: component property keys from this source
  const componentOptions = useMemo(() => {
    return componentPropertyKeys.map((key) => {
      return {
        value: key,
        label: displayLabel(key, rules[key] as Record<string, unknown>),
      };
    });
  }, [componentPropertyKeys, rules]);

  // Right side: product field keys
  const productOptions = useMemo(() => {
    return fieldOrder
      .filter((k) => !k.startsWith("__grp::"))
      .map((key) => {
        return {
          value: key,
          label: displayLabel(key, rules[key] as Record<string, unknown>),
        };
      });
  }, [fieldOrder, rules]);

  return (
    <div className="px-3 py-1.5 border-t sf-border-default text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="sf-text-muted inline-flex items-center gap-0.5">
          Constraints
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.comp_constraints}
          />
          <StaticBadges fieldPath="constraints" />
        </span>
        {constraints.length > 0 ? (
          <span className="text-[9px] sf-chip-warning-soft px-1.5 py-0.5 rounded font-medium">
            Migrate to Key Navigator
          </span>
        ) : null}
        {constraints.map((c, ci) => (
          <span
            key={ci}
            className="inline-flex items-center gap-1 sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]"
          >
            {c}
            <button
              onClick={() => removeConstraint(ci)}
              className="sf-status-text-warning sf-status-warning-hover ml-0.5"
              title="Remove constraint"
            >
              &#10005;
            </button>
          </span>
        ))}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] sf-link-accent hover:opacity-80"
          >
            + Add constraint
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <select
            className={`${selectCls} text-[11px] py-0.5 min-w-0`}
            value={leftField}
            onChange={(e) => setLeftField(e.target.value)}
          >
            <option value="">Component prop...</option>
            {componentOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={`${selectCls} text-[11px] py-0.5 w-14`}
            value={op}
            onChange={(e) => setOp(e.target.value)}
          >
            {CONSTRAINT_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            className={`${selectCls} text-[11px] py-0.5 min-w-0`}
            value={rightField}
            onChange={(e) => setRightField(e.target.value)}
          >
            <option value="">Product field...</option>
            {productOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={addConstraint}
            disabled={!leftField || !rightField}
            className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="text-[10px] sf-text-subtle hover:sf-text-muted"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
