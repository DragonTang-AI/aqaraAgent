# Compatibility matrix

This matrix describes Builder contract version `2026.11.03.2`. It is a release snapshot, not a promise that an arbitrary newer host or API behaves identically.

| Surface | Supported snapshot | Builder behavior |
|---|---|---|
| Life iOS WebView | iOS 15.1 baseline; local `WKWebView.loadFileURL` package | Relative local assets, `viewport-fit=cover`, H5-owned safe areas |
| Life Android WebView | Chromium 74 minimum; Android `window.prompt(method, paramsJson)` bridge; Android UA/touch browser profile | Every loaded runtime script, including optional camera and tab modules, parses on Chromium 74; startup, localization, Studio data, tab navigation/search, supported controls, and capability-gated degradation remain functional; layout remains valid with zero or nonzero safe-area values and nonessential glass effects may fall back to opaque surfaces |
| Native bridge | iOS `nativeBridge`, Android `prompt`, `H5Invoke`, `nativeHttpRequest`, theme subscription, launch language | Bridge-first authenticated requests; capability-gated fallback only |
| Dashboard data changes | Optional Android/iOS host `subscribeDataChanges` / `unsubscribeDataChanges` and `DataChanged`; iOS source integration is present, native build and real-host verification pending | H5 registers up to 4096 exact watched Trait coordinates; native filters before WebView delivery; typed subscription ACK uses bounded Trait reconciliation, object events update one collection, true recovery uses coalesced Home refresh; untyped old hosts retain coalesced full refresh; device add/remove are outside the subscribed event set |
| Studio REST | `/open/api/v1` resource routes recorded in `studio-data-contract.md` | First-page progressive discovery, click-only next-page loading, per-page public definitions, exact typed writes |
| Configurable tabs | Home, space-grouped device summaries, scene and paginated automation directories | Independent lazy data modules, safe-area glass navigation, automation enable/disable switches |
| Device plugin navigation | Optional explicitly advertised `openDevicePlugin` | API device ID sent to host resolver; accepted acknowledgement, actual presentation needs live verification |
| Device capability UI | Boolean, explicit enum, bounded numeric, reviewed zero-field command, readable telemetry | Model-derived controls only; unsupported writes degrade to read-only |
| Aqara visual profile | `aqara-smart-home-card-design` 0.12.0 App profile; light category confirmed; reviewed task artifact form-factor adaptation | Semantic tokens and non-light S/M/L/XL anatomy; all Home lights use compact M with independent power and lazy Adjust sheet |
| Composite cards | Curtain position and thermostat/air-condition capability sets recorded in the data contract | Category-specific UI without guessed coordinates or options |
| Write reconciliation | One write, no retry; accepted write gets at most one delayed targeted read, definite failure gets one immediate targeted read | Exact control updated in place with per-control stale-read guard; no collection refresh |
| Scenes | Manual-trigger list and exact automation/trigger pair identifiers | Home generic/male/female server-backed0–10 favorites; senior/child isolated automatic max-six suitable scenes without editors or metadata; two-second request feedback; direct execution with no speculative readback; Smart full list remains independent |
| Camera live / realtime | iOS host advertises the four `cameraWebRTC*` methods and `onCameraWebRTCSignal`; Android camera bridge is not implemented in this release | Exact-definition Aqara Spec live view only; one native ICE configuration and one Offer per user attempt; definition-confirmed 40338 forwards local Trickle ICE after Answer/session binding, otherwise complete-Offer fallback; unsupported hosts fail closed |
| Camera ICE response | LAN versioned envelope and authenticated cloud `code/data/message` envelope | Validate server data and TURN credentials in both forms; validate optional metadata when supplied; retain `all` for host and relay candidates |
| Language/theme | `zh-CN`, `zh-TW`, English; light/dark | Launch values plus advertised host events; no unadvertised guarantee |
| Packaging | Dependency-free static H5 | No CDN, framework, bundler, service worker, remote font, or runtime install |

