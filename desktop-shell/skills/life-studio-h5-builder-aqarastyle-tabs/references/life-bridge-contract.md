# Aqara Life WebView bridge contract

This reference is the self-contained Life bridge contract snapshot for Builder contract version `2026.10.15.8`. It is authoritative for ordinary generation and requires no iOS source checkout. The distributable [provenance.json](provenance.json) records only the verified source category and release date; detailed upstream locations and hashes remain in the internal maintainer package.

## Snapshot policy

- Generated packages implement this document and the bundled `life-bridge.js`; they do not discover, import, or inspect host application source.
- If a request needs a bridge capability not recorded here, fail closed and identify it as a contract-release request. Do not infer behavior from a caller's role or from an arbitrary local checkout.
- Repository-relative evidence is audit metadata, not a runtime dependency. Missing upstream repositories never degrade or alter ordinary generation.

## Invocation protocol

### iOS

The current iOS handler is `window.webkit.messageHandlers.nativeBridge`. Send:

```js
window.webkit.messageHandlers.nativeBridge.postMessage({
  action: "nativeHttpRequest",
  data: {
    url: "/open/api/v1/spaces",
    method: "GET",
    params: {},
    headers: { source: "studio" },
    modeType: "sdkMode",
    onSuccess: "uniqueCallbackName",
    onFailed: "uniqueFailureCallbackName"
  }
});
```

### Android

The current Android host intercepts `window.prompt(method, paramsJson)`. Send the bridge method as the prompt message and the method parameters as the serialized default value:

```js
window.prompt(
  "nativeHttpRequest",
  JSON.stringify({
    url: "/open/api/v1/spaces",
    method: "GET",
    params: {},
    headers: { source: "studio" },
    modeType: "sdkMode",
    onSuccess: "uniqueCallbackName",
    onFailed: "uniqueFailureCallbackName"
  })
);
```

The Android transport preserves the requested bridge method. A `nativeHttpRequest` invocation remains `nativeHttpRequest`, and a `queryTransfer` invocation remains `queryTransfer`; only the transport envelope differs from iOS.

Generated application code must not select these transports itself. Only the bundled `life-bridge.js` may inspect `window.webkit`, Android platform context/UA plus `window.prompt`, `invokeCSharpAction`, or `ReactNativeWebView`. `dashboard.js`, `studio-runtime.js`, and generated custom presentation code call `LifeBridge` so iOS and Android retain identical callbacks, timeout cleanup, request payloads, failure handling and action budgets. The synchronous return value of Android `prompt` is not an API response; completion still arrives through the named `H5Invoke` callback.

Native invokes H5 through `H5Invoke(callbackName, jsonString)`. The page therefore owns a global `H5Invoke` dispatcher and must clean up one-shot callbacks after completion or timeout.

Compatibility surfaces `window.invokeCSharpAction` and `window.ReactNativeWebView.postMessage` may be used only as fallbacks. Do not assume their existence proves a particular capability; prefer `window.__AQARA_NATIVE_CONTEXT__.capabilities` when present.

## Native context

At document start the host can inject immutable `window.__AQARA_NATIVE_CONTEXT__`, then dispatch `aqara:native-context-ready`. Current fields include host app, app/build versions, platform, bridge version, environment, capabilities, and native events. The host appends `themeMode` and `language` query parameters and emits `onThemeModeChanged` after subscription. Current source does not advertise `onLanguageChanged`: `syncLanguage` changes App language from H5, not the inverse. App-to-H5 language is therefore guaranteed on WebView load/reload; the template also listens for future `onLanguageChanged` and `aqara:language-changed` events without assuming they exist today.

## Relevant methods

