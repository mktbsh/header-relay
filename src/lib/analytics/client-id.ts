import type { StorageItem } from "../ports";
import { generateUuidV7, isUuidV7 } from "./uuid-v7";

export type AnalyticsClientIdStore = {
  getOrCreate: () => Promise<string>;
};

export const createAnalyticsClientIdStore = (
  item: StorageItem<string>,
  generateId: () => string = generateUuidV7,
): AnalyticsClientIdStore => {
  let cached: string | undefined;
  let pending: Promise<string> | undefined;

  return {
    async getOrCreate() {
      if (cached) return cached;
      if (pending) return pending;

      pending = (async () => {
        const stored = await item.getValue();
        if (isUuidV7(stored)) return stored;

        const created = generateId();
        if (!isUuidV7(created))
          throw new Error("Analytics client id generator returned invalid UUID v7");
        await item.setValue(created);
        return created;
      })();

      try {
        cached = await pending;
        return cached;
      } finally {
        pending = undefined;
      }
    },
  };
};
