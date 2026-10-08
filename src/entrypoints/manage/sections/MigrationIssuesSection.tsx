import { Index, Show } from "solid-js";

import type { MigrationIssue, MigrationIssueReason, Profile } from "../../../lib/domain/types";
import { type I18nKey, t } from "../../../lib/i18n";

const reasonKey: Record<MigrationIssueReason, I18nKey> = {
  "popup-select-options-mismatch": "migrationIssueReasonPopupMismatch",
  "cookie-parse-failed": "migrationIssueReasonParseFail",
  "duplicate-cookie-name": "migrationIssueReasonDuplicate",
  "capture-cookie-not-convertible": "migrationIssueReasonCapture",
};

const sourceLabel = (issue: MigrationIssue) =>
  issue.source === "fixed-header-cookie"
    ? t("migrationIssueSourceFixed")
    : t("migrationIssueSourceCapture");

// Migration issues are inert data (compiler ignores them). This section just
// displays them and offers a deletion path once the user has moved the setting
// over to a proper FixedCookie / TrackedCookie. Editing the original value here
// would be scope creep — the point is to preserve the raw input for reference.
export function MigrationIssuesSection(props: {
  active: () => Profile;
  onDismissIssue: (issueId: string) => void;
}) {
  const issues = () => props.active().migrationIssues;

  return (
    <Show when={issues().length > 0}>
      <section class="space-y-2" data-testid="migration-issues">
        <div>
          <h4 class="hr-title text-base">{t("sectionMigration")}</h4>
          <p class="hr-footnote mt-1">{t("migrationIssuesDescription")}</p>
        </div>
        <div class="space-y-2">
          <Index each={issues()}>
            {(issue) => (
              <div class="hr-card">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="hr-badge">{sourceLabel(issue())}</span>
                      <span class="hr-footnote">{t(reasonKey[issue().reason])}</span>
                    </div>
                    <Show when={issue().originalValue}>
                      <div>
                        <div class="hr-footnote">{t("migrationIssueOriginalHeaderLabel")}</div>
                        <code
                          class="mt-1 block truncate text-xs"
                          style={{ color: "var(--ios-secondary-label)" }}
                        >
                          {issue().originalValue}
                        </code>
                      </div>
                    </Show>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <button class="hr-btn" onClick={() => props.onDismissIssue(issue().id)}>
                      {t("migrationIssueDismiss")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Index>
        </div>
      </section>
    </Show>
  );
}
