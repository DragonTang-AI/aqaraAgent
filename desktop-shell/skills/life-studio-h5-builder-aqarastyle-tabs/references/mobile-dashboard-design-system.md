# Life mobile dashboard design system

Use this shared Aqara structural/interaction profile for every theme, including Aqara, Apple, Home Assistant and custom paint skins. Read theme-skin-contract.md for light/dark color-only customization. It is a maintained, project-specific synthesis rather than a copy of a generic style catalog. In the Aqara-style Skill variant, `aqara-visual-contract.md` supplies the card-specific visual values and this document supplies the shared Life operational-UI constraints.

## Provenance and adaptation

The baseline was derived on 2026-09-15 from the MIT-licensed [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) repository at commit `15de38fb70bc80ae9276fa7703b48ae861a672e6`. The source query was `smart home dashboard mobile Apple` with variance 4, motion 3, and density 6, followed by focused searches for mobile touch feedback, non-color status feedback, safe areas, responsive HTML, focus, and reduced motion.

The current Life profile also incorporates a verified Aqara mobile-dashboard visual benchmark and the production component grammar for switch, enum, bounded slider, numeric stepper, read-only string cards, interaction colors, and neutral hierarchy. Those upstream artifacts were used to distill this document and the bundled template; they are not required at generation time. The distributable [provenance.json](provenance.json) records only non-sensitive verification metadata; detailed source locations and hashes remain internal.

Treat this profile as the complete portable design contract. Apply its decisions and the bundled semantic CSS tokens; never search for a local reference dashboard or `rn_ui_lib`, import React Native source, or copy mock data, physical point aliases, device identities, or source toolchains into a generated package.

Apply the useful decisions, not the source toolchain:

- Keep a balanced, modern smart-home dashboard with restrained translucent layers and clear depth.
- Use medium information density, subtle state-driven motion, and status colors paired with text.
- Prefer a neutral canvas, one blue interaction accent, and semantic success/warning/error tokens.
- Do not import its proposed Google font, Tailwind, GSAP, remote icons, or CDN assets. Life local plugins use the Apple system font stack, local CSS/JS, and inline SVG so the package remains deterministic under `file://`.
- Do not label data as live. Show an explicit last-updated value because the MVP refreshes on load, user request, and write readback rather than subscribing to realtime device events.

For the targeted role-dashboard review, including supporting-text readability, contextual focus and surface-only feedback, read [role-usability-review.md](role-usability-review.md). Role card recipes remain in [role-profiles-contract.md](role-profiles-contract.md); they are independent from generic paint skins.

## Visual language

- Canvas: quiet neutral background with only a subtle brand-tinted ambient layer.
- Surfaces: solid/translucent cards with one consistent separator and two elevation levels. Glass is an accent, not a readability compromise.
- Aqara dark hierarchy: canvas `#15161A`, online card `#46445C`, action `#4570FF`, and the reviewed Life H5 inactive/offline card surface `#2C2B38`. Keep official dark `bg/abnormal = #FFFFFF` in the token set, but never render an off or offline light, gateway, outlet, camera, curtain, sensor or future category as a large white block in the dark dashboard. Distinguish off (100% content) from offline (40% content) without changing scene colors, slider tracks, action blue, or online cards.
- Shape: 20–28px containers, 14–16px controls, circular icon buttons. Keep radius tokens coherent.
- Typography: system font, strong compact display heading, 16px body where prose is present, 12–14px secondary labels with verified contrast. Keep explicit `Roboto`/`Noto Sans SC` fallbacks after the iOS fonts so Android does not depend on an unavailable Apple font. Avoid ultra-small ornamental text.
- Icons: one outline SVG family, consistent 1.8–2px stroke, `currentColor`, decorative SVGs `aria-hidden=true`.
- Spacing: use 4/8px-derived values. Prefer 16px phone gutters, 24px section separation, and 8–12px internal gaps.
- Motion: 120–240ms for direct feedback, no layout-shifting transitions, no autonomous decorative loops. Loading shimmer is permitted and must collapse under reduced-motion.

