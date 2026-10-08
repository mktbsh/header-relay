import { Index, Show } from "solid-js";

import { Toggle } from "../../../components/Toggle";
import type { FixedCookie, Profile, TrackedCookie } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { itemLabel, Panel, Remove } from "../ui";
import { MigrationIssuesSection } from "./MigrationIssuesSection";

// Layout mirrors HeadersSection: two sub-lists (fixed / tracked) in one panel with
// one save button. Cookies never have popup-config parity with fixed headers (Cookie
// popup edit is a separate, simpler flag on FixedCookie itself), so no popup UI here.
export function CookiesSection(props: {
  active: () => Profile;
  session: () => { trackedCookies?: Record<string, { value: string }> } | null;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onAddFixedCookie: () => void;
  onAddTrackedCookie: () => void;
  onClearTrackedCookie: (cookieName: string) => void;
  onClearAllTrackedCookies: () => void;
  onDismissMigrationIssue: (issueId: string) => void;
  saveDirty: () => boolean;
  saving: () => boolean;
  saveBlocked: () => boolean;
  onSave: () => void;
}) {
  return (
    <Panel
      title={t("sectionCookies")}
      description={t("cookiesDescription")}
      onSave={props.onSave}
      saveDirty={props.saveDirty()}
      saving={props.saving()}
      saveDisabled={props.saveBlocked()}
    >
      <MigrationIssuesSection
        active={props.active}
        onDismissIssue={props.onDismissMigrationIssue}
      />
      <FixedCookiesGroup
        active={props.active}
        replaceProfile={props.replaceProfile}
        onAdd={props.onAddFixedCookie}
      />
      <TrackedCookiesGroup
        active={props.active}
        session={props.session}
        replaceProfile={props.replaceProfile}
        onAdd={props.onAddTrackedCookie}
        onClearOne={props.onClearTrackedCookie}
        onClearAll={props.onClearAllTrackedCookies}
      />
    </Panel>
  );
}

function FixedCookiesGroup(props: {
  active: () => Profile;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onAdd: () => void;
}) {
  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="hr-title text-base">{t("fixedCookiesTitle")}</h4>
        <button class="hr-btn" onClick={props.onAdd}>
          {t("addFixedCookie")}
        </button>
      </div>
      <Show
        when={props.active().fixedCookies.length > 0}
        fallback={<p class="hr-footnote">{t("noFixedCookies")}</p>}
      >
        <Index each={props.active().fixedCookies}>
          {(cookie) => <FixedCookieRow cookie={cookie} replaceProfile={props.replaceProfile} />}
        </Index>
      </Show>
    </div>
  );
}

function FixedCookieRow(props: {
  cookie: () => FixedCookie;
  replaceProfile: (updater: (profile: Profile) => void) => void;
}) {
  const update = (updater: (cookie: FixedCookie) => void) =>
    props.replaceProfile((profile) => {
      const target = profile.fixedCookies.find((c) => c.id === props.cookie().id);
      if (target) updater(target);
    });

  return (
    <div class="hr-card py-3">
      <div class="hr-row flex-wrap gap-3 md:flex-nowrap">
        <input
          class="hr-input flex-1"
          placeholder="cookie_name"
          aria-label={t("cookieNameLabel")}
          value={props.cookie().name}
          onInput={(e) =>
            update((c) => {
              c.name = e.currentTarget.value;
            })
          }
        />
        <input
          class="hr-input flex-1"
          placeholder={t("cookieValueLabel")}
          aria-label={t("cookieValueLabel")}
          value={props.cookie().value}
          onInput={(e) =>
            update((c) => {
              c.value = e.currentTarget.value;
            })
          }
        />
        <Toggle
          checked={props.cookie().enabled}
          label={itemLabel(t("enabled"), props.cookie().name)}
          onChange={(checked) =>
            update((c) => {
              c.enabled = checked;
            })
          }
        />
        <Remove
          onClick={() =>
            props.replaceProfile((profile) => {
              profile.fixedCookies = profile.fixedCookies.filter((c) => c.id !== props.cookie().id);
            })
          }
        />
      </div>
      <div class="mt-2 flex items-center gap-2 px-4">
        <Toggle
          checked={Boolean(props.cookie().popup?.visible)}
          onChange={(visible) =>
            update((c) => {
              c.popup = { input: "text", ...c.popup, visible };
            })
          }
          label={itemLabel(t("popupExposureShow"), props.cookie().name)}
        />
        <span class="hr-footnote">{t("popupExposureShow")}</span>
      </div>
    </div>
  );
}

