import { createSignal } from "solid-js";

import type { AuditLogLevel } from "../../lib/domain/audit-level";
import type { AuditLog } from "../../lib/domain/types";
import { extensionClient } from "../../lib/messaging/client";
import {
  reconcileAuditLogsById,
  reconcileExpandedAuditLogIds,
  updateExpandedAuditLogIds,
} from "./view-model";

const AUDIT_LOG_LIMIT = 200;

export const useAuditLog = () => {
  const [logs, setLogs] = createSignal<AuditLog[]>([]);
  const [expandedIds, setExpandedIds] = createSignal<ReadonlySet<string>>(new Set());
  const [minLevel, setMinLevel] = createSignal<AuditLogLevel>("debug");
  let refreshing = false;
  let refreshQueued = false;

  const refresh = async () => {
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    try {
      do {
        refreshQueued = false;
        const nextLogs = await extensionClient.getAuditLogs(AUDIT_LOG_LIMIT, minLevel());
        setLogs((current) => reconcileAuditLogsById(current, nextLogs));
        setExpandedIds((current) => reconcileExpandedAuditLogIds(current, nextLogs));
      } while (refreshQueued);
    } finally {
      refreshing = false;
    }
  };

  const selectMinLevel = async (level: AuditLogLevel) => {
    setMinLevel(level);
    await refresh();
  };

  const resetMinLevel = () => setMinLevel("debug");

  const clear = async () => {
    await extensionClient.clearAuditLogs();
    setLogs([]);
    setExpandedIds(new Set<string>());
  };

  const setExpanded = (logId: string, expanded: boolean) => {
    setExpandedIds((current) => updateExpandedAuditLogIds(current, logId, expanded));
  };

  return {
    logs,
    expandedIds,
    minLevel,
    refresh,
    selectMinLevel,
    resetMinLevel,
    clear,
    setExpanded,
  };
};
