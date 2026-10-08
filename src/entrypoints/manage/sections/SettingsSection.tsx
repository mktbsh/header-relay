import type { Accessor } from "solid-js";

import { buildHeaderRelayURL } from "@/const";

import { Toggle } from "../../../components/Toggle";
import { t } from "../../../lib/i18n";

const privacyUrl = () => {
  return buildHeaderRelayURL().privacy();
};

export function SettingsSection(props: {
  compact: Accessor<boolean>;
  saving: Accessor<boolean>;
  onCompactChange: (checked: boolean) => void;
}) {
  return (
    <div class="mx-auto max-w-3xl space-y-6">
      <section>
        <h3 class="hr-section-label">{t("settingsAppearance")}</h3>
        <div class="hr-card hr-row gap-4">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{t("compactMode")}</div>
            <p class="hr-footnote mt-1">{t("settingsCompactDescription")}</p>
          </div>
          <Toggle
            checked={props.compact()}
            disabled={props.saving()}
            label={t("compactMode")}
            onChange={props.onCompactChange}
          />
        </div>
      </section>

      <section>
        <h3 class="hr-section-label">{t("settingsPrivacy")}</h3>
        <div class="hr-card hr-row gap-4">
          <p class="hr-footnote min-w-0 flex-1">{t("settingsPrivacyDescription")}</p>
          <a class="hr-link shrink-0" href={privacyUrl()} target="_blank" rel="noreferrer">
            {t("privacyPolicy")}
          </a>
        </div>
      </section>
    </div>
  );
}
