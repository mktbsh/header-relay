import type { CapturedHeaderValue } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { CapturedList } from "../ui";

export function SessionPanel(props: { entries: CapturedHeaderValue[]; onClear: () => void }) {
  return (
    <div class="mt-5">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h4 class="text-sm font-semibold">{t("sessionValuesTitle")}</h4>
        <button class="hr-btn hr-btn-destructive" onClick={props.onClear}>
          {t("clearCapturedValues")}
        </button>
      </div>
      <p class="hr-footnote mb-2">{t("clearCapturedValuesDescription")}</p>
      <CapturedList entries={props.entries} />
    </div>
  );
}
