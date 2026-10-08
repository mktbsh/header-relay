import { createMemo, createSignal, onMount, Show } from "solid-js";

import type { NamedProfile } from "../../../lib/domain/profile-name";
import { t } from "../../../lib/i18n";
import { validateProfileNameInput } from "../view-model";

export function CreateProfileDialog(props: {
  profiles: () => NamedProfile[];
  onCreate: (name: string, enabled: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = createSignal("");
  const [enabled, setEnabled] = createSignal(false);
  const [touched, setTouched] = createSignal(false);
  const validation = createMemo(() => validateProfileNameInput(name(), props.profiles()));
  const validationError = () => {
    const result = validation();
    return result.ok ? "" : result.error;
  };
  const [dialog, setDialog] = createSignal<HTMLDialogElement>();
  const [nameInput, setNameInput] = createSignal<HTMLInputElement>();

  onMount(() => {
    dialog()?.showModal();
    nameInput()?.focus();
  });

  const submit = () => {
    setTouched(true);
    const result = validation();
    if (!result.ok) return;
    props.onCreate(result.value, enabled());
  };

  return (
    <dialog
      ref={(element) => setDialog(element)}
      class="hr-dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border-0 bg-transparent p-0 text-inherit"
      aria-labelledby="create-profile-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <form
        method="dialog"
        class="hr-card space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 id="create-profile-title" class="hr-title">
          {t("createProfileTitle")}
        </h2>

        <label class="block">
          <span class="hr-section-label">{t("profileNameLabel")}</span>
          <input
            ref={(element) => setNameInput(element)}
            class="hr-input"
            value={name()}
            aria-invalid={validation().ok ? undefined : "true"}
            aria-describedby={
              validationError() && touched() ? "create-profile-name-error" : undefined
            }
            onInput={(event) => {
              setName(event.currentTarget.value);
              setTouched(true);
            }}
          />
          <Show when={validationError() && touched()}>
            <p
              id="create-profile-name-error"
              class="mt-1 text-xs"
              style={{ color: "var(--ios-red)" }}
              role="alert"
            >
              {validationError()}
            </p>
          </Show>
        </label>

        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            class="h-4 w-4"
            checked={enabled()}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          <span>{t("profileEnabledLabel")}</span>
        </label>

        <div class="flex justify-end gap-2">
          <button type="button" class="hr-btn" onClick={props.onClose}>
            {t("cancel")}
          </button>
          <button type="submit" class="hr-btn-filled" disabled={!validation().ok}>
            {t("createProfile")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
