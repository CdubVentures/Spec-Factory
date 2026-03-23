import { useState, useMemo, useCallback } from "react";
import { inputCls, selectCls } from "./studioConstants";
import {
  areTypesCompatible,
  CONSTRAINT_OPS,
  deriveTypeGroup,
  groupRangeConstraints,
  TYPE_GROUP_OPS,
} from "../state/studioConstraintGroups";

interface KeyConstraintEditorProps {
  currentKey: string;
  constraints: string[];
  onChange: (next: string[]) => void;
  fieldOrder: string[];
  rules: Record<string, Record<string, unknown>>;
}

export function KeyConstraintEditor({
  currentKey,
  constraints,
  onChange,
  fieldOrder,
  rules,
}: KeyConstraintEditorProps) {
  const [adding, setAdding] = useState(false);
  const [op, setOp] = useState<string>("<=");
  const [rightMode, setRightMode] = useState<"field" | "value" | "range">(
    "field",
  );
  const [rightField, setRightField] = useState("");
  const [rightLiteral, setRightLiteral] = useState("");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [rangeLowerOp, setRangeLowerOp] = useState<string>("<=");
  const [rangeUpperOp, setRangeUpperOp] = useState<string>("<=");

  const currentRule = rules[currentKey] || {};
  const currentTypeGroup = deriveTypeGroup(currentRule);
  const allowedOps = TYPE_GROUP_OPS[currentTypeGroup];
  const supportsRange =
    currentTypeGroup === "numeric" || currentTypeGroup === "date";

  function resetState() {
    setOp("<=");
    setRightField("");
    setRightLiteral("");
    setRightMode("field");
    setRangeMin("");
    setRangeMax("");
    setRangeLowerOp("<=");
    setRangeUpperOp("<=");
    setAdding(false);
  }

  function addConstraint() {
    if (rightMode === "range") {
      const exprs: string[] = [];
      const min = rangeMin.trim();
      const max = rangeMax.trim();
      if (min) {
        const lowerOp = rangeLowerOp === "<=" ? ">=" : ">";
        exprs.push(`${currentKey} ${lowerOp} ${min}`);
      }
      if (max) {
        exprs.push(`${currentKey} ${rangeUpperOp} ${max}`);
      }
      if (exprs.length === 0) return;
      onChange([...constraints, ...exprs]);
      resetState();
      return;
    }
    const rightValue = rightMode === "field" ? rightField : rightLiteral.trim();
    if (!rightValue) return;
    const expr = `${currentKey} ${op} ${rightValue}`;
    onChange([...constraints, expr]);
    resetState();
  }

  function removeConstraint(idx: number) {
    onChange(constraints.filter((_, i) => i !== idx));
  }

  function removeRangePair(lowerIdx: number, upperIdx: number) {
    onChange(constraints.filter((_, i) => i !== lowerIdx && i !== upperIdx));
  }

  const { compatible, incompatible } = useMemo(() => {
    const comp: Array<{ value: string; label: string }> = [];
    const incompat: Array<{ value: string; label: string }> = [];
    for (const key of fieldOrder) {
      if (key.startsWith("__grp::") || key === currentKey) continue;
      const rule = rules[key] || {};
      const targetGroup = deriveTypeGroup(rule);
      const entry = { value: key, label: key };
      if (
        op === "requires" ||
        areTypesCompatible(currentTypeGroup, targetGroup)
      ) {
        comp.push(entry);
      } else {
        incompat.push(entry);
      }
    }
    return { compatible: comp, incompatible: incompat };
  }, [fieldOrder, currentKey, rules, currentTypeGroup, op]);

  const { ranges, singles } = useMemo(
    () => groupRangeConstraints(constraints, currentKey),
    [constraints, currentKey],
  );

  const literalPlaceholder =
    currentTypeGroup === "numeric"
      ? "100"
      : currentTypeGroup === "date"
        ? "2024-01-15"
        : currentTypeGroup === "boolean"
          ? "yes"
          : "'wireless'";
  const rangePlaceholder = currentTypeGroup === "date" ? "2024-01-01" : "0";

  const isRequires = op === "requires";
  const canAddField = rightMode === "field" && rightField !== "";
  const canAddLiteral = rightMode === "value" && rightLiteral.trim() !== "";
  const canAddRange =
    rightMode === "range" && (rangeMin.trim() !== "" || rangeMax.trim() !== "");
  const canAdd = isRequires
    ? rightField !== ""
    : canAddField || canAddLiteral || canAddRange;

  const fieldBadgesFor = useCallback(
    (key: string): Array<{ text: string; cls: string }> => {
      const r = rules[key] || {};
      const badges: Array<{ text: string; cls: string }> = [];
      const tg = deriveTypeGroup(r);
      badges.push({
        text: tg,
        cls: "sf-bg-surface-soft-strong sf-dk-surface-700 sf-text-muted",
      });
      const contract = (r.contract || {}) as Record<string, unknown>;
      const unit = String(contract.unit || "").trim();
      if (unit)
        badges.push({
          text: unit,
          cls: "sf-chip-sky-strong",
        });
      const shape = String(contract.shape || "").trim();
      if (shape && shape !== "scalar")
        badges.push({
          text: shape,
          cls: "sf-chip-teal-strong",
        });
      return badges;
    },
    [rules],
  );

  const currentBadges = useMemo(
    () => fieldBadgesFor(currentKey),
    [fieldBadgesFor, currentKey],
  );
  const rightBadges = useMemo(
    () => (rightField ? fieldBadgesFor(rightField) : []),
    [fieldBadgesFor, rightField],
  );

  const pillCls =
    "inline-flex items-center gap-1 sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]";
  const removeBtnCls = "sf-status-text-warning sf-status-warning-hover ml-0.5";
  const modeBtnBase = "px-1.5 py-0.5";
  const modeBtnActive =
    "sf-chip-info-active font-medium";
  const modeBtnInactive =
    "sf-text-muted sf-hover-bg-surface-soft-strong sf-dk-hover-surface-700";
  const badgeCls = "text-[9px] px-1 py-0 rounded";

  return (
    <div className="text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        {ranges.map((rp) => (
          <span
            key={`rp-${rp.lowerIdx}-${rp.upperIdx}`}
            className={`${pillCls} sf-review-ai-pending-badge`}
          >
            {rp.display}
            <button
              onClick={() => removeRangePair(rp.lowerIdx, rp.upperIdx)}
              className="sf-run-ai-text sf-run-ai-text-hover ml-0.5"
              title="Remove range"
            >
              &#10005;
            </button>
          </span>
        ))}
        {singles.map((s) => (
          <span key={s.idx} className={pillCls}>
            {s.expr}
            <button
              onClick={() => removeConstraint(s.idx)}
              className={removeBtnCls}
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
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] sf-text-muted sf-bg-surface-soft-strong sf-dk-surface-700 px-1.5 py-0.5 rounded">
              {currentKey}
            </span>
            {currentBadges.map((b, i) => (
              <span key={i} className={`${badgeCls} ${b.cls}`}>
                {b.text}
              </span>
            ))}
            {!isRequires ? (
              <span className="inline-flex rounded border sf-border-soft overflow-hidden text-[9px]">
                <button
                  onClick={() => setRightMode("field")}
                  className={`${modeBtnBase} ${rightMode === "field" ? modeBtnActive : modeBtnInactive}`}
                >
                  Field
                </button>
                <button
                  onClick={() => setRightMode("value")}
                  className={`${modeBtnBase} ${rightMode === "value" ? modeBtnActive : modeBtnInactive}`}
                >
                  Value
                </button>
                {supportsRange ? (
                  <button
                    onClick={() => setRightMode("range")}
                    className={`${modeBtnBase} ${rightMode === "range" ? modeBtnActive : modeBtnInactive}`}
                  >
                    Range
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          {rightMode === "range" ? (
            <div className="flex items-center gap-1 flex-wrap">
              <input
                type="text"
                className={`${inputCls} text-[11px] py-0.5 w-20`}
                placeholder={rangePlaceholder}
                value={rangeMin}
                onChange={(e) => setRangeMin(e.target.value)}
              />
              <select
                className={`${selectCls} text-[11px] py-0.5 w-10`}
                value={rangeLowerOp}
                onChange={(e) => setRangeLowerOp(e.target.value)}
              >
                <option value="<=">{"\u2264"}</option>
                <option value="<">{"<"}</option>
              </select>
              <span className="font-mono text-[10px] sf-text-muted sf-bg-surface-soft-strong sf-dk-surface-700 px-1.5 py-0.5 rounded">
                {currentKey}
              </span>
              <select
                className={`${selectCls} text-[11px] py-0.5 w-10`}
                value={rangeUpperOp}
                onChange={(e) => setRangeUpperOp(e.target.value)}
              >
                <option value="<=">{"\u2264"}</option>
                <option value="<">{"<"}</option>
              </select>
              <input
                type="text"
                className={`${inputCls} text-[11px] py-0.5 w-20`}
                placeholder={
                  currentTypeGroup === "date" ? "2025-12-31" : "30000"
                }
                value={rangeMax}
                onChange={(e) => setRangeMax(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addConstraint();
                }}
              />
              <button
                onClick={addConstraint}
                disabled={!canAddRange}
                className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
              >
                Add
              </button>
              <button
                onClick={resetState}
                className="text-[10px] sf-text-subtle hover:sf-text-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                className={`${selectCls} text-[11px] py-0.5 w-[4.5rem]`}
                value={op}
                onChange={(e) => {
                  setOp(e.target.value);
                  if (e.target.value === "requires") setRightMode("field");
                }}
              >
                {CONSTRAINT_OPS.map((o) => (
                  <option key={o} value={o} disabled={!allowedOps.has(o)}>
                    {o}
                  </option>
                ))}
              </select>
              {isRequires || rightMode === "field" ? (
                <select
                  className={`${selectCls} text-[11px] py-0.5 min-w-0`}
                  value={rightField}
                  onChange={(e) => setRightField(e.target.value)}
                >
                  <option value="">Select field...</option>
                  {compatible.length > 0 ? (
                    <optgroup label="Compatible">
                      {compatible.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {incompatible.length > 0 ? (
                    <optgroup label="Incompatible type">
                      {incompatible.map((f) => (
                        <option key={f.value} value={f.value} disabled>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              ) : (
                <input
                  type="text"
                  className={`${inputCls} text-[11px] py-0.5 w-28`}
                  placeholder={literalPlaceholder}
                  value={rightLiteral}
                  onChange={(e) => setRightLiteral(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addConstraint();
                  }}
                />
              )}
              {rightBadges.length > 0
                ? rightBadges.map((b, i) => (
                    <span key={i} className={`${badgeCls} ${b.cls}`}>
                      {b.text}
                    </span>
                  ))
                : null}
              <button
                onClick={addConstraint}
                disabled={!canAdd}
                className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
              >
                Add
              </button>
              <button
                onClick={resetState}
                className="text-[10px] sf-text-subtle hover:sf-text-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
