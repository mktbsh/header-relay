import type { Profile } from "../domain/types";
import { t } from "../i18n";
import type { CompileError, CompileWarning } from "./compile-config";

// The compiler's own `message` is an English diagnostic for audit logs; the UI renders
// issues from their codes so they follow the browser locale.
export const describeCompileIssue = (
  issue: CompileWarning | CompileError,
  profileName: (profileId: string) => string,
): string => {
  const names = (ids: string[]) => ids.map(profileName).join(", ");
  switch (issue.code) {
    case "no-target-origins":
      return t("compileWarningNoTargetOrigins", profileName(issue.profileId));
    case "no-headers":
      return t("compileWarningNoHeaders", profileName(issue.profileId));
    case "excluded-paths-remove-headers":
      return t("compileWarningExcludedPathsRemoveHeaders", profileName(issue.profileId));
    case "cookie-exclusion-cannot-preserve":
      return t("compileWarningCookieExclusion", [issue.origin, issue.excludedPathGlobs.join(", ")]);
    case "header-conflict":
      return t("compileErrorHeaderConflict", [
        issue.headerName,
        issue.origin,
        names(issue.profileIds),
      ]);
    case "cookie-conflict":
      return t("compileErrorCookieConflict", [
        issue.cookieName,
        issue.origin,
        names(issue.profileIds),
      ]);
  }
};

// A conflict can name a profile deleted since the last compile, so unknown IDs stay as-is.
export const profileNameLookup =
  (profiles: readonly Profile[]) =>
  (profileId: string): string =>
    profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
