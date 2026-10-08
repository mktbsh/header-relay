import { selectEnabledProfiles } from "../compiler/compile-config";
import { migrateAppConfig } from "../domain/config-migration";
import { parseAppConfig } from "../domain/config-schema";
import { CONFIG_SCHEMA_VERSION, createDefaultConfig } from "../domain/default-profile";
import { normalizeStoredExcludedPaths } from "../domain/excluded-path";
import type { AppConfig, Profile } from "../domain/types";
import type { AuditPort, StoragePort } from "../ports";

export type ConfigStoreDependencies = {
  storage: StoragePort;
  audit: AuditPort;
};

export type ConfigStore = {
  get: () => Promise<AppConfig>;
  set: (config: AppConfig) => Promise<void>;
  getEnabledProfiles: () => Promise<Profile[]>;
};

export const createConfigStore = ({ storage, audit }: ConfigStoreDependencies): ConfigStore => {
  const configItem = storage.defineItem<AppConfig>("local:app-config", {
    fallback: createDefaultConfig(),
  });

  // The <all_urls> webRequest listener reads the enabled profiles on every response,
  // so cache the parsed config in the service worker and hit storage/Zod only on a
  // cold read or after a write. storage.watch invalidates the cache when another
  // context writes the item (guarded so an adapter without watch is a no-op).
  let cached: AppConfig | undefined;
  configItem.watch?.(() => {
    cached = undefined;
  });

  const load = async (): Promise<AppConfig> => {
    const stored = await configItem.getValue();
    try {
      const migrated = migrateAppConfig(stored);
      const normalized = normalizeStoredExcludedPaths(migrated as AppConfig);
      const parsed = parseAppConfig(normalized.config);
      if (normalized.changed || JSON.stringify(migrated) !== JSON.stringify(stored)) {
        await configItem.setValue(parsed);
      }
      if (normalized.changed) {
        await audit.add({
          level: "warn",
          event: "error",
          message: "Invalid excluded-path rules were disabled during config migration.",
        });
      }
      return parsed;
    } catch (error) {
      const fresh = createDefaultConfig();
      await configItem.setValue(fresh);
      await audit.add({
        level: "error",
        event: "error",
        message: `Stored config was invalid and has been reset to defaults: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return fresh;
    }
  };

  const store: ConfigStore = {
    async get() {
      cached ??= await load();
      return cached;
    },

    async set(config: AppConfig) {
      const parsed = parseAppConfig({
        ...config,
        schemaVersion: CONFIG_SCHEMA_VERSION,
      });
      await configItem.setValue(parsed);
      cached = parsed;
    },

    // Runtime reads this, never the selection: every enabled profile is applied.
    async getEnabledProfiles() {
      const config = await store.get();
      return selectEnabledProfiles(config.profiles);
    },
  };

  return store;
};
