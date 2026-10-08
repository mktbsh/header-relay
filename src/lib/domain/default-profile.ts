import type { AppConfig, Profile } from "./types";

export const CONFIG_SCHEMA_VERSION = 7;

const now = () => Date.now();

const createProfileBase = (name: string): Profile => {
  const createdAt = now();

  return {
    id: `profile-${crypto.randomUUID().slice(0, 8)}`,
    name,
    enabled: false,
    targetOrigins: [],
    fixedHeaders: [],
    captureHeaders: [],
    excludedPaths: [],
    fixedCookies: [],
    trackedCookies: [],
    migrationIssues: [],
    createdAt,
    updatedAt: createdAt,
  };
};

export const createInitialProfile = (): Profile => {
  const profile = createProfileBase("Local Development");
  return {
    ...profile,
    id: "profile-local-dev",
    targetOrigins: [
      { id: "origin-localhost", origin: "http://localhost:3000", enabled: true },
      { id: "origin-loopback", origin: "http://127.0.0.1:3000", enabled: true },
    ],
  };
};

export const createProfile = (name = "New API"): Profile => createProfileBase(name);

export const createDefaultConfig = (): AppConfig => {
  const profile = createInitialProfile();

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    profiles: [profile],
  };
};
