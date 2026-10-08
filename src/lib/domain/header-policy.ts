export type HeaderPolicyLevel = "allowed" | "sensitive" | "blocked";

export type HeaderPolicyReason =
  | "credentials"
  | "browser-cookie-state"
  | "response-only"
  | "request-authority"
  | "message-framing"
  | "connection-specific";

export type HeaderPolicy = {
  normalizedName: string;
  level: HeaderPolicyLevel;
  reason?: HeaderPolicyReason;
};

export const normalizeHeaderName = (name: string): string => name.trim().toLowerCase();

const SENSITIVE_HEADERS: Readonly<Record<string, HeaderPolicyReason>> = {
  authorization: "credentials",
  cookie: "browser-cookie-state",
  "x-auth-token": "credentials",
  "x-access-token": "credentials",
  "x-api-key": "credentials",
  "api-key": "credentials",
};

const REQUEST_BLOCKED: Readonly<Record<string, HeaderPolicyReason>> = {
  "set-cookie": "response-only",
  host: "request-authority",
  "content-length": "message-framing",
  connection: "connection-specific",
  "keep-alive": "connection-specific",
  "proxy-connection": "connection-specific",
  "proxy-authenticate": "connection-specific",
  "proxy-authorization": "connection-specific",
  te: "connection-specific",
  trailer: "connection-specific",
  "transfer-encoding": "connection-specific",
  upgrade: "connection-specific",
};

export const classifyHeaderName = (name: string): HeaderPolicy => {
  const normalizedName = normalizeHeaderName(name);
  const blockedReason = REQUEST_BLOCKED[normalizedName];
  if (blockedReason) return { normalizedName, level: "blocked", reason: blockedReason };
  const sensitiveReason = SENSITIVE_HEADERS[normalizedName];
  if (sensitiveReason) {
    return { normalizedName, level: "sensitive", reason: sensitiveReason };
  }
  return { normalizedName, level: "allowed" };
};