function TrackedCookiesGroup(props: {
  active: () => Profile;
  session: () => { trackedCookies?: Record<string, { value: string }> } | null;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onAdd: () => void;
  onClearOne: (cookieName: string) => void;
  onClearAll: () => void;
}) {
  const trackedValues = () => props.session()?.trackedCookies ?? {};
  const hasAnyValue = () => Object.keys(trackedValues()).length > 0;

  return (
    <div class="mt-6 space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="hr-title text-base">{t("trackedCookiesTitle")}</h4>
        <div class="flex gap-2">
          <Show when={hasAnyValue()}>
            <button class="hr-btn hr-btn-destructive" onClick={props.onClearAll}>
              {t("clearAllTrackedCookies")}
            </button>
          </Show>
          <button class="hr-btn" onClick={props.onAdd}>
            {t("addTrackedCookie")}
          </button>
        </div>
      </div>
      <Show
        when={props.active().trackedCookies.length > 0}
        fallback={<p class="hr-footnote">{t("noTrackedCookies")}</p>}
      >
        <Index each={props.active().trackedCookies}>
          {(cookie) => (
            <TrackedCookieRow
              cookie={cookie}
              trackedValues={trackedValues}
              replaceProfile={props.replaceProfile}
              onClearValue={props.onClearOne}
            />
          )}
        </Index>
      </Show>
    </div>
  );
}

function TrackedCookieRow(props: {
  cookie: () => TrackedCookie;
  trackedValues: () => Record<string, { value: string }>;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onClearValue: (cookieName: string) => void;
}) {
  const update = (updater: (cookie: TrackedCookie) => void) =>
    props.replaceProfile((profile) => {
      const target = profile.trackedCookies.find((c) => c.id === props.cookie().id);
      if (target) updater(target);
    });

  const value = () => props.trackedValues()[props.cookie().name]?.value;
  const hasValue = () => value() !== undefined;

  return (
    <div class="hr-card">
      <div class="hr-row flex-wrap gap-3 md:flex-nowrap">
        <input
          class="hr-input flex-1"
          placeholder="cookie_name"
          aria-label={t("cookieNameLabel")}
          value={props.cookie().name}
          onInput={(e) =>
            update((c) => {
              c.name = e.currentTarget.value;
            })
          }
        />
        <div class="hr-footnote flex-1 truncate" aria-label={t("trackedCookieValueLabel")}>
          <Show when={hasValue()} fallback={<em>{t("noTrackedCookieValue")}</em>}>
            <code>{value()}</code>
          </Show>
        </div>
        <Toggle
          checked={props.cookie().enabled}
          label={itemLabel(t("enabled"), props.cookie().name)}
          onChange={(checked) =>
            update((c) => {
              c.enabled = checked;
            })
          }
        />
        <Show when={hasValue()}>
          <button class="hr-btn" onClick={() => props.onClearValue(props.cookie().name)}>
            {t("clearTrackedCookieAction")}
          </button>
        </Show>
        <Remove
          onClick={() =>
            props.replaceProfile((profile) => {
              profile.trackedCookies = profile.trackedCookies.filter(
                (c) => c.id !== props.cookie().id,
              );
            })
          }
        />
      </div>
    </div>
  );
}
