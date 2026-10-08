import { describe, expect, it } from "vitest";

import type { Profile, SessionState, TrackedCookie } from "../domain/types";
import {
  applySetCookies,
  buildProfileCookieCandidates,
  composeCookieHeaderValue,
  parseSetCookie,
} from "./core";

const NOW = 2_000;

const trackedName = (name: string, enabled = true): TrackedCookie => ({
  id: `tc-${name}`,
  name,
  enabled,
});

const emptySession = (profileId = "p"): SessionState => ({
  profileId,
  phase: "unauthenticated",
  capturedHeaders: {},
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: 0,
});

const baseProfile = (over: Partial<Profile> = {}): Profile => ({
  id: "p",
  name: "p",
  enabled: true,
  targetOrigins: [],
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe("parseSetCookie", () => {
  it("parses a plain name=value pair as update", () => {
    expect(parseSetCookie("SID=abc", NOW)).toEqual({ kind: "update", name: "SID", value: "abc" });
  });

  it("uses only the first '=' to split name and value", () => {
    expect(parseSetCookie("token=x=y=z", NOW)).toEqual({
      kind: "update",
      name: "token",
      value: "x=y=z",
    });
  });

  it("ignores case of attribute names", () => {
    expect(parseSetCookie("SID=abc; MAX-AGE=10", NOW).kind).toBe("update");
    expect(parseSetCookie("SID=abc; max-age=0", NOW).kind).toBe("delete");
  });

  it("returns delete when Max-Age is zero or negative", () => {
    expect(parseSetCookie("SID=abc; Max-Age=0", NOW)).toEqual({ kind: "delete", name: "SID" });
    expect(parseSetCookie("SID=abc; Max-Age=-1", NOW)).toEqual({ kind: "delete", name: "SID" });
  });

  it("uses past Expires as delete only when Max-Age is absent or invalid", () => {
    const past = new Date(NOW - 60_000).toUTCString();
    const future = new Date(NOW + 60_000).toUTCString();
    expect(parseSetCookie(`SID=abc; Expires=${past}`, NOW)).toEqual({
      kind: "delete",
      name: "SID",
    });
    // Valid positive Max-Age wins over past Expires -> update.
    expect(parseSetCookie(`SID=abc; Max-Age=10; Expires=${past}`, NOW)).toEqual({
      kind: "update",
      name: "SID",
      value: "abc",
    });
    // Invalid Max-Age falls back to Expires -> delete.
    expect(parseSetCookie(`SID=abc; Max-Age=oops; Expires=${past}`, NOW)).toEqual({
      kind: "delete",
      name: "SID",
    });
    // Future Expires with no valid Max-Age -> update.
    expect(parseSetCookie(`SID=abc; Expires=${future}`, NOW)).toEqual({
      kind: "update",
      name: "SID",
      value: "abc",
    });
  });

  it("returns invalid for missing '='", () => {
    expect(parseSetCookie("junk", NOW)).toEqual({ kind: "invalid" });
  });

  it("returns invalid with name for bad value chars", () => {
    expect(parseSetCookie("SID=with space", NOW)).toEqual({ kind: "invalid", name: "SID" });
  });

  it("returns invalid without name when the name itself is bad", () => {
    expect(parseSetCookie(" =abc", NOW)).toEqual({ kind: "invalid" });
    expect(parseSetCookie("bad name=abc", NOW)).toEqual({ kind: "invalid" });
  });

  it("ignores unknown attributes", () => {
    expect(parseSetCookie("SID=abc; Domain=example.test; Path=/; Secure", NOW)).toEqual({
      kind: "update",
      name: "SID",
      value: "abc",
    });
  });
});

describe("applySetCookies", () => {
  const tracked = [trackedName("SID"), trackedName("csrf")];

  it("updates only names in the tracked list", () => {
    const result = applySetCookies({
      session: emptySession(),
      trackedCookies: tracked,
      setCookies: ["SID=abc", "unknown=x", "csrf=t"],
      now: NOW,
    });
    expect(Object.keys(result.session.trackedCookies).sort()).toEqual(["SID", "csrf"]);
    expect(result.updatedNames).toEqual(["SID", "csrf"]);
  });

  it("processes headers in order and takes the last valid update per name", () => {
    const result = applySetCookies({
      session: emptySession(),
      trackedCookies: tracked,
      setCookies: ["SID=one", "SID=two", "SID=three"],
      now: NOW,
    });
    expect(result.session.trackedCookies.SID?.value).toBe("three");
  });

  it("skips invalid parses without disturbing valid ones", () => {
    const result = applySetCookies({
      session: emptySession(),
      trackedCookies: tracked,
      setCookies: ["SID=ok", "bogus", "SID=with space"],
      now: NOW,
    });
    expect(result.session.trackedCookies.SID?.value).toBe("ok");
    expect(result.invalidNames).toEqual(["SID"]);
    expect(result.invalidUnnamed).toBe(1);
  });

  it("delete removes an existing tracked value", () => {
    const seeded = emptySession();
    seeded.trackedCookies = { SID: { name: "SID", value: "old", capturedAt: 1 } };
    const result = applySetCookies({
      session: seeded,
      trackedCookies: tracked,
      setCookies: ["SID=x; Max-Age=0"],
      now: NOW,
    });
    expect(result.session.trackedCookies).toEqual({});
    expect(result.deletedNames).toEqual(["SID"]);
  });

  it("keeps case-sensitivity: SID and sid are separate", () => {
    const result = applySetCookies({
      session: emptySession(),
      trackedCookies: [trackedName("SID"), trackedName("sid")],
      setCookies: ["SID=upper", "sid=lower"],
      now: NOW,
    });
    expect(result.session.trackedCookies.SID?.value).toBe("upper");
    expect(result.session.trackedCookies.sid?.value).toBe("lower");
  });
});

describe("buildProfileCookieCandidates", () => {
  it("emits enabled fixed cookies before tracked cookies (config order preserved)", () => {
    const profile = baseProfile({
      fixedCookies: [
        { id: "f2", name: "b", value: "2", enabled: true },
        { id: "f1", name: "a", value: "1", enabled: true },
      ],
      trackedCookies: [
        { id: "t1", name: "SID", enabled: true },
        { id: "t2", name: "csrf", enabled: true },
      ],
    });
    const session = emptySession();
    session.trackedCookies = {
      SID: { name: "SID", value: "s", capturedAt: 1 },
      csrf: { name: "csrf", value: "c", capturedAt: 1 },
    };
    const candidates = buildProfileCookieCandidates({ profile, session });
    expect(candidates).toEqual([
      { name: "b", value: "2" },
      { name: "a", value: "1" },
      { name: "SID", value: "s" },
      { name: "csrf", value: "c" },
    ]);
  });

  it("fixed wins over tracked when name collides", () => {
    const profile = baseProfile({
      fixedCookies: [{ id: "f", name: "SID", value: "fixed", enabled: true }],
      trackedCookies: [{ id: "t", name: "SID", enabled: true }],
    });
    const session = emptySession();
    session.trackedCookies = { SID: { name: "SID", value: "tracked", capturedAt: 1 } };
    expect(buildProfileCookieCandidates({ profile, session })).toEqual([
      { name: "SID", value: "fixed" },
    ]);
  });

  it("omits tracked cookies whose value has not been captured yet", () => {
    const profile = baseProfile({
      trackedCookies: [{ id: "t", name: "SID", enabled: true }],
    });
    expect(buildProfileCookieCandidates({ profile, session: null })).toEqual([]);
  });

  it("omits disabled fixed and tracked cookies", () => {
    const profile = baseProfile({
      fixedCookies: [{ id: "f", name: "a", value: "1", enabled: false }],
      trackedCookies: [{ id: "t", name: "SID", enabled: false }],
    });
    const session = emptySession();
    session.trackedCookies = { SID: { name: "SID", value: "s", capturedAt: 1 } };
    expect(buildProfileCookieCandidates({ profile, session })).toEqual([]);
  });
});

describe("composeCookieHeaderValue", () => {
  it("returns undefined when there are no candidates", () => {
    expect(composeCookieHeaderValue([])).toBeUndefined();
  });

  it("joins candidates with '; '", () => {
    expect(
      composeCookieHeaderValue([
        { name: "a", value: "1" },
        { name: "b", value: "2" },
      ]),
    ).toBe("a=1; b=2");
  });
});
