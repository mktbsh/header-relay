import { describe, expect, it } from "vitest";

import { validateCookieName, validateCookieValue } from "./cookie-policy";

describe("validateCookieName", () => {
  it.each(["SID", "sid", "session_id", "csrf-token", "a1", "!#$%&'*+.^_`|~-"])(
    "accepts RFC 6265 token %s",
    (name) => {
      const result = validateCookieName(name);
      expect(result).toEqual({ ok: true, value: name });
    },
  );

  it("rejects empty name", () => {
    expect(validateCookieName("")).toEqual({ ok: false, error: "empty" });
  });

  it.each(["a b", "a;b", "a=b", "a,b", "a\tb", "with space", "パス"])(
    "rejects name %s that contains a disallowed character",
    (name) => {
      const result = validateCookieName(name);
      expect(result.ok).toBe(false);
    },
  );

  it("keeps case exactly as given (SID != sid)", () => {
    expect(validateCookieName("SID")).toEqual({ ok: true, value: "SID" });
    expect(validateCookieName("sid")).toEqual({ ok: true, value: "sid" });
  });
});

describe("validateCookieValue", () => {
  it("accepts the empty value", () => {
    expect(validateCookieValue("")).toEqual({ ok: true, value: "" });
  });

  it.each(["abc", "token123", "foo.bar+baz-qux", '"quoted"', "a=b", "%2F"])(
    "accepts RFC 6265 cookie-octet value %s",
    (value) => {
      expect(validateCookieValue(value)).toEqual({ ok: true, value });
    },
  );

  it.each(["with space", "semi;colon", "comma,val", 'inner"quote', "back\\slash"])(
    "rejects value %s that contains a disallowed character",
    (value) => {
      expect(validateCookieValue(value).ok).toBe(false);
    },
  );
});
