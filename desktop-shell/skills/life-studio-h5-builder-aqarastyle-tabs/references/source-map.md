# Upstream source map

This maintenance-only map resolves logical source groups from caller-supplied repository roots. Paths are repository-relative and must never be rewritten as a maintainer's absolute checkout path in this skill.

## `lifeIos`

CLI option: `--life-ios-root`

- `AqaraLife/RN/Bridge/Target_LHRNDependency+Router.swift`
- `AqaraLife/StudioMode/Home/DashBoard/LMStudioHomeNativePageRouter.swift`
- `AqaraLife/StudioMode/AIChatHost/LMAIAgentHost.swift`
- `AqaraLife/StudioMode/WebPage/WebViewController.swift`
- `AqaraLife/StudioMode/WebPage/LMAqaraLifeAccessNetWebAdapter.swift`
- `AqaraLife/Common/Network/StudioWebSocket/LMStudioWebSocketEventDispatcher.swift`
- `AqaraLife/StudioMode/WebPage/SutdioService.swift`
- `Pods/LMAccessNetWebSDK/Sources/LMAccessNetWebSDK/Public/LMAccessNetH5Bridge.swift`
- `Pods/LMAccessNetWebSDK/Sources/LMAccessNetWebSDK/Public/LMWebProvisioningConfiguration.swift`
- `Pods/LMAccessNetWebSDK/Sources/LMAccessNetWebSDK/Web/LMAccessNetWebViewController+BridgeHost.swift`

Review this group for bridge actions and payloads, callback dispatch, host capability advertisement, authentication/routing delegation, theme/language behavior, local-file loading, safe-area ownership, and plugin WebView lifecycle.

## `studioDocs`

CLI option: `--studio-docs-root`

- `studio/openapi/openapi-AqaraLife.yaml`
- `studio/openapi/WebSocket订阅推送接入说明.md`
- `studio/openapi/asyncapi-AqaraLife-websocket.yaml`

Review this group for public resource routes, pagination, request/response schemas, value typing, public/internal endpoint status, batch limits, execution failure arrays, targeted reads, and realtime availability.

## `studioWebCamera`

CLI option: `--studio-web-root`

- `packages/stu-video-player/src/WebRtcSessionClient.ts`
- `packages/stu-video-player/src/webrtcReadiness.ts`
- `packages/stu-video-player/src/types.ts`
- `apps/aqara-sys/src/communication/platform/aqaraSpecWebRtcSessionProvider.ts`
- `apps/aqara-sys/src/communication/domain/camera/webRtcSignaling.ts`

Review this group for request/session identity separation, Aqara Spec field numbering, live stream usage, ICE/profile behavior, media readiness, pending-only polling, remote ICE/End handling and complete resource cleanup. Distill the contract; do not copy framework code into the static template.

## `rnUi`

CLI option: `--rn-ui-root`

- `src/components/card/`
- `src/res/colors/index.ts`

Review this group for component grammar, touch behavior, control states, design tokens, and accessibility conventions. Distill decisions into portable HTML/CSS/JS; never import React Native code into generated output.

## `visualReference`

CLI option: `--visual-reference`

This option points directly to the reviewed HTML artifact. It is optional during a read-only partial audit and required for a provenance write. Treat it as visual evidence only; do not copy mock data, identifiers, point aliases, or external dependencies.
