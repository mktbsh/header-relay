import type { CapturedHeaderValue, Profile, SessionState } from "../domain/types";
export { normalizeHeaderName } from "../domain/header-policy";
import { normalizeHeaderName } from "../domain/header-policy";

export type PlannedHeader = {
  name: string;
  value: string;
  source: "fixed" | "captured";
};

export type HeaderPlan = {
  attachHeaders: PlannedHeader[];
  fixedHeaderNames: string[];
  capturedHeaderNames: string[];
};

export type CaptureResponseHeadersInput = {
  profile: Profile;
  session: SessionState;
  responseHeaders?: Browser.webRequest.HttpHeader[];
  now: number;
};

export type CaptureResponseHeadersResult = {
  session: SessionState;
  capturedNames: string[];
};

// Sessions are stored per profile, so a session always belongs to the profile it is
// read for; no cross-profile guard is needed here.
type SessionHeaderSource = Pick<SessionState, "capturedHeaders"> | null | undefined;

const capturedHeadersOf = (session: SessionHeaderSource): Record<string, CapturedHeaderValue> =>
  session?.capturedHeaders ?? {};

// Returns rows newest-first.
export const selectCapturedRows = (session: SessionHeaderSource): CapturedHeaderValue[] =>
  Object.values(capturedHeadersOf(session)).sort((a, b) => b.capturedAt - a.capturedAt);

const findResponseHeader = (
  responseHeaders: Browser.webRequest.HttpHeader[] | undefined,
  name: string,
): string | undefined => {
  const normalizedName = normalizeHeaderName(name);
  const hit = (responseHeaders ?? []).find(
    (header) => normalizeHeaderName(header.name) === normalizedName,
  );
  return hit?.value;
};

export const createHeaderPlan = (profile: Profile, session?: SessionHeaderSource): HeaderPlan => {
  const fixedHeaders = profile.fixedHeaders
    .filter((header) => header.enabled)
    .map(
      (header): PlannedHeader => ({
        name: normalizeHeaderName(header.name),
        value: header.value,
        source: "fixed",
      }),
    );
  const fixedNames = new Set(fixedHeaders.map((header) => header.name));
  const sessionHeaders = capturedHeadersOf(session);
  const capturedHeaders = profile.captureHeaders
    .filter((header) => header.enabled)
    .map((header): PlannedHeader | undefined => {
      const name = normalizeHeaderName(header.name);
      const captured = sessionHeaders[name];
      if (!captured || fixedNames.has(name)) return undefined;
      return {
        name,
        value: captured.value,
        source: "captured" as const,
      };
    })
    .filter((header): header is PlannedHeader => Boolean(header));

  return {
    attachHeaders: [...fixedHeaders, ...capturedHeaders],
    fixedHeaderNames: fixedHeaders.map((header) => header.name),
    capturedHeaderNames: capturedHeaders.map((header) => header.name),
  };
};

export const captureResponseHeaders = ({
  profile,
  session,
  responseHeaders,
  now,
}: CaptureResponseHeadersInput): CaptureResponseHeadersResult => {
  const nextCaptured = { ...capturedHeadersOf(session) };
  const capturedNames: string[] = [];

  for (const header of profile.captureHeaders.filter((item) => item.enabled)) {
    const name = normalizeHeaderName(header.name);
    const value = findResponseHeader(responseHeaders, name);
    if (!value) continue;

    const existing = nextCaptured[name];
    if (existing && existing.value === value) continue;

    nextCaptured[name] = { name, value, capturedAt: now };
    capturedNames.push(name);
  }

  if (capturedNames.length === 0) {
    return { session, capturedNames };
  }

  return {
    session: {
      ...session,
      phase: "authenticated",
      capturedHeaders: nextCaptured,
      updatedAt: now,
    },
    capturedNames,
  };
};
