import { migrateAppConfig } from "./config-migration";
import { parseAppConfig } from "./config-schema";
import type { AppConfig, FixedHeaderPopupConfig, Profile } from "./types";

const redactPopup = (
  popup: FixedHeaderPopupConfig | undefined,
): FixedHeaderPopupConfig | undefined => {
  if (!popup?.options) return popup;
  const options = popup.options.map((option) => ({ ...option, value: "" }));
  if (popup.input === "select" && options.length > 1) {
    // Multiple blank select values violate the config invariant; the text input
    // keeps the redacted export importable without retaining any secret.
    return { visible: popup.visible, input: "text" };
  }
  return { ...popup, options };
};

const redactProfile = (profile: Profile): Profile => ({
  ...profile,
  fixedHeaders: profile.fixedHeaders.map((header) => ({
    ...header,
    value: "",
    popup: redactPopup(header.popup),
  })),
  fixedCookies: profile.fixedCookies.map((cookie) => ({
    ...cookie,
    value: "",
    enabled: false,
    popup: redactPopup(cookie.popup),
  })),
  migrationIssues: profile.migrationIssues.map((issue) => ({
    ...issue,
    ...(issue.originalValue !== undefined ? { originalValue: "" } : {}),
    originalPopup: redactPopup(issue.originalPopup),
  })),
});

export const serializeConfigForExport = (config: AppConfig, includeSecrets: boolean): string =>
  JSON.stringify(
    includeSecrets
      ? structuredClone(config)
      : {
          ...structuredClone(config),
          profiles: config.profiles.map((profile) => redactProfile(profile)),
        },
    null,
    2,
  );

export const parseConfigImport = (text: string): AppConfig => {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Invalid config JSON");
  }
  return parseAppConfig(migrateAppConfig(input));
};
