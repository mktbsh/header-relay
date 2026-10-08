// Cookie name/value validation per RFC 6265bis (the current successor to RFC 6265).
// Names are case-sensitive: `SID` and `sid` are two different cookies. General HTTP
// header names live in header-policy.ts and are lowercased; do not share helpers
// between the two — the case rules differ.

// cookie-name = token (RFC 7230): 1*<any US-ASCII char except CTLs, separators>.
// The visible ASCII set 0x21..0x7E, minus separators, gives the token character class.
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// cookie-value = *cookie-octet / DQUOTE *cookie-octet DQUOTE
// cookie-octet = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
// (excludes CTLs, whitespace, DQUOTE, comma, semicolon, backslash)
const COOKIE_OCTET = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

export type CookieNameValidationError = "empty" | "invalid-char";
export type CookieValueValidationError = "invalid-char";

export type CookieNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: CookieNameValidationError };

export type CookieValueValidation =
  | { ok: true; value: string }
  | { ok: false; error: CookieValueValidationError };

export const validateCookieName = (raw: string): CookieNameValidation => {
  if (!raw) return { ok: false, error: "empty" };
  if (!COOKIE_NAME.test(raw)) return { ok: false, error: "invalid-char" };
  return { ok: true, value: raw };
};

const stripQuotes = (raw: string): string => {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
};

// Values are stored verbatim in Header Relay; quoting is not part of the stored value.
// The verbatim rule matches how general header values are kept (whitespace preserved),
// so what the user sees is what the browser gets.
export const validateCookieValue = (raw: string): CookieValueValidation => {
  const inner = stripQuotes(raw);
  if (!COOKIE_OCTET.test(inner)) return { ok: false, error: "invalid-char" };
  return { ok: true, value: raw };
};

export const cookieNameEquals = (a: string, b: string): boolean => a === b;

export const cookieNameErrorMessage = (error: CookieNameValidationError): string =>
  error === "empty" ? "cookie name is required" : "cookie name must be a valid RFC 6265 token";

export const cookieValueErrorMessage = (_error: CookieValueValidationError): string =>
  "cookie value contains characters not allowed by RFC 6265";
