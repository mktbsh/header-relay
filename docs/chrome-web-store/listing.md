# Chrome Web Store Listing Draft

Use this file as the source text for the Chrome Web Store Developer Dashboard.

## Product Details

### Name

Header Relay — HTTP Request Header Modifier & Response Header Capture

### Summary

Capture HTTP response headers and relay fixed or captured request headers for API development and testing.

### Category

Developer Tools

### Language

English

### Detailed Description

Header Relay helps developers verify browser-based HTTP request behavior when an API or web app depends on custom headers, gateway headers, session tokens, trace IDs, or environment-specific request metadata.

Create a profile, choose target origins, configure fixed request headers, and list response headers to capture. When a matching response includes a configured captured header, Header Relay keeps that value in memory for the current browser session and uses Chrome declarativeNetRequest session rules to attach it to later matching requests.

Main features:

- Origin-scoped header relay for local, staging, internal, and test environments.
- Fixed request headers for values that should always be attached.
- Captured response headers for values such as session tokens, trace IDs, or gateway headers.
- Excluded path glob patterns for assets or endpoints that should not receive relay-managed headers.
- Excluded-path tester for checking glob matching rules before saving.
- URL Probe to check whether a URL is matched, excluded, and which headers would be attached — works on unsaved drafts.
- Full-page settings with section-based navigation for profiles, origins, headers, excluded paths, URL Probe, and audit logs.
- Multiple profiles can stay enabled at once, while individual profiles can be deleted when no longer needed.
- Comfortable and compact display modes shared by the popup and settings page.
- iOS-style UI across popup and settings for a consistent, native feel.
- Compact popup status view for active headers, captured values, session state, and DNR rule count.
- Local audit logs with automatic retention; request URLs are never persisted.
- Japanese, Korean, Spanish, French, German, Simplified Chinese, and Traditional Chinese localization.

Privacy and security:

- Header Relay does not send profile settings, audit logs, usage events, analytics identifiers, browsing data, or captured headers to the developer, analytics providers, or unrelated servers. Configured header values are attached only to matching Target Origins.
- Captured values are kept only in in-memory session storage, cleared on browser restart, extension disable/reload/update, profile disable, rule changes, host-access revocation, or manual clear, and shown verbatim in the UI so developers can inspect them.
- Sensitive header names show a warning. `Cookie` remains available for development workflows with an explicit browser-state warning; response-only and transport-owned headers are rejected.
- Audit logs do not persist request URLs: URLs are processed in memory for origin matching only and discarded when the browser closes.
- HTTP localhost access is included for the default local-development workflow. Every other host is requested only when you add its Target Origin and optional access can be revoked anytime from Chrome's extension settings.

This extension is intended for developers and QA workflows. Do not use it to store production credentials unless that is acceptable for your local browser profile.

Version 0.5.0 — added per-origin host permissions, session-only captured values, sensitive-header safeguards, removable profiles, compact display settings, and diagnostic-only audit logs.

## Privacy Tab

### Single Purpose

Header Relay captures configured HTTP response header values from developer-selected target origins and relays fixed or captured request headers to later matching browser requests for API development and testing.

### Data Handling Summary

Header Relay stores profile settings, target origins, fixed header values, capture header names, extension preferences, and a randomly generated analytics client identifier locally in Chrome extension storage. Captured response header values and runtime session state stay only in in-memory session storage; diagnostic audit logs use IndexedDB without header values or persistent request URLs. Production builds do not emit analytics events, and neither usage events nor the analytics identifier are transmitted externally. The extension does not sell or share this data, use it for advertising, or allow the developer to read it. Configured header values are sent only as part of matching requests opened by the user.

### Data Categories To Consider In The Dashboard

- Authentication information: captured header values may contain development session tokens. Values are held in memory for the browser session only, shown only inside the extension UI, and never written to audit logs. Keep declared.
- Web browsing activity: not collected. Request URLs are used in memory only for Target Origin matching and are never stored in IndexedDB or extension storage. Version 0.5.0, which removed URL persistence, has passed Chrome Web Store review and is live, so declare this category as not collected.
- User activity: keep declared because the extension observes response headers via webRequest for user-selected target origins (a form of network monitoring). Processing is on-device only. Production builds emit no usage analytics; local development builds log only the typed, non-sensitive events described in `docs/analytics.md` to the Service Worker console. No clicks, scrolls, keystrokes, or free-form user-operation history are recorded, and audit logs contain diagnostic events only.

If the dashboard asks whether this data is collected, answer according to Chrome's current wording. The implementation stores these values locally only and does not transmit them to the developer or third parties. The per-category rationale, the full data inventory, and the exact conditions for changing a declaration are recorded in `docs/chrome-web-store/privacy-declaration.md` — update that file whenever the implementation or the dashboard wording changes.

## Permission Justifications

### storage

Stores profiles, target origins, fixed headers, capture header names, extension preferences, and the local analytics client identifier. Captured values and runtime state use Chrome's in-memory session storage only.

### webRequest

Observes response headers for enabled target origins so configured header names can be captured into the local session.

### declarativeNetRequest

Creates session-scoped rules that attach fixed or captured request headers to matching target origins and remove relay-managed headers from excluded paths.

### declarativeNetRequestWithHostAccess

Allows the extension's declarativeNetRequest session rules to modify request headers for host permissions used by enabled profiles.

### optional host permissions: `http://*/*`, `https://*/*`

Declared as optional so developers can use the extension with any loopback IP, staging, internal, or test origin. When a Target Origin is added, the extension requests access to that specific host from a user gesture; capture, header attachment, and DNR rules run only for origins with access. Revoking an optional grant stops the relay and clears captured values for affected profiles.

### required host permission: `http://localhost/*`

Included for the default localhost development workflow. Chrome match patterns cannot restrict a grant to one port, but capture and attachment remain limited to enabled Target Origins configured by the user.

## Graphic Assets

Generated assets live in `docs/chrome-web-store/assets/`.

- Screenshots are captured from the real extension via Playwright (`playwright test --config=playwright.store-assets.config.ts`, see `e2e/store-assets.spec.ts`): `screenshot-01-overview.png`, `screenshot-02-popup.png`, `screenshot-03-url-probe.png`, `screenshot-04-headers.png`, `screenshot-05-i18n-privacy.png`
- Localized screenshots (for CWS locale-specific listings) cover all five shots in each locale, suffixed `-ja` / `-ko`: `screenshot-01-overview-ja.png` … `screenshot-05-i18n-privacy-ja.png`, and the same for `-ko`
- Store icon and promo tiles are generated by `node scripts/create-store-promo-tiles.mjs`: `store-icon-128.png`, `small-promo-tile-440x280.png` (required), `marquee-promo-tile-1400x560.png` (optional)
- Run both steps together with `pnpm store:assets`.

## URLs

Homepage URL: use the public repository URL or a published project page.

Support URL: use the repository issues page or a dedicated support page.

Privacy Policy URL: publish `PRIVACY.md` at a stable public URL, such as the repository page or project site.
