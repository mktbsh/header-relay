import { For, Show } from "solid-js";

import { describeCompileIssue } from "../../../lib/compiler/compile-issue-text";
import type { CapturedHeaderValue, Profile, SessionState } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import type { RuntimeStatus } from "../../../lib/messaging/messages";
import { CapturedList, EmptyState, Panel, StatusTile } from "../ui";

export function ProfileBasicsSection(props: {
  active: () => Profile;
  session: () => SessionState | null;
  runtime: () => RuntimeStatus | undefined;
  profileName: (profileId: string) => string;
  capturedRows: () => CapturedHeaderValue[];
  attachHeaderNames: () => string[];
  profileNameDraft: () => string;
  profileNameError: () => string;
  canDeleteProfile: () => boolean;
  onUpdateProfileName: (value: string) => void;
  onDuplicateProfile: () => void;
  onDeleteProfile: () => void;
  saveDirty: () => boolean;
  saving: () => boolean;
  saveBlocked: () => boolean;
  onSave: () => void;
}) {
  const configuredFixedHeaders = () => props.active().fixedHeaders.length;
  const activeFixedHeaders = () =>
    props.active().enabled
      ? props.active().fixedHeaders.filter((item) => item.enabled && item.name.trim()).length
      : 0;

  return (
    <div class="space-y-5">
      <Panel
        title={t("profileSettingsTitle")}
        description={t("profileSettingsDescription")}
        onSave={props.onSave}
        saveDirty={props.saveDirty()}
        saving={props.saving()}
        saveDisabled={props.saveBlocked()}
      >
        <div class="hr-card hr-list" data-testid="profile-settings">
          <div class="space-y-2 p-4">
            <label class="block">
              <span class="hr-section-label block" style={{ margin: "0 0 6px" }}>
                {t("profileNameLabel")}
              </span>
              <input
                class={`hr-input ${props.profileNameError() ? "hr-input-error" : ""}`}
                value={props.profileNameDraft()}
                aria-invalid={props.profileNameError() ? "true" : undefined}
                aria-describedby={props.profileNameError() ? "profile-name-error" : undefined}
                onInput={(event) => props.onUpdateProfileName(event.currentTarget.value)}
              />
            </label>
            <Show when={props.profileNameError()}>
              <p
                id="profile-name-error"
                class="text-xs"
                style={{ color: "var(--ios-red)" }}
                role="alert"
              >
                {props.profileNameError()}
              </p>
            </Show>
          </div>

          <button type="button" class="hr-row-action" onClick={props.onDuplicateProfile}>
            {t("duplicateProfile")}
          </button>
          <Show when={props.canDeleteProfile()}>
            <button
              type="button"
              class="hr-row-action hr-row-action-destructive"
              onClick={props.onDeleteProfile}
            >
              {t("deleteProfile")}
            </button>
          </Show>
        </div>
      </Panel>

      <Show when={props.runtime()?.errors.length}>
        <div class="hr-alert">
          <span class="text-[11px] font-semibold">{t("compileErrorTitle")}</span>
          <For each={props.runtime()?.errors ?? []}>
            {(error) => (
              <p class="mt-1 break-words">{describeCompileIssue(error, props.profileName)}</p>
            )}
          </For>
        </div>
      </Show>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusTile
          label={t("tileTargetOrigins")}
          value={String(props.active().targetOrigins.filter((item) => item.enabled).length)}
        />
        <StatusTile
          label={t("tileFixedHeadersSummary")}
          value={`${configuredFixedHeaders()} / ${activeFixedHeaders()}`}
        />
        <StatusTile label={t("tileCapturedValues")} value={String(props.capturedRows().length)} />
        <StatusTile
          label={t("tileProfileDnrRules")}
          value={String(props.session()?.dnrRuleIds.length ?? 0)}
        />
      </div>

      {/* Runtime status covers the whole browser state, not just the selected profile. */}
      <Panel title={t("runtimeStatusTitle")} description={t("runtimeStatusDescription")}>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label={t("tileEnabledProfiles")}
            value={String(props.runtime()?.enabledProfileIds.length ?? 0)}
          />
          <StatusTile
            label={t("tileDnrSessionRules")}
            value={String(props.runtime()?.dnrRuleCount ?? 0)}
          />
          <StatusTile
            label={t("tileCompileErrors")}
            value={String(props.runtime()?.errors.length ?? 0)}
          />
          <StatusTile
            label={t("tileCompileWarnings")}
            value={String(props.runtime()?.warnings.length ?? 0)}
          />
        </div>
        <Show when={props.runtime()?.warnings.length}>
          <div class="hr-card px-4 py-3" data-testid="compile-warnings">
            <h4 class="text-[13px] font-semibold" style={{ color: "var(--ios-orange)" }}>
              {t("compileWarningsTitle")}
            </h4>
            <ul class="mt-1 space-y-1">
              <For each={props.runtime()?.warnings ?? []}>
                {(warning) => (
                  <li class="hr-footnote flex items-start gap-1.5 break-words">
                    <span aria-hidden="true" style={{ color: "var(--ios-orange)" }}>
                      ⚠︎
                    </span>
                    <span>{describeCompileIssue(warning, props.profileName)}</span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </Panel>

      <Show when={props.session()?.lastError}>
        <div class="hr-alert break-all">
          <span class="text-[11px] font-semibold">{t("dnrSyncError")}</span>
          <p class="mt-1">{props.session()?.lastError}</p>
        </div>
      </Show>

      <Panel title={t("activeHeadersTitle")} description={t("activeHeadersDescription")}>
        <Show
          when={props.attachHeaderNames().length > 0}
          fallback={<EmptyState text={t("noActiveHeaders")} />}
        >
          <div class="flex flex-wrap gap-2">
            <For each={props.attachHeaderNames()}>
              {(name) => <span class="hr-badge-blue">{name}</span>}
            </For>
          </div>
        </Show>
      </Panel>

      <Panel title={t("capturedPanelTitle")} description={t("capturedPanelDescription")}>
        <CapturedList entries={props.capturedRows()} />
      </Panel>
    </div>
  );
}
