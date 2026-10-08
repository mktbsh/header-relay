import { t } from "../lib/i18n";

export function Toggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-describedby={props.describedBy}
      aria-label={props.label ?? t("enabled")}
      class="hr-switch"
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="hr-switch-knob" />
    </button>
  );
}
