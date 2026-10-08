import type { CompiledCookieRule, CompiledConfig, CompiledRule } from "../compiler/compile-config";
import { normalizeHeaderName } from "../header-emulation/core";
import { createDnrExcludedPathRegex, createDnrOriginRegex } from "../matching/route-condition";
import {
  cookieSetRuleId,
  excludedPathRuleId,
  nextOwnedRuleId,
  originSetRuleId,
  OWNED_MAX,
  OWNED_MIN,
} from "./rule-id";

const SET_PRIORITY = 1;
const REMOVE_PRIORITY = 100;
// Cookie rules occupy their own priority tier above the generic header rules so a
// Cookie set never collides with generic set/remove rules for other headers.
// Per-glob regions get a higher priority than the origin-wide base so Chrome picks
// the reduced cookie value on excluded paths.
const COOKIE_SET_BASE_PRIORITY = 200;
const COOKIE_SET_REGION_PRIORITY = 300;
// DNR requires the lowercase form for the cookie header name to appear in the
// modifyHeaders append-allowlist (see Chrome DNR modifyHeaders docs); we always
// emit lowercase and never rely on the append operation for cookies.
const COOKIE_HEADER_NAME = "cookie";

export type HeaderRuleBuildResult = {
  rules: Browser.declarativeNetRequest.Rule[];
  ruleIdsByProfile: Record<string, number[]>;
  warnings: string[];
};

const HEADER_SET = "set" as Browser.declarativeNetRequest.HeaderOperation;
const HEADER_REMOVE = "remove" as Browser.declarativeNetRequest.HeaderOperation;
const MODIFY_HEADERS = "modifyHeaders" as Browser.declarativeNetRequest.RuleActionType;
// The match scope every rule shares.
//
// resourceTypes: a protected origin rejects its own subresources (script /
// stylesheet / favicon) just as it rejects the document, so attach on all of
// them. Listed explicitly because omitting the key matches everything *except*
// main_frame. `websocket` is inert for now — a wss:// handshake URL never
// matches the https:// origin regex — and stays listed for when wss origins
// become configurable.
//
// isUrlFilterCaseSensitive: DNR defaults to case-insensitive, but the runtime
// evaluation (matchesExcludedGlob) and URL Probe both use a plain JS RegExp.
// Without this, an excluded path could strip headers on a casing the probe
// reported as attached.
const MATCH_SCOPE = {
  resourceTypes: [
    "main_frame",
    "sub_frame",
    "stylesheet",
    "script",
    "image",
    "font",
    "object",
    "xmlhttprequest",
    "ping",
    "csp_report",
    "media",
    "websocket",
    "webbundle",
    "other",
  ] as unknown as Browser.declarativeNetRequest.ResourceType[],
  isUrlFilterCaseSensitive: true,
};

// Capture stays narrower than the attach scope: Set-Cookie on a stylesheet or an
// image is rare, and matching the attach scope here would wake the service worker
// on every subresource across all sites, since the listener is registered for
// <all_urls> and filters by origin only after waking. `other` is in because a
// fetch relayed through a page's service worker lands there, not on
// xmlhttprequest — a login response would otherwise never be captured.
export const CAPTURE_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "xmlhttprequest",
  "other",
] as const;

const requestHeader = (
  name: string,
  value: string,
): Browser.declarativeNetRequest.ModifyHeaderInfo => ({
  operation: HEADER_SET,
  header: normalizeHeaderName(name),
  value,
});

const removeHeader = (name: string): Browser.declarativeNetRequest.ModifyHeaderInfo => ({
  operation: HEADER_REMOVE,
  header: normalizeHeaderName(name),
});

