# Device pairing entry

## Role and configuration

`config.enableDevicePairing` is an optional Boolean (missing means false), resolved by `--enable-device-pairing true|false`. Male-role generation defaults true; female/senior/child/generic generation defaults false. Explicit user choices override role defaults, except `--read-only` always disables pairing. Role changes recalculate inherited defaults; preserve separately confirmed choices. Theme-only or layout-only edits preserve the current value. This is UI policy, not account authorization.

Only an existing Devices tab renders one localized Add device plus-icon button at its top trailing edge (44px minimum; 48px for senior if explicitly enabled). No Devices tab means no entry and no pairing subscriptions or calls. Do not create a tab or a Home shortcut automatically. Do not place pairing in favorite selection, device plugin controls or Smart. Keep search, space/type/offline filters, counts and cards unchanged. Use existing theme text/action tokens in light/dark mode.

## Host contract

`LifeBridge.openAddDevice()` requires explicit `openAddDevice` advertisement and an available transport. Invoke action `openAddDevice` with only unique onSuccess/onFailed callback names; no URL, host, Studio ID, device ID, account, credentials or network configuration are accepted from H5. Require `{code:0,data:{accepted:true}}`; reject missing/rejected ack, failure callback and 8-second timeout. Disable the button in flight, expose aria-busy and restore on every settlement. Never auto-retry ambiguous navigation; show localized unsupported/failure guidance. Acceptance proves page navigation, not successful pairing.

Maintained iOS integration advertises through the common nativeContextConfiguration used by legacy URL/local WebViewController and new Application UI WebView. Both use the same LMAqaraLifeAccessNetWebAdapter custom-method handler, with account epoch, reauthentication and Studio lease guards. The shared native router reuses the RN OpenAddDevicePage path: resolve current active endpoint scheme/host, build discover-device launchOptions with from=app, action=startPairing, platform/appVersion/appBuild, snapshot cloud UGW before pairing and push an SDK WebView with system navigation hidden. No second URL builder in H5. Failed context, missing endpoint/navigation or transition conflict must not acknowledge acceptance. Android requires a separately implemented and advertised handler; do not assume support from the generic transport tests.

## Return lifecycle and request budget

For an accepted opening, use the optional document-scoped getCurrentPageVisibility / PageVisibilityChanged to observe this page becoming hidden and then visible. Refresh only the Devices directory once on return, preserving keyword/space/offline/type filters. No refresh at navigation ack, no polling, no Home/Smart/favorite reload and no guessed successful device addition. Returning after cancellation can perform the same bounded list refresh. Cancel the per-opening listener on failure, return, document pagehide, scope change or a superseding opening. Late old-scope responses cannot refresh the new scope. If visibility is unsupported, retain manual pull-refresh; do not infer return from focus or timers.

## Preview and gates

The isolated host advertises a simulated openAddDevice and presents a localized dialog labeled simulated. It never scans, pairs, creates a device or calls a real service. Simulate parent hidden/visible around the dialog, restore focus and scrolling, and report operation kind device-pairing. Exclude preview/QA from App exports.

Run role smoke gates (defaults/override/read-only/invalid Boolean), `smoke_test_h5.mjs <runtime> --native-entry-only` (two transports, no payload parameters, callbacks/timeouts/gating), and `profile_device_pairing.mjs <workspace>` with existing browser/module options. Browser review covers role/no-tab policy, absent capability, accepted/rejected navigation, duplicate clicks, localized accessible action geometry, simulated dialog isolation and one Devices-only return refresh retaining current filters. Run existing directory-space and AI gates on the modified product. Native build, actual pairing and both real WebView entrances remain user verification.