- `getStudioAuthInfo`: returns the current Studio identity and credentials for a validated host. It requires the requested `host`; use only for explicit direct fetch fallback.
- `nativeHttpRequest`: delegates GET/POST/PUT/DELETE/PATCH to Life. Pass URL query values in `params` and a JSON object body in `data`; never embed a query string into `url`. Generated Studio dashboards set `headers.source` to `studio`; the Android host consumes this routing-only field, resolves the `/studio` OpenAPI path, and adds `x-studio-route: auto`. Life handles current Studio context, local-network permission, active primary/fallback endpoint, cloud pre-authentication, global headers, and network error normalization.
- `getThemeMode` / `subscribeThemeMode`: read and subscribe to host theme.
- `getAppAuthInfo`: app-level auth; not required for the Studio dashboard.
- `openStudioH5`, `openWebview`, `popWebViewPage`: navigation helpers; not required by the base dashboard.
- `cameraWebRTCPrepareLive`, `cameraWebRTCCreateSession`, `cameraWebRTCAddIceCandidate`, `cameraWebRTCCloseSession` and `onCameraWebRTCSignal`: optional iOS-only camera live contract for this release. Use only after capability advertisement and follow [camera-webrtc-live-contract.md](camera-webrtc-live-contract.md). Android does not advertise these methods yet.

The Life adapter exposes `accessToken`, `refreshToken`, `expiresIn`, `clientId`, `hostId`, and user fields from `getStudioAuthInfo`. Treat all of them as sensitive even if only the access token is normally used. Do not persist or display them.

The Android dashboard host owns system Back: it closes a visible H5 dialog or returns a secondary tab to Home through existing page controls, then checks WebView history, then delegates to the Activity. Generated H5 needs no separate Back script.

Preserve the DOM hooks used by that native handler: favorite-scene selection uses `.favorite-editor`, favorite-device selection uses `.fd-editor`, and each has a header Back button that closes the page. Other modal pages expose `role="dialog"`, `aria-modal="true"` and an Escape close action. The Home disclosure keeps `#overview-details[open]`; the Home tab keeps `#tab-home` with `aria-selected`. If these hooks change, update the Android handler in the same change before distributing a new H5 package.

## Local package behavior

Life local-plugin loading looks for `index.html` or `index.htm`, loads it with `loadFileURL`, and allows read access to the package root. Local packages get `file://` as an allowed bridge origin. Relative native requests are preferable because the Life host selects the active Studio base URL.

The current `LMAccessNetWebViewController` constrains WKWebView to all four controller edges and explicitly uses `webView.scrollView.contentInsetAdjustmentBehavior = .never`. Consequently the host does not inset H5 content away from the status bar, navigation overlap, home indicator, notch, or Dynamic Island. A generated local package must include `viewport-fit=cover` and consume all four CSS `safe-area-inset-*` values itself. In particular, a sticky header must use the top safe-area value as its sticky offset; initial container padding alone is insufficient because `top: 0` moves that header back under the sensor housing after scrolling.

Do not infer or hard-code 20/44/47/59px by iPhone model. CSS environment values follow rotation, display zoom, and host geometry. If a future host adds explicit safe-area values to native context, use them only as a documented fallback and prevent double application.

The same package must also tolerate Android WebView returning zero for one or all CSS safe-area environment values. Zero is a valid inset, not evidence that the bridge failed. Keep baseline content gutters and bottom spacing independent from the environment values, and verify an Android UA/touch profile in addition to the iOS transport profile. This browser fixture checks the maintained prompt envelope and responsive H5 behavior; it does not replace validation in the real Aqara Life Android WebView.

## Optional device plugin navigation

For the three-tab package, use the `openDevicePlugin` capability described in [three-tab-contract.md](three-tab-contract.md). A nonempty capability list missing the method is explicitly unsupported. An absent/empty list is unknown legacy metadata; attempt via the shared LifeBridge once and require its accepted reply. See the contract for late-context handling and host integration.

## Native Mine drawer (optional capability, 2026.10.13 addition)

