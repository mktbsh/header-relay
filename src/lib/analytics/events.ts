export const manageAnalyticsRoutes = [
  "overview",
  "origins",
  "headers",
  "exclude",
  "cookies",
  "probe",
  "advanced_audit_logs",
  "advanced_json_editor",
  "settings",
] as const;

export type ManageAnalyticsRoute = (typeof manageAnalyticsRoutes)[number];

export type AnalyticsProfileSection =
  | "basics"
  | "origins"
  | "fixed"
  | "capture"
  | "exclude"
  | "cookies";

export type PermissionRequestOutcome = "granted" | "denied" | "error";

// Keep this a closed union. Analytics must never accept profile ids, names, URLs,
// header names, header values, or other user-entered strings.
export type AnalyticsEvent =
  | {
      name: "page_view";
      params: { surface: "popup" } | { surface: "manage"; route: ManageAnalyticsRoute };
    }
  | {
      name: "profile_selected";
      params: { surface: "popup" | "manage" };
    }
  | {
      name: "profile_toggled";
      params: { surface: "popup" | "manage"; enabled: boolean };
    }
  | {
      name: "profile_created";
      params: { surface: "manage" };
    }
  | {
      name: "profile_deleted";
      params: { surface: "manage" };
    }
  | {
      name: "profile_section_saved";
      params: { surface: "manage"; section: AnalyticsProfileSection };
    }
  | {
      name: "fixed_header_value_updated";
      params: { surface: "popup" };
    }
  | {
      name: "session_cleared";
      params: { surface: "popup" | "manage"; scope: "all" | "profile" };
    }
  | {
      name: "host_permission_requested";
      params: {
        surface: "manage";
        requested_origin_count: number;
        outcome: PermissionRequestOutcome;
      };
    }
  | {
      name: "url_probe_run";
      params: {
        surface: "manage";
        allowed: boolean;
        matched_profile_count: number;
        effective_header_count: number;
      };
    }
  | {
      name: "ui_density_changed";
      params: { surface: "manage"; density: "comfortable" | "compact" };
    }
  | {
      name: "audit_logs_cleared";
      params: { surface: "manage" };
    }
  | {
      name: "advanced_config_applied";
      params: { surface: "manage" };
    }
  | {
      name: "review_prompt";
      params: {
        surface: "manage";
        action: "shown" | "positive" | "negative" | "rated" | "feedback" | "snoozed" | "dismissed";
      };
    }
  | {
      // Cookie operations record only surface + action + outcome + count. Cookie
      // names, values, target origins and any user-entered strings are NEVER included
      // (spec FR-19). The type shape enforces this at the trust boundary.
      name: "cookie_operation";
      params: {
        surface: "popup" | "manage";
        action:
          | "fixed_added"
          | "fixed_updated"
          | "fixed_removed"
          | "tracked_added"
          | "tracked_removed"
          | "tracked_cleared_by_name"
          | "tracked_cleared_all"
          | "migration_issue_dismissed";
        outcome: "success" | "error";
        target_count: number;
      };
    };

const profileRouteBySegment: Readonly<Record<string, ManageAnalyticsRoute>> = {
  "": "overview",
  origins: "origins",
  headers: "headers",
  "excluded-paths": "exclude",
  cookies: "cookies",
  "url-probe": "probe",
};

const settingsRouteByPath: Readonly<Record<string, ManageAnalyticsRoute>> = {
  "/settings": "settings",
  "/settings/audit-logs": "advanced_audit_logs",
  "/settings/json-editor": "advanced_json_editor",
};

// Profile identity remains in the browser URL but never crosses the analytics boundary.
// Unknown hashes are redirected to Overview, so they use the same closed fallback.
export const manageAnalyticsRouteFromHash = (hash: string): ManageAnalyticsRoute => {
  const path = hash.replace(/^#/, "");
  const profileMatch = /^\/profiles\/[^/]+(?:\/([^/]+))?$/.exec(path);
  if (profileMatch) return profileRouteBySegment[profileMatch[1] ?? ""] ?? "overview";
  return settingsRouteByPath[path] ?? "overview";
};
