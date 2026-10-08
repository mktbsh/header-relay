import { createSignal, For, Index, type JSX, Show } from "solid-js";

import { Toggle } from "../../components/Toggle";
import { classifyHeaderName } from "../../lib/domain/header-policy";
import type {
  CapturedHeaderValue,
  CaptureHeader,
  FixedHeader,
  FixedHeaderPopupConfig,
  Profile,
} from "../../lib/domain/types";
import { t } from "../../lib/i18n";

export { Toggle };

// Rows repeat the same controls, so each control's name carries the row's item name.
export const itemLabel = (label: string, itemName: string): string =>
  itemName.trim() ? `${label}: ${itemName.trim()}` : label;

export const formatTime = (value: number | undefined): string =>
  value ? new Date(value).toLocaleString() : "-";

export function Panel(props: {
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
  onSave?: () => void;
  saveDirty?: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <section class={`space-y-4 ${props.class ?? ""}`}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="hr-title">{props.title}</h3>
          <Show when={props.description}>
            <p class="hr-footnote mt-1">{props.description}</p>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Show when={props.action}>
            <button class="hr-btn shrink-0 whitespace-nowrap" onClick={props.onAction}>
              {props.action}
            </button>
          </Show>
          <Show when={props.onSave}>
            <button
              class={props.saveDirty ? "hr-btn hr-btn-filled" : "hr-btn"}
              disabled={!props.saveDirty || props.saving || props.saveDisabled}
              onClick={props.onSave}
            >
              {props.saving ? t("manageSaving") : t("manageSave")}
            </button>
          </Show>
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function Row(props: { children: JSX.Element; columns?: "three" | "four" }) {
  return <div class="hr-card hr-row flex-wrap gap-3 md:flex-nowrap">{props.children}</div>;
}

export function Remove(props: { onClick: () => void }) {
  return (
    <button class="hr-btn hr-btn-destructive" onClick={props.onClick}>
      {t("remove")}
    </button>
  );
}

export function HeaderRow(props: {
  header: () => FixedHeader | CaptureHeader;
  kind: "fixed" | "capture";
  replaceProfile: (updater: (profile: Profile) => void) => void;
}) {
  const policy = () => classifyHeaderName(props.header().name);

  const updateHeader = (updater: (header: FixedHeader | CaptureHeader) => void) => {
    props.replaceProfile((item) => {
      const list = props.kind === "fixed" ? item.fixedHeaders : item.captureHeaders;
      const target = list.find((x) => x.id === props.header().id);
      if (target) updater(target);
    });
  };

  const updateFixed = (updater: (header: FixedHeader) => void) =>
    updateHeader((header) => updater(header as FixedHeader));

  return (
    <div class="hr-card">
      <div class="hr-row flex-wrap gap-3 md:flex-nowrap">
        <input
          class={`hr-input flex-1 ${policy().level === "blocked" ? "hr-input-error" : ""}`}
          placeholder="x-session-token"
          aria-label={t("headerNameLabel")}
          value={props.header().name}
          onInput={(e) =>
            updateHeader((header) => {
              header.name = e.currentTarget.value;
            })
          }
        />
        <Show when={props.kind === "fixed"}>
          <input
            class="hr-input flex-1"
            placeholder={t("headerValueLabel")}
            aria-label={itemLabel(t("headerValueLabel"), props.header().name)}
            value={(props.header() as FixedHeader).value}
            onInput={(e) =>
              updateHeader((header) => {
                (header as FixedHeader).value = e.currentTarget.value;
              })
            }
          />
        </Show>
        <Toggle
          checked={props.header().enabled}
          label={itemLabel(t("enabled"), props.header().name)}
          onChange={(checked) =>
            updateHeader((header) => {
              header.enabled = checked;
            })
          }
        />
        <Remove
          onClick={() =>
            props.replaceProfile((item) => {
              if (props.kind === "fixed")
                item.fixedHeaders = item.fixedHeaders.filter((x) => x.id !== props.header().id);
              else
                item.captureHeaders = item.captureHeaders.filter((x) => x.id !== props.header().id);
            })
          }
        />
      </div>
      <Show when={policy().level === "sensitive"}>
        <p
          class="mt-2 flex items-start gap-1.5 px-1 text-xs"
          style={{ color: "var(--ios-orange)" }}
          role="status"
        >
          <span aria-hidden="true">⚠︎</span>
          <span>
            {policy().reason === "browser-cookie-state"
              ? t("cookieHeaderWarning")
              : t("sensitiveHeaderWarning")}
          </span>
        </p>
      </Show>
      <BlockedHeaderAlert level={policy().level} />
      <Show when={props.kind === "fixed"}>
        <PopupExposure header={() => props.header() as FixedHeader} update={updateFixed} />
      </Show>
    </div>
  );
}

function BlockedHeaderAlert(props: { level: string }) {
  return (
    <Show when={props.level === "blocked"}>
      <p
        class="mt-2 flex items-start gap-1.5 px-1 text-xs"
        style={{ color: "var(--ios-red)" }}
        role="alert"
      >
        <span aria-hidden="true">⊘</span>
        <span>{t("blockedHeaderWarning")}</span>
      </p>
    </Show>
  );
}

// Publishing a header to the popup is opt-in per header: without this block the header
// keeps `popup: undefined` and the popup never shows, let alone edits, its value.
function PopupExposure(props: {
  header: () => FixedHeader;
  update: (updater: (header: FixedHeader) => void) => void;
}) {
  const popup = (): FixedHeaderPopupConfig | undefined => props.header().popup;
  const options = () => popup()?.options ?? [];

  const setVisible = (visible: boolean) =>
    props.update((header) => {
      header.popup = { input: "text", ...header.popup, visible };
    });

  const setInput = (input: "text" | "select") =>
    props.update((header) => {
      if (!header.popup) return;
      header.popup = { ...header.popup, input };
      // A select with no option cannot be saved, so give the user a row to fill in
      // rather than an invalid config and a validation error.
      if (input === "select" && (header.popup.options ?? []).length === 0) {
        header.popup.options = [{ label: "", value: header.value }];
      }
    });

  const updateOptions = (updater: (options: { label: string; value: string }[]) => void) =>
    props.update((header) => {
      if (!header.popup) return;
      const next = [...(header.popup.options ?? [])];
      updater(next);
      header.popup = { ...header.popup, options: next };
    });

  const patchOption = (index: number, patch: Partial<{ label: string; value: string }>) =>
    updateOptions((list) => {
      const current = list[index];
      if (current) list[index] = { ...current, ...patch };
    });

  const move = (index: number, delta: number) =>
    updateOptions((list) => {
      const from = list[index];
      const to = list[index + delta];
      if (!from || !to) return;
      list[index] = to;
      list[index + delta] = from;
    });

  return (
    <div class="border-t px-4 py-3" style={{ "border-color": "var(--ios-separator)" }}>
      <div class="flex flex-wrap items-center gap-3">
        <Toggle
          checked={Boolean(popup()?.visible)}
          onChange={setVisible}
          label={itemLabel(t("popupExposureShow"), props.header().name)}
        />
        <span class="text-sm">{t("popupExposureShow")}</span>
        <Show when={popup()?.visible}>
          <select
            class="hr-select ml-auto w-auto"
            aria-label={t("popupExposureInputType")}
            value={popup()?.input ?? "text"}
            onChange={(e) => setInput(e.currentTarget.value as "text" | "select")}
          >
            <option value="text">{t("popupExposureInputText")}</option>
            <option value="select">{t("popupExposureInputSelect")}</option>
          </select>
        </Show>
      </div>

      <Show when={popup()?.visible && popup()?.input === "select"}>
        <div class="mt-3 space-y-2">
          {/* Index, not For: rows are rebuilt on every keystroke, and a keyed list would
              recreate the input under the cursor. */}
          <Index each={options()}>
            {(option, index) => (
              <div class="flex flex-wrap items-center gap-2 md:flex-nowrap">
                <input
                  class="hr-input flex-1"
                  placeholder={t("popupExposureOptionLabel")}
                  aria-label={t("popupExposureOptionLabel")}
                  value={option().label}
                  onInput={(e) => patchOption(index, { label: e.currentTarget.value })}
                />
                <input
                  class="hr-input flex-1"
                  placeholder={t("popupExposureOptionValue")}
                  aria-label={t("popupExposureOptionValue")}
                  value={option().value}
                  onInput={(e) => patchOption(index, { value: e.currentTarget.value })}
                />
                <button
                  class="hr-btn"
                  aria-label={t("popupExposureMoveUp")}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  class="hr-btn"
                  aria-label={t("popupExposureMoveDown")}
                  disabled={index === options().length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <Remove onClick={() => updateOptions((list) => list.splice(index, 1))} />
              </div>
            )}
          </Index>
          <button
            class="hr-btn"
            onClick={() => updateOptions((list) => list.push({ label: "", value: "" }))}
          >
            {t("popupExposureAddOption")}
          </button>
        </div>
      </Show>
    </div>
  );
}

export function StatusTile(props: { label: string; value: string }) {
  return (
    <div class="hr-card px-4 py-3">
      <div class="text-[11px] font-medium" style={{ color: "var(--ios-secondary-label)" }}>
        {props.label}
      </div>
      <div class="mt-1 text-2xl font-semibold tabular-nums">{props.value}</div>
    </div>
  );
}

const COPIED_FEEDBACK_MS = 1500;

// Values are shown verbatim: users of a header relay inspect these values on purpose
// (ADR 2026-10-06-plaintext-header-values).
function CapturedRow(props: { entry: CapturedHeaderValue }) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    await navigator.clipboard.writeText(props.entry.value);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  return (
    <div class="hr-row flex-wrap gap-2 md:flex-nowrap">
      <span class="hr-mono text-[13px] font-semibold">{props.entry.name}</span>
      <span class="hr-mono hr-secondary min-w-0 flex-1 truncate text-xs" title={props.entry.value}>
        {props.entry.value}
      </span>
      <button class="hr-btn shrink-0" aria-live="polite" onClick={() => void copy()}>
        {copied() ? t("copiedCapturedValue") : t("copyCapturedValue")}
      </button>
      <span class="hr-footnote shrink-0">{formatTime(props.entry.capturedAt)}</span>
    </div>
  );
}

export function CapturedList(props: { entries: CapturedHeaderValue[] }) {
  return (
    <Show when={props.entries.length > 0} fallback={<EmptyState text={t("noCapturedValues")} />}>
      <div class="hr-card hr-list">
        <For each={props.entries}>{(entry) => <CapturedRow entry={entry} />}</For>
      </div>
    </Show>
  );
}

export function DetailValue(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="flex flex-col gap-1 md:flex-row md:gap-3">
      <div class="shrink-0 text-[11px] font-medium" style={{ color: "var(--ios-secondary-label)" }}>
        {props.label}
      </div>
      <div class={`${props.mono ? "hr-mono text-xs" : "text-sm"} min-w-0 break-words`}>
        {props.value}
      </div>
    </div>
  );
}

export function Info(props: { label: string; value: string; description?: string }) {
  return (
    <div class="hr-card px-4 py-3">
      <div class="text-[11px] font-medium" style={{ color: "var(--ios-secondary-label)" }}>
        {props.label}
      </div>
      <div class="mt-1 text-sm font-medium break-words">{props.value}</div>
      <Show when={props.description}>
        <p class="hr-footnote mt-1.5">{props.description}</p>
      </Show>
    </div>
  );
}

export function EmptyState(props: { text: string }) {
  return (
    <div class="hr-card px-5 py-6 text-center">
      <span class="hr-footnote">{props.text}</span>
    </div>
  );
}
