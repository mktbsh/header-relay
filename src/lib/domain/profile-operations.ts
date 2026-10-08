import { createProfileCopyName } from "./profile-name";
import type { Profile } from "./types";

export type ProfileMoveDirection = "up" | "down";

const freshId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const copyItemsWithFreshIds = <Item extends { id: string }>(
  items: readonly Item[],
  prefix: string,
): Item[] => structuredClone(items).map((item) => ({ ...item, id: freshId(prefix) }));

export const copyProfile = (
  source: Profile,
  existingProfiles: readonly Profile[],
  now: number,
): Profile => {
  const copy = structuredClone(source);

  return {
    ...copy,
    id: freshId("profile"),
    name: createProfileCopyName(source.name, existingProfiles),
    enabled: false,
    targetOrigins: copyItemsWithFreshIds(source.targetOrigins, "origin"),
    fixedHeaders: copyItemsWithFreshIds(source.fixedHeaders, "fixed"),
    captureHeaders: copyItemsWithFreshIds(source.captureHeaders, "capture"),
    excludedPaths: copyItemsWithFreshIds(source.excludedPaths, "exclude"),
    fixedCookies: copyItemsWithFreshIds(source.fixedCookies, "fixed-cookie"),
    trackedCookies: copyItemsWithFreshIds(source.trackedCookies, "tracked-cookie"),
    migrationIssues: copyItemsWithFreshIds(source.migrationIssues, "migration-issue"),
    createdAt: now,
    updatedAt: now,
  };
};

export const insertProfileAfter = (
  profiles: readonly Profile[],
  profileId: string,
  inserted: Profile,
): Profile[] => {
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) return [...profiles];
  return [...profiles.slice(0, index + 1), inserted, ...profiles.slice(index + 1)];
};

export const moveProfile = (
  profiles: readonly Profile[],
  profileId: string,
  direction: ProfileMoveDirection,
): Profile[] => {
  const index = profiles.findIndex((profile) => profile.id === profileId);
  const targetIndex = index + (direction === "up" ? -1 : 1);
  if (index < 0 || targetIndex < 0 || targetIndex >= profiles.length) return [...profiles];

  const next = [...profiles];
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  return next;
};
