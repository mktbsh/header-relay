import { createSignal, Index, Show } from "solid-js";

import { validateExcludedPathPrefix } from "../../../lib/domain/excluded-path";
import type { Profile } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { Info, itemLabel, Panel, Remove, Toggle } from "../ui";
import { excludedPathValidationMessage, testExcludedPathUrl } from "../view-model";

// A glob that matches every pathname under the target origins (root globstar).
const matchesAllPaths = (glob: string): boolean => glob === "/**" || glob === "**";

export function ExcludedPathsSection(props: {
  active: () => Profile;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onAdd: () => void;
  saveDirty: () => boolean;
  saving: () => boolean;
  saveBlocked: () => boolean;
  onSave: () => void;
}) {
  const [testUrl, setTestUrl] = createSignal("");
  const [testRequested, setTestRequested] = createSignal(false);
  const testResult = () =>
    testRequested() ? testExcludedPathUrl(props.active(), testUrl()) : null;
  const testError = () => {
    const result = testResult();
    return result && !result.ok ? result.error : "";
  };
  const successfulTest = () => {
    const result = testResult();
    return result?.ok ? result : undefined;
  };

  return (
    <div class="space-y-5">
      <Panel
        title={t("sectionExclude")}
        description={t("excludeDescription")}
        action={t("addPath")}
        onAction={props.onAdd}
        onSave={props.onSave}
        saveDirty={props.saveDirty()}
        saving={props.saving()}
        saveDisabled={props.saveBlocked()}
      >
        <div class="hr-card p-4 text-sm">
          <p class="font-medium">{t("excludedPathHelpTitle")}</p>
          <p class="hr-footnote mt-1 leading-relaxed">{t("excludedPathHelp")}</p>
        </div>

        <div class="space-y-2">
          <Index each={props.active().excludedPaths}>
            {(path) => {
              const validation = () => validateExcludedPathPrefix(path().pathPrefix);
              const validationError = () => {
                const result = validation();
                return result.ok ? "" : excludedPathValidationMessage(result.error);
              };
              const messageId = () => `excluded-path-${path().id}-message`;

              return (
                <div class="hr-card p-4">
                  <div class="flex flex-wrap items-center gap-3 md:flex-nowrap">
                    <input
                      class={`hr-input flex-1 ${!validation().ok ? "hr-input-error" : ""}`}
                      aria-label={t("excludedPathLabel")}
                      aria-describedby={messageId()}
                      placeholder="/assets/**"
                      value={path().pathPrefix}
                      onInput={(e) =>
                        props.replaceProfile((item) => {
                          const target = item.excludedPaths.find((x) => x.id === path().id);
                          if (target) target.pathPrefix = e.currentTarget.value;
                        })
                      }
                    />
                    <Toggle
                      checked={path().enabled}
                      disabled={!validation().ok && !path().enabled}
                      describedBy={messageId()}
                      label={itemLabel(t("enabled"), path().pathPrefix)}
                      onChange={(checked) =>
                        props.replaceProfile((item) => {
                          const target = item.excludedPaths.find((x) => x.id === path().id);
                          if (target) target.enabled = checked;
                        })
                      }
                    />
                    <Remove
                      onClick={() =>
                        props.replaceProfile((item) => {
                          item.excludedPaths = item.excludedPaths.filter((x) => x.id !== path().id);
                        })
                      }
                    />
                  </div>
                  <div id={messageId()} class="mt-2 text-xs">
                    <Show
                      when={validationError()}
                      fallback={
                        <Show when={validation().ok && matchesAllPaths(validation().value)}>
                          <span style={{ color: "var(--ios-orange)" }}>
                            {t("excludedPathRootWarning")}
                          </span>
                        </Show>
                      }
                    >
                      {(message) => <span style={{ color: "var(--ios-red)" }}>{message()}</span>}
                    </Show>
                  </div>
                </div>
              );
            }}
          </Index>
        </div>
      </Panel>

      <Panel title={t("excludedPathTesterTitle")} description={t("excludedPathTesterDescription")}>
        <div>
          <form
            class="flex gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (testUrl().trim()) setTestRequested(true);
            }}
          >
            <input
              class={`hr-input flex-1 ${testError() ? "hr-input-error" : ""}`}
              aria-label={t("testUrlLabel")}
              placeholder="http://localhost:3000/assets/app.js"
              value={testUrl()}
              onInput={(event) => {
                setTestUrl(event.currentTarget.value);
                setTestRequested(false);
              }}
            />
            <button type="submit" class="hr-btn-filled" disabled={!testUrl().trim()}>
              {t("runProbe")}
            </button>
          </form>
          <Show when={testError()}>
            <p class="mt-2 text-xs" style={{ color: "var(--ios-red)" }}>
              {testError()}
            </p>
          </Show>
        </div>
        <Show when={successfulTest()}>
          {(result) => (
            <div class="grid gap-3 sm:grid-cols-3">
              <Info label={t("excludedPathTesterOrigin")} value={result().targetOrigin} />
              <Info
                label={t("excludedPathTesterExcluded")}
                value={result().excluded ? t("yes") : t("no")}
              />
              <Info label={t("excludedPathTesterMatched")} value={result().matchedPath} />
            </div>
          )}
        </Show>
      </Panel>
    </div>
  );
}