Home includes a leading 44px icon button labeled 我的 / Me. Call `LifeBridge.openNavigationDrawer()` to send `action: "openNavigationDrawer"` with only the standard onSuccess/onFailed callbacks. Require an explicit `openNavigationDrawer` entry in nativeContext.capabilities even on legacy hosts whose generic supports() permits undeclared methods. No parameters, page URLs, account IDs or Studio HTTP requests are involved. Success is `{code:0,data:{accepted:true}}`; missing/false acknowledgement, error callback and the 8-second timeout are failures. Disable the button only for its own in-flight request, release it on every settlement, and show localized unsupported/error feedback. Do not disable this entry while Studio data loads or is unavailable. Keep the Home header height and title; omit the top-right refresh button on every role and theme. Devices/Smart keep their existing header policy.

The iOS host registers the custom method and dispatches on the main queue after checking its account epoch and Studio/context lease. Reuse the same MineViewController and LMSideDrawer as the RN OpenNavigationDrawerPage route. Reuse an attached drawer; for a standalone/pushed H5 page without one, lazily attach one to the visible H5 controller once. Open idempotently so repeated accepted calls never toggle it closed. Never open a drawer behind a pushed page on a distant navigation root. The H5 caller cannot select arbitrary native routes. An acknowledgement means the open transition was accepted, not that an animation or user session completed. Android support is conditional on equivalent native registration; a generic prompt transport alone is insufficient. Generation requires no App source checkout.

Canvas preview advertises this capability only through its isolated simulated host. It presents a clearly labeled local modal drawer and reports `operation` with `{kind:"navigation-drawer"}`; it has no real account data and does not simulate native profile/settings actions. Close/backdrop/Escape restore focus and scrolling. Mock UI stays in preview/ and is excluded from the App export.

## Native AI assistant (optional capability, 2026.10.14 addition)

Show the Home AI entry only after `subscribeUserAIAgentStatus` responds or pushes `status:true`. The subscription response is the initial snapshot; `UserAIAgentStatusUpdate` carries later changes, with no separate getter or unsubscribe method. Missing capability or invalid status hides the entry. Use `LifeBridge.openAIAssistant(content?)` only after explicit `openAIAssistant` advertisement. The optional question uses flat `content`, with the additional `aiAssistantInitialMessage` feature marker; empty content retains the original action. Native rechecks the switch before routing and returns `accepted:false,reason:"disabled",status:false` when off. Accepted acknowledgement, 8-second timeout, iOS RN-equivalent initial-question routing and isolated preview behavior are maintained in [home-ai-assistant-contract.md](home-ai-assistant-contract.md). Generation needs no App source. Android host implementation exists in AqaraLife; iOS page-owned status-subscription source integration is present, while native build and real-host verification remain pending.

## Studio header identity and connection (2026.10.14.6)

Home has no AQARA LIFE/STUDIO eyebrow above its title. The title uses the selected Studio's actual `studioName` from the native committed Studio context, never a configured “My Home” string or the root space name. Names are user data: render with textContent, truncate one line with full accessible title, and keep them unchanged across UI language changes. Until identity is available, use localized Current Studio. Generator title options remain package/document labels, not authority over the runtime Studio identity.

Explicit optional capabilities:

- `getCurrentStudioConnectStatus`: no parameters beyond normal callbacks; returns `{code:0,data:{studioDid,studioName,connectStatus,errorCode?}}`.
- `subscribeStudioConnectStatus`: same response with current snapshot; registers later `StudioConnectStatusUpdate` raw-payload events with those same fields.
- `unsubscribeStudioConnectStatus`: disposes native observers; `{code:0,data:{accepted:true}}`.
- Phone reachability is a separate optional capability. `getCurrentPhoneNetworkStatus` and `subscribePhoneNetworkStatus` return `{code:0,data:{status:"online"|"offline"|"unknown"}}`; the latter emits raw `PhoneNetworkStatusUpdate` payloads. `unsubscribePhoneNetworkStatus` stops the page-owned updates and returns `{code:0,data:{accepted:true}}`. Do not infer this value from Studio status or HTTP failure. See [phone-network-offline-contract.md](phone-network-offline-contract.md).

