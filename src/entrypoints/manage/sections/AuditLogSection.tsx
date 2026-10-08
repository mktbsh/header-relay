import { For, Show } from "solid-js";

import {
  AUDIT_LOG_LEVELS,
  parseAuditLogLevel,
  type AuditLogLevel,
} from "../../../lib/domain/audit-level";
import type { AuditLog, AuditLogEvent } from "../../../lib/domain/types";
import { t, type I18nKey } from "../../../lib/i18n";
import { DetailValue, EmptyState, formatTime, Panel } from "../ui";
import { createAuditLogView } from "../view-model";

const levelLabelKeys = {
  debug: "auditLevelAll",
  info: "auditLevelInfoUp",
  warn: "auditLevelWarnUp",
  error: "auditLevelErrorOnly",
} as const satisfies Record<AuditLogLevel, I18nKey>;

const levelBadgeKeys = {
  debug: "auditLevelBadgeDebug",
  info: "auditLevelBadgeInfo",
  warn: "auditLevelBadgeWarn",
  error: "auditLevelBadgeError",
} as const satisfies Record<AuditLogLevel, I18nKey>;

const eventLabelKeys = {
  origin_matched: "auditEventOriginMatched",
  headers_captured: "auditEventHeadersCaptured",
  session_cleared: "auditEventSessionCleared",
  config_compiled: "auditEventConfigCompiled",
  dnr_rules_synced: "auditEventDnrRulesSynced",
  cookies_updated: "auditEventCookiesUpdated",
  cookie_parse_failed: "auditEventCookieParseFailed",
  error: "auditEventError",
} as const satisfies Record<AuditLogEvent, I18nKey>;

export function AuditLogSection(props: {
  logs: () => AuditLog[];
  expandedLogIds: () => ReadonlySet<string>;
  minLevel: () => AuditLogLevel;
  onExpandedChange: (logId: string, expanded: boolean) => void;
  onMinLevelChange: (level: AuditLogLevel) => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <Panel title={t("sectionLogs")} description={t("auditDescription")}>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-sm">
          <span>{t("auditLevel")}</span>
          <select
            class="hr-select w-auto"
            value={props.minLevel()}
            onChange={(event) =>
              props.onMinLevelChange(parseAuditLogLevel(event.currentTarget.value))
            }
          >
            <For each={AUDIT_LOG_LEVELS}>
              {(level) => <option value={level}>{t(levelLabelKeys[level])}</option>}
            </For>
          </select>
        </label>
        <div class="ml-auto flex gap-2">
          <button class="hr-btn" onClick={props.onRefresh}>
            {t("refresh")}
          </button>
          <button class="hr-btn hr-btn-destructive" onClick={props.onClear}>
            {t("clearLogs")}
          </button>
        </div>
      </div>
      <Show
        when={props.logs().length > 0}
        fallback={
          <EmptyState
            text={t(props.minLevel() === "debug" ? "noAuditLogs" : "noAuditLogsAtLevel")}
          />
        }
      >
        <div class="hr-card hr-list">
          <For each={props.logs()}>
            {(log) => {
              const view = createAuditLogView(log);

              return (
                <details
                  class="group"
                  data-level={log.level}
                  open={props.expandedLogIds().has(log.id)}
                  onToggle={(event) => {
                    const expanded = event.currentTarget.open;
                    if (props.expandedLogIds().has(log.id) !== expanded) {
                      props.onExpandedChange(log.id, expanded);
                    }
                  }}
                >
                  <summary class="hr-row cursor-pointer list-none marker:hidden">
                    <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                      <span
                        class={
                          log.level === "error"
                            ? "hr-badge-red"
                            : log.level === "warn"
                              ? "hr-badge-orange"
                              : "hr-badge-blue"
                        }
                      >
                        {t(levelBadgeKeys[log.level])}
                      </span>
                      <span class="font-medium break-words" title={log.event}>
                        {t(eventLabelKeys[log.event])}
                      </span>
                      <span class="hr-secondary text-xs">{formatTime(log.ts)}</span>
                      <For each={view.summaryMeta}>
                        {(item) => <span class="hr-badge">{item}</span>}
                      </For>
                    </div>
                    <Show when={log.url}>
                      <p
                        class="hr-mono mt-1 min-w-0 text-xs break-all"
                        style={{ color: "var(--ios-secondary-label)" }}
                      >
                        {log.url}
                      </p>
                    </Show>
                  </summary>
                  <div class="space-y-3 px-4 pt-1 pb-4">
                    <Show when={view.fullUrl}>
                      <DetailValue label={t("auditFullUrl")} value={view.fullUrl!} mono />
                    </Show>
                    <Show when={view.message}>
                      <DetailValue label={t("auditMessage")} value={view.message!} />
                    </Show>
                    <For each={view.identityRows}>
                      {([label, value]) => <DetailValue label={label} value={value} mono />}
                    </For>
                    <Show when={view.headerNames}>
                      <DetailValue label={t("auditHeaders")} value={view.headerNames} mono />
                    </Show>
                    <Show when={view.dataJson}>
                      <div>
                        <div
                          class="text-[11px] font-medium"
                          style={{ color: "var(--ios-secondary-label)" }}
                        >
                          {t("auditData")}
                        </div>
                        <pre
                          class="hr-mono mt-1 max-h-80 overflow-auto rounded-lg p-3 text-xs break-words whitespace-pre-wrap"
                          style={{ background: "var(--ios-fill)", color: "var(--ios-label)" }}
                        >
                          {view.dataJson}
                        </pre>
                      </div>
                    </Show>
                  </div>
                </details>
              );
            }}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
