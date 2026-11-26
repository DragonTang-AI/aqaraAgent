# Generated H5 output contract

Optional PC canvas workspaces and the clean App export follow [canvas-preview-contract.md](canvas-preview-contract.md). This file governs the production runtime only.

See [three-tab-contract.md](three-tab-contract.md) for the configurable navigation and directory behavior.

## Required root files

In addition to the files below, include `tabs.css`, `studio-tabs-runtime.js`, `studio-tabs.js`, `favorite-scenes.js`, `space-control.js`, and `favorite-devices.js` (16 production root files in total).

```text
<package>/
├── index.html          Entry point discovered by Life local-plugin loading
├── config.js           Non-secret runtime feature and presentation config
├── life-bridge.js      Native bridge adapter and callback registry
├── camera-webrtc-readiness.js  ICE/media readiness gates
├── camera-session-provider.js  Capability-gated native signaling adapter
├── camera-webrtc-runtime.js    Single-session WebRTC client and cleanup
├── i18n.js             zh-CN / zh-TW / English messages and locale switching
├── studio-runtime.js   Studio OpenAPI operations and domain normalization
├── dashboard.js        Dashboard rendering and user interactions
├── styles.css          Local responsive light/dark styling
└── server.py           Optional local static preview server
```

Additional local images or fonts are allowed when necessary, but `index.html` must not reference a CDN or an absolute filesystem path. The generated package needs no `node_modules`, build output step, package manager, or network download.

Every JavaScript asset loaded by the generated package, including capability-gated camera and optional tab modules, must parse and run on Chromium 74. Functional CSS must provide Chromium 74 layout, focus, text-wrapping, sizing, spacing, navigation, and responsive media fallbacks; newer glass or visual effects may enhance modern hosts only after a complete usable fallback. Node-only generator, validator, profiler, and maintenance scripts are outside this WebView syntax target.

This directory is the deliverable. The skill does not wrap it in another folder or create a zip. A later marketplace publishing step may zip either these root contents or this single folder; the current Life H5 extraction path accepts both, but the installed root must ultimately expose this `index.html`.

## Runtime states

Rich-card S/M/L/XL, optimistic trait, sheet and grid-pagination states apply to space mode. Favorite mode instead follows [favorite-devices-contract.md](favorite-devices-contract.md); both modes retain shared Studio/bridge/preview states.

The dashboard must visibly support:

- boot/loading;
- connected with real rooms, devices, and executable scenes;
- connected but empty;
- bridge unavailable;
- Studio session/request failure;
- direct device and scene action without a confirmation dialog;
- exact-control optimistic/busy state until the write response;
- accepted write followed by one delayed, targeted trait readback without collection refresh; a matching value is silent and visually unchanged, while mismatch corrects only that control;
- cache-first display with cached controls disabled;
- pull-to-refresh that requests current Studio data;
- first backend device page on the blocking initial/refresh path, followed after first paint by an optional bounded overview catalog plus sequential definition batches that mount no cards;
- explicit load-more that appends one visible page and reuses ready/in-flight overview models without duplicate requests;
- real temperature, humidity, and occupied-space overview values with strict capability allowlists, space-balanced aggregation, and visible indexed/total coverage or partial/unavailable status;
- partial loaded/total counts while later pages remain available;
- stable viewport anchors across category changes, UI-page append, optimistic device updates, rollback, and delayed readback;
- category grids that release temporary anti-clamping height after layout, shrink to the actual rendered cards, and keep a visible load-more control directly after the last card rather than after retained blank space;
- zero-jump category switch/back, device-details sheet open/close, scene execution, rendered-content refresh, and host-language change;
- compact non-light Aqara S cards with no metric block and M cards with at most one metric, while all residual safe capabilities remain available in the device-details sheet;
- a card-surface details action with no visible “真实能力” footer, plus an adaptive modal bottom sheet that leaves S/M/L/XL occupancy and neighboring-card geometry unchanged, excludes nested controls from the trigger, and issues zero requests;
- card-local device reconciliation: matching readback, mismatch, and rollback all update the existing operated card in place, and sibling card nodes remain unchanged;
- range preview during drag with zero requests, followed by one release commit and one delayed targeted readback;
- definite write failure with one immediate targeted read, exact-control correction or last-confirmed fallback, and retry initiated only by the user;
- light and dark host themes;
- explicit last-successful-collection-refresh freshness text; push-updated values do not advance that timestamp or imply complete realtime coverage;
- long localized names and large-text layouts without clipping critical controls;
- visible focus, 44×44px touch targets, safe areas, and reduced-motion behavior.
- the same production code path using `LifeBridge` on iOS and Android, without platform-specific calls in dashboard/runtime code;
- one semantic `main` landmark without a fixed skip link overlay in this three-tab embedded layout.
- definition-confirmed camera live view with stable XL geometry, clear idle/connecting/live/paused/failure states, pause/continue, and safe unavailable degradation on hosts without the native capability.
- All Home space-light cards use two-column M with independent real power and lazy brightness/color-temperature Adjust sheet; no capability-driven full-row promotion;
- Explicit light Adjust is available across roles without bypassing card-body detail policy; preserve favorite and Space-control independence;
- Aqara XL light cards using a large light icon plus only the returned, safely renderable vertical controls;
- Aqara XL vertical controls using a clipped visual track/fill/thumb beneath the transparent native range input, with no painted fill outside the pill on iOS WKWebView and no half-clipped thumb at either range endpoint;
- the shared separate one-line32px/44px Studio title below the navigation row, a curtain L card with exactly one full-width position range in its functional slot, and residual details kept outside the card grid;
- the accepted compact XL light adaptation at the 390px profile: about 220px minimum height, full grid width with both edges aligned, 84px hero, 108px vertical tracks, and `grid-row: span 3`, with the ordinary next-card gap (10px at 390px and 8px at the compact breakpoint);
- structured object/array/map readings retained in normalization but absent from generic metrics, residual capability counts, and card-size selection until a reviewed renderer exists;
- distinct off and offline visuals across every device category: both use the documented dark Aqara H5 `#2C2B38` inactive surface instead of a white block; off keeps full content opacity, while offline uses explicit text plus 40% content opacity. Official `bg/abnormal` remains available as a source token, and online, action, slider and border tokens remain unchanged.