`connectStatus` is local/cloud/error. Inactive/expired/missing context uses unknown with empty identity/name and no error code. local means LAN route; cloud means remote route; error60101 is the native local-certificate error, error60102 means native availability failure. Preserve numeric error codes; omit them after recovery. Do not infer route from host/IP, request success, cache, or browser reachability. Successful HTTP reads never replace a native error. Collection warnings/fatal data errors remain in their existing notice/state UI, independent of this banner.

LifeBridge exposes getCurrentStudioConnectStatus and subscribeStudioConnectStatus(listener). Require explicit method advertisement even on legacy empty capability lists. Missing/malformed/failed status becomes unknown, with no fabricated local/cloud success or production mock fallback. Subscribe returns a disposer; prevent a delayed initial response from overwriting newer push state. Read once on visibility resume, resubscribe after BFCache restoration, dispose on pagehide, and do not poll. Header changes make zero Studio HTTP calls and do not rerender cards or alter control/camera state.

For local file packages, the Android host may provide native context after H5 startup. Keep one pending subscription that starts when `aqara:native-context-ready` advertises the status methods; remove that listener on disposal. An initial unknown before context injection is provisional and must not strand Studio-scoped favorites in loading.

## Optional data changes

Allow 35 seconds for the H5 subscription call because the shared native socket's subscription ACK may wait up to 30 seconds. Normal HTTP, control and camera deadlines remain unchanged.

An explicitly capable host advertises `subscribeDataChanges`, `unsubscribeDataChanges`, and `DataChanged`. H5 calls `subscribeDataChanges` with the committed `studioDid` and a bounded `watchedTraits` array of exact `{deviceId,endpointId,functionCode,traitCode}` coordinates derived from loaded device summaries and public definitions. An empty array subscribes to collection changes only. Repeating the same method for the same page atomically replaces its watch set; it does not create another Studio WebSocket connection. Missing/malformed arrays, mismatched Studio identity and lists over 4096 points are rejected. There is no public all-device H5 mode. The disposer calls `unsubscribeDataChanges`; native document replacement and view destruction also remove the page owner and observers.

On iOS, a page owns only its Trait interest in the shared Studio subscription store. Merge it with native device-name Traits and other H5 pages. The SDK has one device-or-Trait target: while an existing camera device-level owner is active, aggregate the camera IDs with every Trait owner's device IDs into the device target, then restore the exact Trait union when the camera owner leaves. Filter H5 delivery by each page's original exact point set and committed Studio, never by the broader transport target. Preserve the existing RN/raw push and camera dispatch paths. This is a host integration rule; ordinary skill generation never imports iOS source.

Subscription and unsubscription acknowledge `{code:0,data:{accepted:true}}`. The event is `{code:0,data:{studioDid,kind,items}}`: `kind:"device"` carries only matching `{deviceId,endpointId,functionCode,traitCode,value,time}` Trait changes, in batches of at most 200. `kind:"collections"` carries `items:[]` and, on updated iOS hosts, `reason:"subscriptionAck"|"sessionRecovery"|"object"`; object events additionally carry `collection:"spaces"|"scenes"`. An ACK denotes an interest-set change, not a changed collection. A scene-card write uses the existing H5 request completion path. Apply a point only when its `time` is newer than the previously accepted push for that point. No token, host URL, raw WebSocket envelope or unrelated object payload enters H5.

