import { Index, type JSX } from "solid-js";

import type { CapturedHeaderValue, Profile } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { HeaderRow } from "../ui";
import { SessionPanel } from "./SessionPanel";

type HeaderKind = "fixed" | "capture";

function HeaderGroup(props: {
  title: string;
  description: string;
  kind: HeaderKind;
  headers: () => readonly { id: string }[];
  replaceProfile: (updater: (profile: Profile) => void) => void;
  saveDirty: () => boolean;
  saving: () => boolean;
  saveBlocked: () => boolean;
  onSave: () => void;
  children?: JSX.Element;
}) {
  return (
    <section class="space-y-3" data-testid={`header-section-${props.kind}`}>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="text-sm font-semibold">{props.title}</h4>
          <p class="hr-footnote mt-1">{props.description}</p>
        </div>
        <button
          class={`${props.saveDirty() ? "hr-btn hr-btn-filled" : "hr-btn"} shrink-0 whitespace-nowrap`}
          disabled={!props.saveDirty() || props.saving() || props.saveBlocked()}
          onClick={props.onSave}
        >
          {props.saving() ? t("manageSaving") : t("manageSave")}
        </button>
      </div>

      <div class="space-y-2">
        <Index each={props.headers()}>
          {(header) => (
            <HeaderRow
              header={header as () => Profile["fixedHeaders"][number]}
              replaceProfile={props.replaceProfile}
              kind={props.kind}
            />
          )}
        </Index>
      </div>
      {props.children}
    </section>
  );
}

export function HeadersSection(props: {
  active: () => Profile;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  onAddFixed: () => void;
  onAddCapture: () => void;
  fixedSaveDirty: () => boolean;
  fixedSaving: () => boolean;
  fixedSaveBlocked: () => boolean;
  onSaveFixed: () => void;
  captureSaveDirty: () => boolean;
  captureSaving: () => boolean;
  captureSaveBlocked: () => boolean;
  onSaveCapture: () => void;
  capturedRows: () => CapturedHeaderValue[];
  onClearSession: () => void;
}) {
  return (
    <section class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h3 class="hr-title">{t("sectionHeaders")}</h3>
        <div class="flex flex-wrap items-center gap-2">
          <button class="hr-btn whitespace-nowrap" onClick={props.onAddFixed}>
            {t("addFixedHeader")}
          </button>
          <button class="hr-btn whitespace-nowrap" onClick={props.onAddCapture}>
            {t("addCapturedHeader")}
          </button>
        </div>
      </div>

      <HeaderGroup
        title={t("sectionFixed")}
        description={t("fixedDescription")}
        kind="fixed"
        headers={() => props.active().fixedHeaders}
        replaceProfile={props.replaceProfile}
        saveDirty={props.fixedSaveDirty}
        saving={props.fixedSaving}
        saveBlocked={props.fixedSaveBlocked}
        onSave={props.onSaveFixed}
      />

      <div class="border-t pt-6" style={{ "border-color": "var(--ios-separator)" }}>
        <HeaderGroup
          title={t("sectionCapture")}
          description={t("captureDescription")}
          kind="capture"
          headers={() => props.active().captureHeaders}
          replaceProfile={props.replaceProfile}
          saveDirty={props.captureSaveDirty}
          saving={props.captureSaving}
          saveBlocked={props.captureSaveBlocked}
          onSave={props.onSaveCapture}
        >
          <SessionPanel entries={props.capturedRows()} onClear={props.onClearSession} />
        </HeaderGroup>
      </div>
    </section>
  );
}
