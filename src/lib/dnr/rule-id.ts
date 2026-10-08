export const OWNED_MIN = 10_000;
export const OWNED_MAX = 129_999;
const SET_BASE = 10_000;
const EXCLUDED_BASE = 70_000;
const COOKIE_SET_BASE = 100_000;
const RANGE = 29_000;

const hashToInt = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const isOwnedRuleId = (ruleId: number): boolean =>
  ruleId >= OWNED_MIN && ruleId <= OWNED_MAX;

export const nextOwnedRuleId = (ruleId: number): number =>
  ruleId >= OWNED_MAX ? OWNED_MIN : ruleId + 1;

// One aggregated set rule per origin (all attached headers share this rule).
export const originSetRuleId = (profileId: string, originId: string): number =>
  SET_BASE + (hashToInt(`${profileId}:set:${originId}`) % RANGE);

// One remove rule per origin + excluded path.
export const excludedPathRuleId = (profileId: string, originId: string, pathId: string): number =>
  EXCLUDED_BASE + (hashToInt(`${profileId}:excluded:${originId}:${pathId}`) % RANGE);

// One Cookie set rule per origin partition (origin + urlRegionKey). Cookie values are
// deliberately NOT part of the ID: value-only updates keep the same ID so the atomic
// remove+add of Chrome's session-rule replace does not briefly send no cookie at all.
export const cookieSetRuleId = (origin: string, regionKey: string): number =>
  COOKIE_SET_BASE + (hashToInt(`cookie:${origin}:${regionKey}`) % RANGE);