Bind after the committed Studio identity is known, reject events for any other `studioDid`, and cancel the old subscription when Studio changes or the document is destroyed. Accept a late native context advertisement, but require explicit capability names. Add newly discovered watch points after initial definitions, later pages, overview indexing or favorite resolution; unchanged sets issue no bridge request. Within one Studio document, do not remove already watched points merely because a full load temporarily clears the overview catalog. Clear the retained watch set on Studio identity change or document disposal. Keep the set bounded at 4096; when the bound would be exceeded, retain the existing set without claiming partial live coverage for new points. A device event updates only matching loaded definition points and their existing cards/space summaries; invalid or unknown values are ignored. A typed `subscriptionAck` during initial HTTP loading needs no further refresh; afterward, debounce and reconcile at most 24 mounted/current devices through bounded Trait reads, with a cooldown and no full collection load. Typed object events refresh only spaces or scenes, without toggling global Home busy state. A true `sessionRecovery` or untyped legacy collection event uses the existing coalesced full refresh gate. Queue these while Home is busy; reset pending work on Studio change or document disposal. Preserve the last complete overview display during a same-Studio quiet refresh until the replacement index arrives; never carry that display across Studio identity or Home-space changes. Intermediate overview-index `loading` publications must not overwrite the runtime snapshot or visible values; publish its final complete, partial or unavailable result. Scene updates with identical identity, title, enabled state and availability must retain existing card DOM and touch/feedback state. Keep explicit refresh, pull refresh, page return and Studio-scope changes independent of the native burst gate. During maintenance, run `scripts/smoke_test_dashboard_collection_gate.mjs <runtime>` alongside normal gates. Resume after a hidden page becomes visible. Never refresh all collections for each Trait event or claim device add/remove is live: the maintained Studio subscription does not expose those object event types. Old hosts keep initial and explicit refresh behavior; a legacy no-filter H5 call does not activate an all-device feed.

The iOS adapter projects name and RN-equivalent route/error status from one committed context, gated by the existing context lease/account epoch. It listens to context/route/access notifications and foreground resume; notification payloads are only signals, never status data. Dedupe unchanged snapshots, include rename changes, clear identity for expired pages, and release observers when the subscription/controller is disposed. The existing RN getter remains unchanged. Register all three methods and the event in the native context; no SDK or native project dependency changes are required. Android/native peers must implement this contract before advertising support; a generic transport is insufficient.

Canvas uses only its isolated preview host's `studioHeader` fixture metadata and clearly marked simulated status. Fixture identities start with mock-. Production exports contain no simulated status, names, or data. Browser/bridge checks cannot prove App compilation or native route transitions; native build and real status/name acceptance remain with the user.

## Optional per-page visibility

A capable host explicitly advertises `getCurrentPageVisibility` and native event `PageVisibilityChanged`. Getter and event carry `{documentId: string, sequence: nonnegative integer, visible: boolean}`. The identifier belongs to this WebView document; sequence increases on actual visible/hidden changes. The getter establishes an initial snapshot; ignore its ACK if a newer event arrived in flight. Deduplicate events, reject foreign document IDs and regressions, and dispose the listener when the document is destroyed. Do not confuse native navigation acceptance, focus or theme with a visibility transition.

Host implementation owns observers per WebView, forwards page appearance and app activity, and releases only that page’s observers on close. It must not reuse RN subscriber IDs, a global “current page” pointer, Studio status subscriptions or camera session lifecycle. SDK-created child pages require the same document-scoped behavior. Preview advertises the getter only in its simulated host; simulated visibility events are not real-device validation. Old hosts without this declared capability keep normal navigation and document visibility/BFCache fallback; absence of an actual return signal limits automatic refresh, with explicit pull refresh still available.

Space-device rendering reuses a mounted card only while its complete device/capability model is unchanged. Replace changed cards, remove cards leaving the active filter and reconcile order without clearing the grid. Remove loading and empty placeholders before inserting real cards; when the filtered list becomes empty, clear both DOM and mounted-card indexes. Stop only the affected camera stream for a removed, replaced or moved camera card; an unchanged stationary stream remains mounted. A quiet refresh restores write availability on retained cards after fresh data arrives. Close a capability sheet only if its owning card is removed or replaced. During maintenance run `scripts/smoke_test_space_device_reconcile.mjs <runtime>` to cover loading, pagination, filtering, empty states and camera retention.

## Device setup navigation

Optional explicitly advertised `LifeBridge.openAddDevice()` opens the RN-equivalent native-owned pairing route, with no H5 URL or account parameters. Shared legacy/new host integration, role defaults, acknowledgements and return behavior are defined in [device-pairing-contract.md](device-pairing-contract.md).

Home header presentation follows [home-header-layout-contract.md](home-header-layout-contract.md) for all roles/themes. This does not change the native identity/status payload, subscriptions or navigation bridge.
