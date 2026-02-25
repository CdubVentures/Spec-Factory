import { useId } from 'react';
import { inputCls } from '../../pages/studio/studioConstants';

interface ComboSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Text input with a datalist of known suggestions.
 * User can type freely or pick from the dropdown - no confusing "Custom..." option.
 */
export function ComboSelect({
  value,
  onChange,
  options,
  placeholder,
  className = 'w-full',
  disabled = false,
}: ComboSelectProps) {
  const listId = useId();

  return (
    <>
      <input
        className={`${inputCls} ${className}`}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
}
