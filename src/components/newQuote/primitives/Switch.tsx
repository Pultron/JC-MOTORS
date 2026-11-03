interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}

export function Switch({ checked, onChange, label, testId }: Props) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testId} className="mac-switch mac-press" onClick={() => onChange(!checked)}>
    <span className="mac-switch-track"><span className="mac-switch-knob" /></span>
  </button>;
}
