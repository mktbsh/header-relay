import {
  Navigate,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from "@tanstack/solid-router";
import { onMount } from "solid-js";

import { profileNameLookup } from "../../lib/compiler/compile-issue-text";
import { httpOriginOf } from "../../lib/matching/route-condition";
import App, { useManageRouteContext } from "./App";
import { ProfileLayout } from "./layouts/ProfileLayout";
import { SettingsLayout } from "./layouts/SettingsLayout";
import { profilePath } from "./navigation";
import { AdvancedJsonSection } from "./sections/AdvancedJsonSection";
import { AuditLogSection } from "./sections/AuditLogSection";
import { CookiesSection } from "./sections/CookiesSection";
import { ExcludedPathsSection } from "./sections/ExcludedPathsSection";
import { HeadersSection } from "./sections/HeadersSection";
import { ProfileBasicsSection } from "./sections/ProfileBasicsSection";
import { SettingsSection } from "./sections/SettingsSection";
import { TargetOriginsSection } from "./sections/TargetOriginsSection";
import { UrlProbeSection } from "./sections/UrlProbeSection";

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const rootRoute = createRootRoute({ component: App });

const FirstProfileRedirect = () => {
  const context = useManageRouteContext();
  return <Navigate to={profilePath(context.profiles()[0]!.id)} replace />;
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: FirstProfileRedirect,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiles/$profileId",
  component: () => {
    const params = profileRoute.useParams();
    return <ProfileLayout profileId={params().profileId} />;
  },
});

const overviewRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "/",
  component: () => {
    const context = useManageRouteContext();
    return (
      <ProfileBasicsSection
        active={context.active}
        session={context.session}
        runtime={context.runtime}
        profileName={profileNameLookup(context.profiles())}
        capturedRows={context.capturedRows}
        attachHeaderNames={context.attachHeaderNames}
        profileNameDraft={context.profileNameDraft}
        profileNameError={context.profileNameError}
        canDeleteProfile={context.canDeleteProfile}
        onUpdateProfileName={context.updateProfileName}
        onDuplicateProfile={context.duplicateActiveProfile}
        onDeleteProfile={context.deleteActiveProfile}
        saveDirty={() => context.sectionDirty("basics")}
        saving={() => context.sectionSaving("basics")}
        saveBlocked={() => context.sectionSaveBlocked("basics")}
        onSave={() => context.saveSection("basics")}
      />
    );
  },
});

const originsRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "origins",
  validateSearch: (search: Record<string, unknown>): { add?: string } =>
    typeof search.add === "string" ? { add: search.add } : {},
  component: () => {
    const context = useManageRouteContext();
    const search = originsRoute.useSearch();
    const navigate = useNavigate();
    // The popup links here with `?add=<origin>` for a page no profile matches yet. The origin
    // becomes an unsaved row so saving still goes through the host-access request.
    onMount(() => {
      const requested = search().add;
      if (requested === undefined) return;
      const origin = httpOriginOf(requested);
      if (origin)
        context.replaceProfile((p) => {
          const existing = p.targetOrigins.find((item) => item.origin === origin);
          if (existing) existing.enabled = true;
          else p.targetOrigins.push({ id: createId("origin"), origin, enabled: true });
        });
      void navigate({ to: ".", search: {}, replace: true });
    });
    return (
      <TargetOriginsSection
        active={context.active}
        replaceProfile={context.replaceProfile}
        originAccess={context.originAccess}
        onGrant={context.grantOrigin}
        onAdd={() =>
          context.replaceProfile((p) => {
            p.targetOrigins.push({
              id: createId("origin"),
              origin: "http://localhost:3000",
              enabled: true,
            });
          })
        }
        saveDirty={() => context.sectionDirty("origins")}
        saving={() => context.sectionSaving("origins")}
        saveBlocked={() => context.sectionSaveBlocked("origins")}
        onSave={() => context.saveSection("origins")}
      />
    );
  },
});

const headersRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "headers",
  component: () => {
    const context = useManageRouteContext();
    return (
      <HeadersSection
        active={context.active}
        replaceProfile={context.replaceProfile}
        onAddFixed={() =>
          context.replaceProfile((p) => {
            p.fixedHeaders.push({ id: createId("fixed"), name: "", value: "", enabled: false });
          })
        }
        onAddCapture={() =>
          context.replaceProfile((p) => {
            p.captureHeaders.push({ id: createId("capture"), name: "", enabled: false });
          })
        }
        fixedSaveDirty={() => context.sectionDirty("fixed")}
        fixedSaving={() => context.sectionSaving("fixed")}
        fixedSaveBlocked={() => context.sectionSaveBlocked("fixed")}
        onSaveFixed={() => context.saveSection("fixed")}
        captureSaveDirty={() => context.sectionDirty("capture")}
        captureSaving={() => context.sectionSaving("capture")}
        captureSaveBlocked={() => context.sectionSaveBlocked("capture")}
        onSaveCapture={() => context.saveSection("capture")}
        capturedRows={context.capturedRows}
        onClearSession={() => void context.clearSession()}
      />
    );
  },
});

const cookiesRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "cookies",
  component: () => {
    const context = useManageRouteContext();
    return (
      <CookiesSection
        active={context.active}
        session={context.session}
        replaceProfile={context.replaceProfile}
        onAddFixedCookie={() =>
          context.replaceProfile((p) => {
            p.fixedCookies.push({
              id: createId("fixed-cookie"),
              name: "",
              value: "",
              enabled: false,
            });
          })
        }
        onAddTrackedCookie={() =>
          context.replaceProfile((p) => {
            p.trackedCookies.push({ id: createId("tracked-cookie"), name: "", enabled: false });
          })
        }
        onClearTrackedCookie={context.clearTrackedCookie}
        onClearAllTrackedCookies={context.clearAllTrackedCookies}
        onDismissMigrationIssue={(issueId) =>
          context.replaceProfile((p) => {
            p.migrationIssues = p.migrationIssues.filter((issue) => issue.id !== issueId);
          })
        }
        saveDirty={() => context.sectionDirty("cookies")}
        saving={() => context.sectionSaving("cookies")}
        saveBlocked={() => context.sectionSaveBlocked("cookies")}
        onSave={() => context.saveSection("cookies")}
      />
    );
  },
});

const excludeRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "excluded-paths",
  component: () => {
    const context = useManageRouteContext();
    return (
      <ExcludedPathsSection
        active={context.active}
        replaceProfile={context.replaceProfile}
        onAdd={() =>
          context.replaceProfile((p) => {
            p.excludedPaths.push({ id: createId("exclude"), pathPrefix: "", enabled: false });
          })
        }
        saveDirty={() => context.sectionDirty("exclude")}
        saving={() => context.sectionSaving("exclude")}
        saveBlocked={() => context.sectionSaveBlocked("exclude")}
        onSave={() => context.saveSection("exclude")}
      />
    );
  },
});

const urlProbeRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "url-probe",
  component: () => {
    const context = useManageRouteContext();
    return (
      <UrlProbeSection
        testUrl={context.urlProbe.testUrl}
        testResult={context.urlProbe.testResult}
        testError={context.urlProbe.testError}
        canRun={context.urlProbe.canRun}
        profileName={profileNameLookup(context.profiles())}
        onUpdateUrl={context.urlProbe.updateUrl}
        onRun={() => void context.urlProbe.run()}
      />
    );
  },
});

const auditLogsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "audit-logs",
  component: () => {
    const context = useManageRouteContext();
    return (
      <AuditLogSection
        logs={context.auditLog.logs}
        expandedLogIds={context.auditLog.expandedIds}
        minLevel={context.auditLog.minLevel}
        onExpandedChange={context.auditLog.setExpanded}
        onMinLevelChange={(level) => void context.auditLog.selectMinLevel(level)}
        onRefresh={() => void context.auditLog.refresh()}
        onClear={() => void context.clearLogs()}
      />
    );
  },
});

const jsonEditorRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "json-editor",
  component: () => {
    const context = useManageRouteContext();
    return (
      <AdvancedJsonSection
        jsonText={context.jsonText}
        onUpdateJsonText={context.updateJsonText}
        onApplyJson={context.applyJson}
        onExport={context.exportConfig}
        onImportFile={context.importConfig}
      />
    );
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
});

const generalSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: () => {
    const context = useManageRouteContext();
    return (
      <SettingsSection
        compact={context.compact}
        saving={context.densitySaving}
        onCompactChange={(checked) => context.setDensity(checked ? "compact" : "comfortable")}
      />
    );
  },
});

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: FirstProfileRedirect,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  profileRoute.addChildren([
    overviewRoute,
    originsRoute,
    headersRoute,
    cookiesRoute,
    excludeRoute,
    urlProbeRoute,
  ]),
  settingsRoute.addChildren([generalSettingsRoute, auditLogsRoute, jsonEditorRoute]),
  notFoundRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

export function ManageRouter() {
  return <RouterProvider router={router} />;
}