## Component rules

### App header

- Respect all four `safe-area-inset-*` values and keep the Mine entry at least 44×44px. The initial page shell starts below the top inset, while a sticky header uses that same inset as its sticky `top`; otherwise it will slide under an iPhone notch/Dynamic Island after scrolling. Keep a noninteractive canvas-colored status-bar guard above the sticky header so underlying cards cannot bleed through the sensor area.
- In landscape, add the returned left/right safe insets outside normal content gutters so controls and horizontally scrolling cards do not enter the notch or rounded-corner exclusion zones. Do not substitute model-specific pixel constants for CSS environment values.
- Treat zero safe-area values as valid on Android. Base gutters and the minimum bottom breathing room remain present when every `env(safe-area-inset-*)` resolves to zero; nonzero values are additive rather than replacing those gutters.
- Show product identity and the user-facing home/dashboard title without oversized marketing copy.
- In the Aqara App profile, render the shared Studio title as a separate one-line32px/44px heading below the sticky navigation row, with ellipsis and complete accessible text. Follow home-header-layout-contract.md; do not move the large title into the sticky row or let it wrap.
- No role or theme renders a top-right refresh button. The shared pull-to-refresh indicator exposes a descriptive localized status; the error-state retry remains an explicit button.
- The embedded dashboard uses its semantic `main` landmark directly. Do not add a fixed "skip to main content" link when there is no repeated navigation block; transform-based off-screen hiding can leak into an iPhone safe area. Reintroduce a skip link only for a future layout that genuinely needs bypass navigation and only with a keyboard-modality-aware, visually-hidden implementation tested in WKWebView.

### Connection and freshness

- Use icon/dot plus explicit text for connecting, connected, partial, and failed states.
- Display the last successful synchronization time. Do not claim realtime behavior.
- Partial failures remain visible without preventing available device data from rendering.

### Summary

- Standard overview only: use one visible localized “家庭概览 / Home overview” section heading, 20px/28px and weight 700, followed by the metric grid with a 12px top gap. Do not display the old loading/status headline (such as “设备正在按需加载”) or the loaded/total/online sentence beneath it. Apply this compact composition in every theme and both Home device modes; retain the chosen palette and materials.
- Use a description-list-like metric group with readable labels and stable widths.
- Male/unscoped compact overview uses three category shortcuts and initially closed Home details (six metrics, coverage and synchronization time); no hero wrapper. Other role metric selections and standard layout remain as configured. Keep truthful coverage and category detail entries. Preserve existing loading/error/partial-data handling and notices; removing redundant copy does not change requests, counts, freshness or error feedback. If existing runtime bindings retain `summary-heading` and `summary-detail`, hide those nodes in initial HTML so asynchronous updates cannot flash them; name the section with the visible `summary-label` heading.
- Avoid charts when three or fewer exact totals communicate the state better.

### Scene cards

- Render scenes as semantic buttons with a complete accessible name.
- Provide pressed, disabled, focus, pending, and success/error feedback without shifting layout.
- Keep scene names readable for long Chinese and localized strings; two-line wrapping is preferable to silent truncation.

### Device cards and controls

