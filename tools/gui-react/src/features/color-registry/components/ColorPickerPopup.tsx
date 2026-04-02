import { useState, useEffect, useRef, useCallback } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorConversions.ts';
import { isValidHex } from '../utils/colorValidation.ts';
import { inputCls } from '../../../utils/studioConstants.ts';
import { btnPrimary, btnSecondary } from '../../../shared/ui/buttonClasses.ts';

interface ColorPickerPopupProps {
  readonly hex: string;
  readonly onApply: (hex: string) => void;
  readonly onClose: () => void;
}

export function ColorPickerPopup({ hex, onApply, onClose }: ColorPickerPopupProps) {
  const [draft, setDraft] = useState(hex);
  const [r, setR] = useState(0);
  const [g, setG] = useState(0);
  const [b, setB] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rgb = hexToRgb(hex);
    if (rgb) { setR(rgb.r); setG(rgb.g); setB(rgb.b); }
    setDraft(hex);
  }, [hex]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const syncFromHex = useCallback((newHex: string) => {
    setDraft(newHex);
    const rgb = hexToRgb(newHex);
    if (rgb) { setR(rgb.r); setG(rgb.g); setB(rgb.b); }
  }, []);

  const syncFromRgb = useCallback((nr: number, ng: number, nb: number) => {
    setR(nr); setG(ng); setB(nb);
    setDraft(rgbToHex(nr, ng, nb));
  }, []);

  const handleHexInput = useCallback((val: string) => {
    const normalized = val.startsWith('#') ? val : `#${val}`;
    setDraft(normalized);
    if (isValidHex(normalized)) {
      const rgb = hexToRgb(normalized);
      if (rgb) { setR(rgb.r); setG(rgb.g); setB(rgb.b); }
    }
  }, []);

  const clampChannel = (v: string) => Math.max(0, Math.min(255, parseInt(v, 10) || 0));

  return (
    <div
      ref={popupRef}
      className="absolute z-50 sf-surface-elevated rounded-sm border sf-border-soft p-4 shadow-lg min-w-[280px]"
    >
      <div className="flex items-center gap-3 mb-3">
        <input
          type="color"
          value={isValidHex(draft) ? draft : hex}
          onChange={(e) => syncFromHex(e.target.value)}
          className="w-12 h-10 rounded cursor-pointer border sf-border-default"
        />
        <div
          className="w-10 h-10 rounded border sf-border-default flex-shrink-0"
          style={{ backgroundColor: isValidHex(draft) ? draft : hex }}
        />
      </div>

      <label className="block mb-2">
        <span className="sf-text-caption font-medium text-xs">Hex</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => handleHexInput(e.target.value)}
          className={`${inputCls} font-mono text-sm mt-0.5`}
          placeholder="#000000"
          maxLength={7}
        />
      </label>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <label className="block">
          <span className="sf-text-caption font-medium text-xs">R</span>
          <input
            type="number"
            value={r}
            min={0}
            max={255}
            onChange={(e) => syncFromRgb(clampChannel(e.target.value), g, b)}
            className={`${inputCls} text-sm mt-0.5`}
          />
        </label>
        <label className="block">
          <span className="sf-text-caption font-medium text-xs">G</span>
          <input
            type="number"
            value={g}
            min={0}
            max={255}
            onChange={(e) => syncFromRgb(r, clampChannel(e.target.value), b)}
            className={`${inputCls} text-sm mt-0.5`}
          />
        </label>
        <label className="block">
          <span className="sf-text-caption font-medium text-xs">B</span>
          <input
            type="number"
            value={b}
            min={0}
            max={255}
            onChange={(e) => syncFromRgb(r, g, clampChannel(e.target.value))}
            className={`${inputCls} text-sm mt-0.5`}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button
          className={btnPrimary}
          disabled={!isValidHex(draft) || draft === hex}
          onClick={() => onApply(draft)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
