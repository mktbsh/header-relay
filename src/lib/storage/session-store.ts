import type { RuntimeState, SessionState } from "../domain/types";
import type { StoragePort } from "../ports";

export type SessionStore = {
  getAll: () => Promise<Record<string, SessionState>>;
  setMany: (sessions: Record<string, SessionState>) => Promise<void>;
  clear: (profileId?: string) => Promise<void>;
  // Cookie-scoped clears (spec FR-08, AC-16, AC-36). Leave captured headers alone
  // so a tracked-cookie clear does not drop the profile's tokens too.
  clearTrackedCookies: (profileId: string, cookieName?: string) => Promise<void>;
};

export const createSessionStore = ({ storage }: { storage: StoragePort }): SessionStore => {
  const runtimeItem = storage.defineItem<RuntimeState>("session:runtime", {
    fallback: { sessions: {} },
  });

  let cached: Record<string, SessionState> | undefined;
  runtimeItem.watch?.(() => {
    cached = undefined;
  });

  const store: SessionStore = {
    async getAll() {
      if (cached) return cached;
      const state = await runtimeItem.getValue();
      cached = state.sessions;
      return cached;
    },

    async setMany(sessions: Record<string, SessionState>) {
      await runtimeItem.setValue({ sessions });
      cached = sessions;
    },

    async clear(profileId?: string) {
      if (!profileId) {
        await runtimeItem.setValue({ sessions: {} });
        cached = {};
        return;
      }
      const all = await store.getAll();
      const { [profileId]: _removed, ...rest } = all;
      await runtimeItem.setValue({ sessions: rest });
      cached = rest;
    },

    async clearTrackedCookies(profileId: string, cookieName?: string) {
      const sessions = await store.getAll();
      const session = sessions[profileId];
      if (!session) return;
      const nextTracked = cookieName
        ? Object.fromEntries(
            Object.entries(session.trackedCookies ?? {}).filter(([name]) => name !== cookieName),
          )
        : {};
      const next = {
        ...sessions,
        [profileId]: {
          ...session,
          trackedCookies: nextTracked,
          updatedAt: Date.now(),
        },
      };
      await runtimeItem.setValue({ sessions: next });
      cached = next;
    },
  };

  return store;
};
