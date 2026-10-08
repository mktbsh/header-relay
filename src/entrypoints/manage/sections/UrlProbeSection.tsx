import { For, Show } from "solid-js";

import type { ProbeResult } from "../../../lib/compiler/compile-config";
import { describeCompileIssue } from "../../../lib/compiler/compile-issue-text";
import { t } from "../../../lib/i18n";
import { EmptyState, Info, Panel } from "../ui";
import { createProbeSummaryView, createProbeProfileView } from "../view-model";

export function UrlProbeSection(props: {
  testUrl: () => string;
  testResult: () => ProbeResult | undefined;
  testError: () => string;
  canRun: () => boolean;
  profileName: (profileId: string) => string;
  onUpdateUrl: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <Panel title={t("sectionProbe")} description={t("probeDescription")}>
      <div>
        <form
          class="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (props.canRun()) props.onRun();
          }}
        >
          <input
            class={`hr-input flex-1 ${props.testError() ? "hr-input-error" : ""}`}
            aria-label={t("testUrlLabel")}
            placeholder="http://localhost:3000/api/me"
            value={props.testUrl()}
            onInput={(e) => props.onUpdateUrl(e.currentTarget.value)}
          />
          <button type="submit" class="hr-btn-filled" disabled={!props.canRun()}>
            {t("runProbe")}
          </button>
        </form>
        <Show when={props.testError()}>
          <p class="mt-2 text-xs" style={{ color: "var(--ios-red)" }}>
            {props.testError()}
          </p>
        </Show>
      </div>

      <Show when={props.testResult()}>
        {(result) => (
          <div class="mt-4 space-y-5">
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <For each={createProbeSummaryView(result())}>
                {(row) => (
                  <Info label={row.label} value={row.value} description={row.description} />
                )}
              </For>
            </div>

            <Show when={result().errors.length > 0}>
              <div class="hr-alert">
                <span class="text-[11px] font-semibold">{t("compileErrorTitle")}</span>
                <For each={result().errors}>
                  {(error) => (
                    <p class="mt-1 break-words">{describeCompileIssue(error, props.profileName)}</p>
                  )}
                </For>
              </div>
            </Show>

            <Show when={result().warnings.length > 0}>
              <div class="hr-card space-y-1 px-4 py-3">
                <For each={result().warnings}>
                  {(warning) => (
                    <p class="hr-footnote break-words">
                      {describeCompileIssue(warning, props.profileName)}
                    </p>
                  )}
                </For>
              </div>
            </Show>

            <div>
              <h4 class="hr-section-label">{t("probeMatchedProfiles")}</h4>
              <Show
                when={result().matches.length > 0}
                fallback={<EmptyState text={t("probeNoMatchedProfiles")} />}
              >
                <div class="hr-card hr-list">
                  <For each={result().matches}>
                    {(match) => {
                      const view = createProbeProfileView(match);
                      return (
                        <div class="hr-row flex-wrap gap-2 md:flex-nowrap">
                          <span class="min-w-0 flex-1 truncate text-sm font-semibold">
                            {match.profileName}
                          </span>
                          <span class="hr-mono hr-secondary min-w-0 flex-1 truncate text-xs">
                            {view.origin}
                          </span>
                          <span class={view.excluded ? "hr-badge-red" : "hr-badge-green"}>
                            {view.statusLabel}
                          </span>
                          <span class="hr-mono hr-secondary min-w-0 flex-1 truncate text-xs">
                            {view.headerNames}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Panel>
  );
}
