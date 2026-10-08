# Header Relay Privacy Policy

Last updated: 2026-07-17

## Purpose

Header Relay is a Chrome extension for API development and testing. It helps developers check how browser-based HTTP requests behave when fixed or captured headers are attached.

## Host Permissions

The extension includes host access to `http://localhost/*` at install time for its default local-development workflow. Every other host permission is optional and requested when you add a Target Origin (Chrome match patterns cannot carry a port, so a grant covers every port on that host). Header capture and attachment are limited by the enabled profile's Target Origins and Excluded Paths. Revoking an optional grant stops capture and attachment immediately and clears captured values for affected profiles.

## Data Stored Locally

Profiles, Target Origins, Fixed Header names and values, Capture Header names, and a randomly generated UUID v7 analytics client identifier are stored in this extension's local browser storage. Profile settings remain until you change or remove them; the analytics identifier remains until you uninstall the extension. Captured header values and runtime session state are kept only in in-memory session storage and are cleared when Chrome restarts, the extension is disabled, reloaded, or updated, the profile is disabled, its relay rules change, its optional host access is revoked, or you choose Clear captured values. Diagnostic audit logs are stored in IndexedDB, without header values or persistent request URLs. Captured header values are masked by default in the management UI; you can reveal or copy a value with an explicit action.

Header Relay warns before using credential-bearing headers, including `Authorization`, `Cookie`, and common token/API-key names. `Cookie` remains available for development workflows but can conflict with Chrome's cookie store and authentication state. Response-only, request-authority, message-framing, proxy, and connection-specific headers that cannot be relayed safely are rejected.

## Limited Use Disclosure

Header Relay uses browser permissions and locally stored data only to provide and improve its single purpose: capturing configured HTTP response header values and relaying configured request headers for developer-selected target origins. The extension does not use this data for advertising, creditworthiness, lending, or unrelated purposes.

## Data Sharing

The extension does not transmit profile settings, audit logs, usage events, analytics client identifiers, browsing data, or captured headers to the developer, analytics providers, or unrelated servers. Configured header values are transmitted only as part of matching requests to the Target Origins you selected.

## No Human Access

The developer does not receive, inspect, sell, or share your profile settings, captured header values, audit logs, usage events, analytics client identifiers, or browsing activity. Locally stored copies remain in the Chrome profile unless you export or disclose them; configured header values are disclosed only to matching Target Origins.

## No External Analytics or Telemetry

Production builds of Header Relay disable analytics tracking. They create the local analytics client identifier, but do not emit usage events or write analytics events to the service worker console.

Local development builds started with `pnpm dev` emit a limited set of typed usage events to the extension's service worker, which adds the local analytics client identifier and writes the event to the service worker's developer console. These console events are not persisted by the extension, are not transmitted externally, and never include profile identifiers or names, URLs, origins, paths, header names, header values, or other user-entered text.

External analytics may be added in a future release. Such a release will update this policy and the Chrome Web Store privacy disclosures before transmitting analytics data outside the device.

## Audit Log Retention

Audit logs are capped at the 1000 most recent entries and entries older than 7 days are removed automatically. Audit logs do not store request URLs: URLs are used in memory to decide whether a request matches your configured Target Origins, shown next to recent audit entries only for the current browser session (query strings and fragments removed), and discarded when the browser closes. No visited URL, origin, or pathname is written to IndexedDB or persistent extension storage. You can remove all audit logs at any time with Clear logs in the Audit Logs section of the management screen.

## User Control

You can disable a profile, remove target origins, clear captured values, revoke host access, or uninstall the extension to stop capture and attachment behavior. Disabling a profile clears its captured values; Clear captured values keeps the profile and header settings intact.