If a target environment falls outside this matrix, keep the current behavior fail-closed and route the requested compatibility change through the internal maintainer release workflow.

Automation enable/disable behavior follows the single maintained contract in [three-tab-contract.md](three-tab-contract.md).

Native Mine drawer: optional `openNavigationDrawer` capability and `{accepted:true}` acknowledgement; iOS registration is supplied in the maintained host implementation. Android must advertise and implement its equivalent before the entry succeeds. Unsupported hosts show localized feedback; canvas uses an isolated labeled simulation.

AI assistant entry: visible only after explicitly advertised `subscribeUserAIAgentStatus` returns or pushes `status:true`; missing/invalid status hides the entire section. `openAIAssistant` rechecks the switch before routing, and `aiAssistantInitialMessage` permits RN-compatible `content` questions. Role-aware suggestions use current Studio rooms and confirmed device capabilities/readings. Android and iOS host source integrations are present; iOS native build and real-host verification remain pending. Preview is a labeled local simulation. See [home-ai-assistant-contract.md](home-ai-assistant-contract.md).

Theme skins: `aqara`, `apple`, `ha`, and allowlisted `custom` light/dark colors share `uiProfile:aqara`, S/M/L/XL geometry and all operational rules. Legacy Apple generic tiles are no longer selected. See [theme-skin-contract.md](theme-skin-contract.md).

Space control: Home below devices; lighting/shading/climate share category details with overview. Home tabs are the union of spaces directly assigned to matching category devices; detail tabs use only the selected category's directly assigned spaces. Exact space ID selection excludes parent and empty spaces that have no direct matching device; unassigned appears last. Top-level sibling spaces remain selectable and count as active rooms when their directly assigned devices are on. IRDevice OnOff points contribute to climate only when the device advertises IRDevice and exposes that point. Independent Figma detail cards are the context-specific exception to Home card geometry. Exact public trait/command points, complete-index guard, per-item failures and targeted real state readback; no RN mock or private capabilities endpoint in production.

Home light XL aligns with full grid width; slider endpoint border follows theme, with visible horizontal/vertical focus. Existing control behavior unchanged.

Studio header: actual native Studio name and local/cloud/error/unknown state; explicitly advertised getter/subscription/event contract. iOS source integration added; native build pending user. Android status support conditional; unsupported stays unknown.

Generic/male/female Favorite Home mode: independent Figma 173×126 cards/editor, 0–10 actual endpoint IDs, RN-compatible metadata query/update in the current native user/Studio request context and exact public shortcuts. Uses existing native identity and plugin capabilities without new native code. The explicitly accepted RN known-key whole-map-save limitation is documented in favorite-metadata-contract.md. Default space mode keeps the prior rich cards/camera behavior. See [favorite-devices-contract.md](favorite-devices-contract.md).

Child Home startup: whole-home discovery and local room filtering by default, matching generic Home. Only explicit real-space restrictions enable scoped queries; unresolved named rooms use explicit manual selection. Local room-chip changes issue no requests. See [role-profiles-contract.md](role-profiles-contract.md). Senior and child default to Home only; explicit tabs override. Native/API upstream certification is unchanged.

Device pairing: optional advertised `openAddDevice`; male-role default only, explicit overrides and read-only/no-tab policies. iOS new/legacy entrances share host implementation; Android requires verified support. Preview is simulation only. See [device-pairing-contract.md](device-pairing-contract.md).

Shared Home header and senior sizing follow [home-header-layout-contract.md](home-header-layout-contract.md) and [senior-sizing-contract.md](senior-sizing-contract.md). Scene first-use display follows [daily-use-role-contract.md](daily-use-role-contract.md); saved metadata takes precedence only for service-backed roles; senior/child use isolated suitable-record projections with no metadata calls or add UI.

Senior/child automatic collections reuse existing catalogs and exact commands, no official dashboard favorites API or data. Senior devices cap3, suitable scenes cap6; child room/category filters are local. Partial bounded indexes render confirmed candidates without a full-home scan.