- Device state uses icon treatment, switch position, and text such as `已开启` or `已关闭`.
- Classify returned devices into light, outlet/switch, climate, curtain, lock, camera, sensor, safety, cleaning, media, hub, and generic families. Category accents never replace textual state.
- Match Studio metadata to switch, explicit enum, bounded slider, zero-field action, or read-only telemetry. This mirrors `rn_ui_lib`'s `HomeSwitchCard`, `HomeEnumCard`, `HomeSliderCard`, and `HomeStringCard` grammar without copying React Native code.
- Home space-device lights always use two-column M compact cards (including power-only, brightness-only and brightness + color-temperature models). Keep icon/explicit Adjust entry at top left, independent real power at top right, actual name and room/status/brightness summary below. No inline sliders, full-row light cards or hero. Adjustment opens a lazy sheet containing only returned writable brightness/color-temperature capabilities, retaining real ranges, units, commit and readback. All roles may use this explicit action; card-body details remain enabled only for male/unscoped by default. Senior keeps M min168px and52px targets; other roles retain M min130px and44px targets. Long text truncates without widening the grid. No power capability means no invented power action. Offline/read-only controls remain disabled. Favorite data, filtering, selection and Space-control detail cards remain independent.
- Compact rich-light rows use visible horizontal native range inputs, true labels/values and theme-aware thumb borders. Follow the shared spacing and compact-light geometry in aqara-visual-contract.md; do not recreate the old oversized hero/vertical-track layout. Preserve drag preview, release commit, cancellation and request budgets.
- Inside the device-details sheet, group writable controls and read-only status separately. Reparent lazily mounted nodes rather than cloning them, and use the same switch, explicit enum, bounded slider, action, and telemetry components as the main card; do not replace a real bounded or enumerated model with a generic text field. Stop touch, pointer, wheel, and cancellation propagation at the sheet layer so page-level gestures cannot run; the content pane alone owns vertical scrolling and contained overscroll.
- Give a curtain with `TargetPositionPercentage` a category-specific progress slider, percentage text, a clearly visible filled track, and a 24px thumb inside a 44px touch row. Dragging changes the local visual value continuously; an active drag, including an early `change`, performs no request. Successful release commits the changed value once; cancellation restores the confirmed preview without writing. Apply the same behavior to every range control. Do not let an accompanying `OnOff` trait replace the curtain position control.
- In an Aqara L curtain card, mount that range exactly once in the full-width functional row below the icon/title row. Keep residual capabilities in the device-details sheet. Never place a 92px generic range in the 44px header-control column.
- Do not stringify returned object/array/map readings into generic device metrics. Structured readings stay in the runtime model until a reviewed semantic renderer exists, and they do not inflate residual capability counts or card occupancy.
- Render a capable air conditioner/thermostat as a full-grid-width climate card, not as an indistinguishable square switch tile. Use a restrained dark climate surface, power control in the header, large current-temperature value, a labeled target-temperature slider, and returned mode/fan selectors. Keep all labels localized and maintain at least 44px interaction height. If the definition lacks the composite Traits, degrade to the available generic control instead of showing fictional temperature or modes.
- A visually compact switch still needs a 44×44px hit area and a state-specific accessible label.
- Keep touch behavior transport-neutral: buttons use `touch-action: manipulation`, range controls preserve scroll on the perpendicular axis, and drag completion covers pointer, touch, mouse and keyboard paths without binding UI code to an iOS or Android global.
- Online/offline must have visible text; never use only a green/gray dot.
- Read-only devices look informative rather than broken. Disabled write controls must be truly disabled.

### Device collection layout

