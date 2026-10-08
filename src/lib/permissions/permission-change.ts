import type { AppConfig } from "../domain/types";
import type { HostPermissionChange } from "../ports";
import { isOriginGranted, patternCoversOrigin } from "./host-permission";

export type PermissionChangeDependencies = {
  getConfig: () => Promise<AppConfig>;
  grantedOriginPatterns: () => Promise<string[]>;
  clearSessions: (profileIds: string[]) => Promise<void>;
  syncRules: () => Promise<number[]>;
};

// A captured value is owned by a profile rather than by the origin that supplied it.
// If any enabled origin in that profile loses access, the only safe deletion boundary
// is therefore the whole profile session.
export const handleHostPermissionChange = async (
  change: HostPermissionChange,
  deps: PermissionChangeDependencies,
): Promise<string[]> => {
  if (change.type === "added") {
    await deps.syncRules();
    return [];
  }

  const [config, granted] = await Promise.all([deps.getConfig(), deps.grantedOriginPatterns()]);
  const affectedProfileIds = config.profiles
    .filter((profile) =>
      profile.targetOrigins.some(
        (target) =>
          target.enabled &&
          change.origins.some((removed) => patternCoversOrigin(removed, target.origin)) &&
          !isOriginGranted(granted, target.origin),
      ),
    )
    .map((profile) => profile.id);

  if (affectedProfileIds.length > 0) await deps.clearSessions(affectedProfileIds);
  else await deps.syncRules();
  return affectedProfileIds;
};
