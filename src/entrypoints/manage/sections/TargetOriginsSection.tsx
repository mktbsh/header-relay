import { Index, Show } from "solid-js";

import type { Profile } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { httpOriginOf } from "../../../lib/matching/route-condition";
import type { OriginAccess } from "../App";
import { itemLabel, Panel, Remove, Toggle } from "../ui";

function AccessBadge(props: { access: OriginAccess }) {
  return (
    <span
      class={
        props.access === "granted"
          ? "hr-badge-green shrink-0"
          : props.access === "required"
            ? "hr-badge-orange shrink-0"
            : "hr-badge shrink-0"
      }
    >
      {props.access === "granted"
        ? t("originAccessGranted")
        : props.access === "required"
          ? t("originAccessRequired")
          : t("originUnsupported")}
    </span>
  );
}

export function TargetOriginsSection(props: {
  active: () => Profile;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  originAccess: (origin: string) => OriginAccess;
  onGrant: (origin: string) => void;
  onAdd: () => void;
  saveDirty: () => boolean;
  saving: () => boolean;
  saveBlocked: () => boolean;
  onSave: () => void;
}) {
  return (
    <Panel
      title={t("sectionOrigins")}
      description={t("originsDescription")}
      action={t("addOrigin")}
      onAction={props.onAdd}
      onSave={props.onSave}
      saveDirty={props.saveDirty()}
      saving={props.saving()}
      saveDisabled={props.saveBlocked()}
    >
      <p class="hr-footnote">{t("originsPermissionNote")}</p>
      <div class="space-y-2">
        <Index each={props.active().targetOrigins}>
          {(origin) => (
            <div class="hr-card hr-row flex-wrap gap-3 md:flex-nowrap">
              <input
                class="hr-input flex-1"
                placeholder="https://api.example.test"
                aria-label={t("targetOriginLabel")}
                value={origin().origin}
                onPaste={(e) => {
                  const pastedOrigin = httpOriginOf(e.clipboardData?.getData("text"));
                  if (!pastedOrigin) return;

                  e.preventDefault();
                  props.replaceProfile((item) => {
                    const target = item.targetOrigins.find((x) => x.id === origin().id);
                    if (target) target.origin = pastedOrigin;
                  });
                }}
                onInput={(e) =>
                  props.replaceProfile((item) => {
                    const target = item.targetOrigins.find((x) => x.id === origin().id);
                    if (target) target.origin = e.currentTarget.value;
                  })
                }
              />
              <AccessBadge access={props.originAccess(origin().origin)} />
              <Show when={props.originAccess(origin().origin) === "required"}>
                <button class="hr-btn shrink-0" onClick={() => props.onGrant(origin().origin)}>
                  {t("originGrantAccess")}
                </button>
              </Show>
              <Toggle
                checked={origin().enabled}
                label={itemLabel(t("enabled"), origin().origin)}
                onChange={(checked) =>
                  props.replaceProfile((item) => {
                    const target = item.targetOrigins.find((x) => x.id === origin().id);
                    if (target) target.enabled = checked;
                  })
                }
              />
              <Remove
                onClick={() =>
                  props.replaceProfile((item) => {
                    item.targetOrigins = item.targetOrigins.filter((x) => x.id !== origin().id);
                  })
                }
              />
            </div>
          )}
        </Index>
      </div>
    </Panel>
  );
}