- The default template uses a conventional responsive Grid. Only introduce waterfall/masonry placement when the user requests it or when materially different real card heights make it beneficial.
- Never use CSS multi-column layout for interactive/glass device cards in Life WKWebView. WebKit can fragment composited cards at the pagination boundary and paint a ghost block over the load-more area.
- For requested masonry, use explicit CSS Grid tracks and deterministic placement into the current shortest column. Complex climate/loading/empty states may span all columns. Drive responsive column count from the same CSS breakpoint state used by the placement code so a 320px transition cannot retain an implicit second column.
- Height variation must come from real device category and visible card content. Do not add random heights merely to make masonry more obvious. Device details are modal and must not affect card height or placement. Recalculate after card-content or viewport changes, keep pagination outside the grid, and verify that card rectangles never overlap.
- Metadata does not create visual richness. Device IDs, MAC/EUI/IEEE addresses, root-node identifiers, firmware/vendor/model fields, link/network/connection status already represented by the device summary, and other diagnostic data do not enter ordinary card metrics, residual capability counts, or size selection.
- Collection replacement after a category switch, page append, language change, or refresh must preserve the corresponding filter/visible-card viewport position. Type buttons themselves stay mounted during category changes so focus and horizontal position survive. Device actions, scene actions, disclosure, readback, and rollback mutate existing nodes in place and never rebuild cards or collections. Do not use the moving load-more button as the pagination anchor.
- During a category replacement or disclosure collapse, the outgoing grid height may be retained only for the bounded anchor-repair frames. Then remove the inline minimum height and let the collection end at the actual last card; do not retain a historical maximum or portrait measurement. If the new category is shorter than the viewport can preserve, allow the document to clamp naturally instead of manufacturing a blank scroll region. A visible load-more control stays outside the grid and follows the last card at its normal margin.

### Direct actions, errors, and toast

- Device and scene tiles act immediately. Disable the active control while pending and prevent duplicate submission; do not add a second confirmation layer.
- Errors name the failed action and preserve the last confirmed state.
- Toasts use `role=status`, concise text, safe-area-aware placement, and must not be the only durable explanation for a fatal state.

## Responsive and accessibility acceptance

- Verify no horizontal scrolling at 320px and 375px.
- Verify text enlargement/reflow at the primary 390px viewport does not create horizontal scrolling. Do not enforce a hard minimum width on `html` or `body`; the 320px support floor is a test target, not permission to overflow when browser zoom or accessibility text scaling produces a narrower effective CSS layout.
- Verify 390×844 as the primary phone composition, wide-phone landscape, and 768px+ multi-column layout.
- Verify a 360px Android-class UA/touch profile with zero safe-area insets, in both themes, through the Android prompt fixture. This is a deterministic browser gate, not a substitute for a real Android WebView run.
- Verify zoom/text scaling does not clip critical labels, controls, warnings, or dialog actions.
- Verify all interactive targets are at least 44×44 CSS px with at least 8px between adjacent actions.
- Verify normal text contrast is at least 4.5:1 and meaningful non-text controls at least 3:1 in both themes.
- Verify visible keyboard focus, logical focus order, complete accessible names, and modal focus containment.
- Verify `prefers-reduced-motion: reduce` removes nonessential animation and leaves final semantic states visible.
- Verify safe-area padding on all four edges, including a simulated 47–59px portrait top inset and nonzero landscape left/right insets. Scroll until the header is sticky and assert its content remains at or below the top inset; verify fixed toast/dialog content avoids the home indicator.
- Verify semantic scroll anchors after switching from all devices to a one-item category and back, expanding and collapsing capabilities, appending one UI page, toggling a device, executing a scene, refreshing rendered content, switching host language, and completing delayed readback. For a requested masonry layout, stress at least two UI pages with mixed card heights and assert no overlap, no ghost fragment over pagination, and correct one/two/three-column transitions.

## Anti-patterns

- External fonts, icon packs, CSS frameworks, or animation runtimes.
- Emoji or inconsistent glyphs as icons.
- Glass surfaces with unreadable low-contrast text.
- Random colorful cards, gratuitous gradients, oversized hero marketing blocks, or excessive rounded pills.
- Hover-only affordances, sub-44px hit targets, color-only status, clipped one-line names, and invisible focus.
- Viewport-fixed skip links hidden only with `transform`, negative offsets, or safe-area-dependent positioning.
- Optimistic device state presented as confirmed before Studio readback.
- A one-size-fits-all switch tile that drops a device's other returned operational capabilities, or a generic free-form editor that guesses unsupported model fields.
- CSS `column-count`/`column-width`/`column-span` used as interactive-card masonry in WKWebView, random card heights, or pagination anchored to a control that moves when cards are appended.