## Real-binding definition

“Bound to real Studio data” means all displayed runtime entity IDs and control coordinates come from responses obtained after the page starts:

- devices: paginated `GET /devices`;
- spaces: `GET /spaces`;
- device capability/value definitions: public `GET /devices/definitions` for the returned device IDs;
- executable scenes: `GET /scenes`;
- device writes: `POST /devices/trait/execute` using a returned writable trait, or `POST /devices/command/execute` for an explicitly allowlisted returned zero-field command;
- trait readback: one delayed `POST /devices/trait/read` for the exact submitted trait;
- scene writes: `POST /scenes/execute` using returned sceneId, or legacy `/automations/manual-triggers/execute` only for an entry without sceneId and with both manual coordinates; see [favorite-scenes-contract.md](favorite-scenes-contract.md).
- camera live: exact returned WebRTC protocol points projected as `cameraStream`, then independently revalidated and executed by the optional iOS native camera bridge; never by the generic H5 command path.

Generated config may contain pagination, batching, cache-TTL, and presentation rules. It must not contain captured Studio response bodies or physical IDs.

When opened as a Life device plugin, the host may add `did` to the entry URL. This builder always uses `scope: "studio"`, keeps the full three-tab interface, and lets the home dashboard prioritize that runtime device.

## Acceptance checks

Run:

```bash
node <skill>/scripts/validate_h5.mjs <package>
python3 <package>/server.py --port 4173
node <skill>/scripts/profile_h5.mjs <package> --platform ios [browser options]
node <skill>/scripts/profile_h5.mjs <package> --platform android [browser options]
```

Then inspect the page at representative phone, landscape, and tablet widths, including a 360px Android-class viewport. The validator must fail on external assets, missing local references, syntax errors, credential-looking config, demo/mock runtime fallbacks, direct platform transport access outside `life-bridge.js`, internal/legacy Studio operations, second-confirmation UI, missing pagination/cache/i18n/control operations, control-triggered collection refresh, service workers, CSS multi-column masonry, missing core mobile accessibility tokens/states, or browser features incompatible with the supported host snapshots. The smoke test additionally enforces the iOS native-message and Android method-preserving prompt envelopes, request-count, typed-value, failure-list, and targeted-readback behavior. Run browser QA through both platform fixtures; it must exercise range drag/release, semantic scroll anchors, repeated whole-home↔individual-space switches, card-surface details open/close, nested-control exclusion, modal focus/scroll restoration, load-more placement, a real-shaped curtain range fixture, and camera-style structured readings because static checks cannot prove event ordering, placement, or WebView layout settlement. Assert zero sheet requests, unchanged card/neighbor rectangles, no visible capability footer, and unchanged S whole-card-switch request counts. After the settled frames, assert that the grid has no retained `min-height`, its rectangle ends at the actual last card, and a visible load-more control follows at the normal margin.

Clean deliverable: generated packages must contain only the H5 runtime and documented packaging assets. Store QA screenshots, test reports, logs, fixtures and profiling results outside the package directory (including descendants). Use a separate caller-selected QA directory. Both browser profilers reject screenshot destinations inside the package; validate_h5 rejects known QA directories and verification artifacts. Never copy QA output back into the deliverable.

## Theme-independent UI

All styles retain the Aqara UI profile; `style` changes paint tokens only. Follow [theme-skin-contract.md](theme-skin-contract.md) for built-in/custom light/dark skins and shared validation.

Home favorite scenes follow [favorite-scenes-contract.md](favorite-scenes-contract.md); ship favorite-scenes.js and the three local Figma-derived assets in the production inventory. All themes use the same selection and execution semantics.

Home Space control follows space-control-contract.md. Production inventory includes space-control.js and local category/control/device SVGs. Preview transport/scenarios supply representative type/capability data; production never includes these fixtures.

Home header: no branding eyebrow; use the bridge-provided real Studio name and committed connection status. Configured titles/root space names and successful API requests do not override native identity or connection. Missing host support stays unknown. See life-bridge-contract.md.

Production output and bundled runtime assets must contain no PNG files, PNG URLs or embedded `data:image/png` content. Use reviewed pure SVG/CSS equivalents for icons and loading feedback; wrapping a raster inside SVG does not satisfy this rule. QA screenshots may use PNG only in the caller-owned external verification directory, never inside the skill or generated packages. Runtime and preview validators enforce this boundary.
