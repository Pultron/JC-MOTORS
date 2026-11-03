interface Option { value: string; label: string }
interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  testId?: string;
}

export function Segmented({ options, value, onChange, ariaLabel, testId }: Props) {
  return <div role="group" aria-label={ariaLabel} data-testid={testId} className="mac-segment inline-flex">
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} data-testid={testId ? `${testId}-${option.value}` : undefined} className="mac-press" onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
