import type { AppConfig } from "../domain/types";
import { createHeaderRelay, type HeaderRelay } from "../header-relay";
import type { NetworkEventDetails } from "../lifecycle/runtime-session";
import {
  createMemoryAudit,
  createMemoryDnr,
  createMemoryPermissions,
  createMemoryStorage,
} from "./memory-ports";

export type TestRuntimeOptions = {
  config?: AppConfig;
  now?: () => number;
  /** Granted host patterns; defaults to ["<all_urls>"] (the pre-migration state). */
  grantedOrigins?: string[];
};

export type TestRuntime = HeaderRelay & {
  dnr: ReturnType<typeof createMemoryDnr>;
  audit: ReturnType<typeof createMemoryAudit>;
  permissions: ReturnType<typeof createMemoryPermissions>;
  /** Feed a response as the webRequest listener would, then settle the sync it triggers. */
  respond: (
    details: Partial<NetworkEventDetails> & Pick<NetworkEventDetails, "url">,
  ) => Promise<void>;
  /** Header name -> value that the applied ruleset attaches to `url`. */
  attachedHeaders: (url: string) => Record<string, string>;
  /**
   * Write a raw value into config storage, bypassing validation, the way an older
   * install would have left it. Use `config.set` for anything the current schema accepts.
   */
  seedStoredConfig: (value: unknown) => Promise<void>;
};

const DEFAULT_RESPONSE: Omit<NetworkEventDetails, "url"> = {
  event: "headersReceived",
  method: "GET",
  type: "xmlhttprequest",
  statusCode: 200,
};

// Evaluates the applied ruleset the way Chrome evaluates modifyHeaders: descending
// priority, and a header touched by a higher-priority rule is locked.
// ponytail: this is a model of Chrome, not Chrome. It answers "did we apply the rules
// we meant to"; whether the browser then behaves this way is what e2e is for.
const evaluateRuleset = (
  rules: Browser.declarativeNetRequest.Rule[],
  url: string,
): Record<string, string> => {
  const href = new URL(url).href;
  const headers: Record<string, string> = {};
  const locked = new Set<string>();

  const matched = rules
    .filter((rule) => new RegExp(rule.condition.regexFilter ?? "").test(href))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of matched) {
    for (const info of rule.action.requestHeaders ?? []) {
      if (locked.has(info.header)) continue;
      locked.add(info.header);
      if (info.operation === "set") headers[info.header] = info.value ?? "";
    }
  }

  return headers;
};

// Runs the real extension — config store, compiler, DNR sync, runtime session and the
// message commands — against in-memory ports. No module mocks required.
export const createTestRuntime = async (options: TestRuntimeOptions = {}): Promise<TestRuntime> => {
  const storage = createMemoryStorage();
  const dnr = createMemoryDnr();
  const audit = createMemoryAudit(options.now);
  const permissions = createMemoryPermissions(options.grantedOrigins);
  const relay = createHeaderRelay({ storage, dnr, audit, permissions, now: options.now });
  const rawConfigItem = storage.defineItem<unknown>("local:app-config", { fallback: undefined });

  if (options.config) await relay.config.set(options.config);
  // background.ts syncs on onInstalled/onStartup, so do the same here: the harness must
  // hand back the state the browser would actually be in, not an unsynced one.
  await relay.runtime.syncRules();

  return {
    ...relay,
    dnr,
    audit,
    permissions,
    respond: (details) => relay.runtime.processNetworkEvent({ ...DEFAULT_RESPONSE, ...details }),
    attachedHeaders: (url) => evaluateRuleset(dnr.rules(), url),
    seedStoredConfig: (value) => rawConfigItem.setValue(value),
  };
};