const buildRulesForCompiledRule = (rule: CompiledRule): Browser.declarativeNetRequest.Rule[] => {
  if (rule.headers.length === 0) return [];

  const reqHeaders = rule.headers.map((header) => requestHeader(header.name, header.value));

  const rules: Browser.declarativeNetRequest.Rule[] = [
    {
      id: originSetRuleId(rule.profileId, rule.originId),
      priority: SET_PRIORITY,
      action: {
        type: MODIFY_HEADERS,
        requestHeaders: reqHeaders,
      },
      condition: {
        regexFilter: createDnrOriginRegex(rule.origin),
        ...MATCH_SCOPE,
      },
    },
  ];

  const removeReqHeaders = rule.headers.map((header) => removeHeader(header.name));
  for (const path of rule.excludedPaths) {
    if (removeReqHeaders.length === 0) continue;
    rules.push({
      id: excludedPathRuleId(rule.profileId, rule.originId, path.id),
      priority: REMOVE_PRIORITY,
      action: {
        type: MODIFY_HEADERS,
        requestHeaders: removeReqHeaders,
      },
      condition: {
        regexFilter: createDnrExcludedPathRegex(rule.origin, path.pathGlob),
        ...MATCH_SCOPE,
      },
    });
  }

  return rules;
};

// Rule IDs are hashes, and more enabled profiles mean more chances of a collision,
// so uniqueness is resolved here — where the final ID can still be recorded against
// the profile that owns it (SessionState.dnrRuleIds).
const allocateRuleId = (preferred: number, used: Set<number>, warnings: string[]): number => {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }

  warnings.push(`Resolved duplicate DNR rule ID: ${preferred}`);
  let nextId = nextOwnedRuleId(preferred);
  while (used.has(nextId)) {
    nextId = nextOwnedRuleId(nextId);
    if (nextId === preferred) {
      throw new Error(`No available DNR rule IDs in owned range ${OWNED_MIN}-${OWNED_MAX}.`);
    }
  }
  used.add(nextId);
  return nextId;
};

// One Cookie SET rule per compiled cookie rule (per origin+URL region). The region
// key is included in the rule ID hash so different regions on the same origin get
// distinct IDs. Region "all" matches the whole origin; per-glob regions add a path
// filter and take priority 300 so they win over the base priority-200 rule.
const buildCookieRule = (
  compiledCookieRule: CompiledCookieRule,
): Browser.declarativeNetRequest.Rule => {
  const isBase = compiledCookieRule.urlRegionKey === "all";
  const glob = compiledCookieRule.excludedPathGlobs[0];
  const regex =
    isBase || !glob
      ? createDnrOriginRegex(compiledCookieRule.origin)
      : createDnrExcludedPathRegex(compiledCookieRule.origin, glob);
  return {
    id: cookieSetRuleId(compiledCookieRule.origin, compiledCookieRule.urlRegionKey),
    priority: isBase ? COOKIE_SET_BASE_PRIORITY : COOKIE_SET_REGION_PRIORITY,
    action: {
      type: MODIFY_HEADERS,
      requestHeaders: [
        {
          operation: HEADER_SET,
          header: COOKIE_HEADER_NAME,
          value: compiledCookieRule.cookieHeaderValue,
        },
      ],
    },
    condition: {
      regexFilter: regex,
      ...MATCH_SCOPE,
    },
  };
};

// Pure transform of the compiler output: no matching, validation or conflict logic
// lives here. A compiled config with errors produces no rules at all.
export const buildDnrRules = (compiled: CompiledConfig): HeaderRuleBuildResult => {
  const rules: Browser.declarativeNetRequest.Rule[] = [];
  const ruleIdsByProfile: Record<string, number[]> = {};
  const warnings: string[] = [];

  if (compiled.errors.length > 0) return { rules, ruleIdsByProfile, warnings };

  const used = new Set<number>();
  for (const compiledRule of compiled.rules) {
    for (const rule of buildRulesForCompiledRule(compiledRule)) {
      const id = allocateRuleId(rule.id, used, warnings);
      rules.push({ ...rule, id });
      ruleIdsByProfile[compiledRule.profileId] = [
        ...(ruleIdsByProfile[compiledRule.profileId] ?? []),
        id,
      ];
    }
  }

  for (const cookieRule of compiled.cookieRules) {
    const raw = buildCookieRule(cookieRule);
    const id = allocateRuleId(raw.id, used, warnings);
    rules.push({ ...raw, id });
    // Cookie rules are attributed to every contributing profile so a per-profile
    // clear/status still knows the rule exists (rule-sync uses ruleIdsByProfile).
    for (const profileId of cookieRule.contributingProfileIds) {
      ruleIdsByProfile[profileId] = [...(ruleIdsByProfile[profileId] ?? []), id];
    }
  }

  return { rules, ruleIdsByProfile, warnings };
};
