import { describe, expect, it } from "vitest";

import { createMemoryAudit } from "./memory-ports";

describe("memory audit port", () => {
  it("filters by minimum level before applying the recent limit", async () => {
    const audit = createMemoryAudit(() => 3);

    await audit.add({ level: "error", event: "error", ts: 1 });
    await audit.add({ level: "info", event: "config_compiled", ts: 2 });
    await audit.add({ level: "warn", event: "cookie_parse_failed", ts: 3 });

    expect(await audit.recent({ limit: 1, minLevel: "warn" })).toMatchObject([
      { level: "warn", ts: 3 },
    ]);
    expect(await audit.recent({ minLevel: "error" })).toMatchObject([{ level: "error", ts: 1 }]);
  });
});
