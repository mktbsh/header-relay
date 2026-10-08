import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openManagePage } from "./pages/manage";

// Local HTTP server that echoes back the `Cookie` header it received. This is the
// mechanism the plan (Ticket 07) prescribes to prove the feature works end-to-end
// in a real Chromium, without depending on any external service.
async function startEchoServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/set-sid") {
      res.setHeader("Set-Cookie", "SID=tracked; Path=/");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ set: true }));
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ cookie: req.headers.cookie ?? null, path: req.url }));
  });
  // Bind 127.0.0.1 but expose via "localhost" so the manifest's default host permission
  // (`http://localhost/*`, any port) grants access without a permissions.request() dialog
  // — headless Chromium can't dismiss those.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: `http://localhost:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

// The manage page normally does user-driven config edits. For E2E we go straight
// through the messaging protocol so a single test doesn't have to click through
// 15 form fields — it still exercises the exact code path the sections use.
// @webext-core/messaging wraps every message in an envelope `{ id, type, data, timestamp }`
// — the receiving listener rejects messages missing `timestamp`. This helper mirrors that
// shape so we can drive the background from an extension page in tests.
async function saveConfig(page: Page, config: unknown): Promise<void> {
  await page.evaluate(async (cfg) => {
    const b = (
      globalThis as unknown as {
        browser: { runtime: { sendMessage: (msg: unknown) => Promise<unknown> } };
      }
    ).browser;
    await b.runtime.sendMessage({
      id: Date.now(),
      type: "SAVE_CONFIG",
      data: cfg,
      timestamp: Date.now(),
    });
  }, config);
}

function makeConfig(
  origin: string,
  overrides: {
    fixedCookies?: { id: string; name: string; value: string; enabled: boolean }[];
    trackedCookies?: { id: string; name: string; enabled: boolean }[];
    excludedPaths?: { id: string; pathPrefix: string; enabled: boolean }[];
  } = {},
) {
  return {
    schemaVersion: 5,
    profiles: [
      {
        id: "p1",
        name: "e2e",
        enabled: true,
        targetOrigins: [{ id: "o1", origin, enabled: true }],
        fixedHeaders: [],
        captureHeaders: [],
        excludedPaths: overrides.excludedPaths ?? [],
        fixedCookies: overrides.fixedCookies ?? [],
        trackedCookies: overrides.trackedCookies ?? [],
        migrationIssues: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

async function fetchEcho(page: Page, origin: string): Promise<{ cookie: string | null }> {
  return page.evaluate(async (o) => {
    const res = await fetch(`${o}/echo`, { credentials: "include" });
    return (await res.json()) as { cookie: string | null };
  }, origin);
}

test.describe("Cookie request header (real Chromium)", () => {
  let server: Awaited<ReturnType<typeof startEchoServer>>;

  test.beforeAll(async () => {
    server = await startEchoServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("AC-01: fixed cookie fully replaces Chrome's original Cookie", async ({
    context,
    extensionId,
  }) => {
    const managePage = await context.newPage();
    await openManagePage(managePage, extensionId);
    // http://localhost/* is a mandatory host permission — no request() needed.

    const config = makeConfig(server.origin, {
      fixedCookies: [{ id: "c1", name: "SID", value: "fixed-value", enabled: true }],
    });
    await saveConfig(managePage, config);
    await managePage.waitForTimeout(500);

    const responsePage = await context.newPage();
    await responsePage.goto(`${server.origin}/set-sid`);
    const echoed = await fetchEcho(responsePage, server.origin);
    expect(echoed.cookie).toBe("SID=fixed-value");
  });

  test("AC-24: tracked cookie without captured value leaves Chrome's Cookie alone", async ({
    context,
    extensionId,
  }) => {
    const managePage = await context.newPage();
    await openManagePage(managePage, extensionId);
    // http://localhost/* is a mandatory host permission — no request() needed.

    const config = makeConfig(server.origin, {
      trackedCookies: [{ id: "t1", name: "SESSION", enabled: true }],
    });
    await saveConfig(managePage, config);
    await managePage.waitForTimeout(500);

    const responsePage = await context.newPage();
    await responsePage.goto(`${server.origin}/set-sid`);
    // Chrome's original: SID=tracked (set by /set-sid). Header Relay must NOT touch it —
    // SESSION is registered but never captured, so no Cookie DNR rule exists.
    const echoed = await fetchEcho(responsePage, server.origin);
    expect(echoed.cookie).toBe("SID=tracked");
  });

  test("AC-02 + AC-23: Set-Cookie is captured then relayed on the next request", async ({
    context,
    extensionId,
  }) => {
    const managePage = await context.newPage();
    await openManagePage(managePage, extensionId);
    // http://localhost/* is a mandatory host permission — no request() needed.

    const config = makeConfig(server.origin, {
      trackedCookies: [{ id: "t1", name: "SID", enabled: true }],
    });
    await saveConfig(managePage, config);
    await managePage.waitForTimeout(500);

    const responsePage = await context.newPage();
    await responsePage.goto(`${server.origin}/set-sid`);
    // Give the background service worker time to parse Set-Cookie and re-sync DNR.
    await responsePage.waitForTimeout(500);

    const echoed = await fetchEcho(responsePage, server.origin);
    expect(echoed.cookie).toContain("SID=tracked");
  });
});
