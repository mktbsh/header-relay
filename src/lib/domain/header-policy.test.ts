import { describe, expect, it } from "vitest";

import { classifyHeaderName } from "./header-policy";

describe("header policy – request (default)", () => {
  it.each(["Authorization", "X-Auth-Token", "x-access-token", "X-API-Key", "Api-Key"])(
    "warns for credential-bearing header %s after normalization",
    (name) => {
      expect(classifyHeaderName(`  ${name}  `)).toMatchObject({
        normalizedName: name.toLowerCase(),
        level: "sensitive",
        reason: "credentials",
      });
    },
  );

  it("warns for Cookie without blocking future cookie workflows", () => {
    expect(classifyHeaderName(" COOKIE ")).toEqual({
      normalizedName: "cookie",
      level: "sensitive",
      reason: "browser-cookie-state",
    });
  });

  it.each([
    "Set-Cookie",
    "Host",
    "Content-Length",
    "Connection",
    "Keep-Alive",
    "Proxy-Connection",
    "Proxy-Authenticate",
    "Proxy-Authorization",
    "TE",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade",
  ])("blocks browser- or transport-owned header %s regardless of case", (name) => {
    expect(classifyHeaderName(name.toUpperCase()).level).toBe("blocked");
  });

  it("allows ordinary application headers", () => {
    expect(classifyHeaderName(" X-Release-Track ")).toEqual({
      normalizedName: "x-release-track",
      level: "allowed",
    });
  });
});
