# Chrome Web Store Reviewer Test Instructions

These instructions can be pasted into the Developer Dashboard Test instructions tab.

## Basic Verification

1. Install the extension from the uploaded package.
2. Open the extension popup and click Settings.
3. Confirm Compact can be changed in the Settings section.
4. Open Overview from the sidebar, then keep the default profile or create a new profile.
5. Confirm the default Target Origins are `http://localhost:3000` and `http://127.0.0.1:3000`.
6. Open Headers, add the Fixed Header `x-client-id: header-relay`, and save it.
7. On the same page, add the Captured Header `x-session-token`, and save it.
8. Use URL Probe with `http://localhost:3000/api/me`. It should report the URL as allowed and show the configured request headers that would be attached.

## Optional Local Capture Test

If you want to verify header capture end-to-end, start a local test server before using the extension:

```bash
node -e "require('http').createServer((req,res)=>{res.setHeader('x-session-token','review-token');res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,path:req.url}))}).listen(3000,()=>console.log('listening on http://localhost:3000'))"
```

Then:

1. Enable the default profile in Header Relay.
2. Visit `http://localhost:3000/api/me`.
3. Open the extension popup.
4. Confirm the session changes to captured and `x-session-token` appears under captured values.
5. Open Headers to confirm the locally stored captured values, then open Settings > Audit Logs to confirm the recent capture event.
6. Click Clear captured values to reset the session.

## Privacy Notes

The extension does not require reviewer credentials. Captured header values stay in in-memory session storage and are shown verbatim only inside the extension UI. Profile settings, diagnostic audit logs, and the analytics client identifier remain in the local browser profile and are not transmitted to the developer, analytics providers, or unrelated servers. Configured header values are attached only to matching Target Origins. Production builds do not emit analytics events.
