import { createSignal } from "solid-js";

import { t } from "../../../lib/i18n";
import { Panel } from "../ui";

export function AdvancedJsonSection(props: {
  jsonText: () => string;
  onUpdateJsonText: (value: string) => void;
  onApplyJson: () => void;
  onExport: (includeSecrets: boolean) => void;
  onImportFile: (file: File) => void | Promise<void>;
}) {
  const [includeSecrets, setIncludeSecrets] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  return (
    <Panel
      class="flex min-h-[65vh] flex-col lg:h-full lg:min-h-0"
      title={t("advancedJsonEditorTab")}
      description={t("advancedDescription")}
    >
      <div class="mb-3 flex flex-wrap items-center justify-end gap-2">
        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            class="h-4 w-4"
            checked={includeSecrets()}
            onChange={(event) => setIncludeSecrets(event.currentTarget.checked)}
          />
          <span>{t("includeSecretValues")}</span>
        </label>
        <button class="hr-btn" onClick={() => props.onExport(includeSecrets())}>
          {t("exportConfig")}
        </button>
        <button class="hr-btn" onClick={() => fileInput?.click()}>
          {t("importConfig")}
        </button>
        <input
          ref={(element) => {
            fileInput = element;
          }}
          class="hidden"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void props.onImportFile(file);
          }}
        />
        <button class="hr-btn-filled" onClick={props.onApplyJson}>
          {t("applyJson")}
        </button>
      </div>
      <textarea
        aria-label={t("configJsonLabel")}
        class="hr-textarea min-h-[50vh] flex-1 resize-none overflow-auto lg:min-h-0"
        value={props.jsonText()}
        onInput={(e) => props.onUpdateJsonText(e.currentTarget.value)}
      />
    </Panel>
  );
}
