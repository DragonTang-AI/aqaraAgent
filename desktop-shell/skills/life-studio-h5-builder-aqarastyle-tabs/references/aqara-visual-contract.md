# Aqara visual contract for Life Studio H5

This is a self-contained, reviewed visual snapshot distilled from `aqara-smart-home-card-design` version `0.12.0`. It allows this Skill to be installed and used without that source Skill, its Figma file, an Aqara repository, a network connection, or a machine-specific path.

## Authority and precedence

- The source metadata has 133 confirmed rules, 190 confirmed variables in three collections, confirmed App and 480-screen profiles, three official atomic component sets, two light functional-area components, four official S/M/L/XL card components, and one confirmed category default: `light`. Its overall official-data set remains `draft` because other categories and screen profiles are still pending.
- This Builder uses the confirmed **App** profile as the mobile H5 baseline. Its exact source viewport is 390×812. Other phone widths, landscape, large-text, and tablet layouts are responsive H5 adaptations and must not be described as additional official Aqara profiles.
- The source contract governs visual semantics, component hierarchy, card occupancy, capability-dependent visual composition, typography, controls, and visual state expression. The Builder's Life Bridge, Studio OpenAPI, runtime capability model, request budget, cache, delayed targeted readback, accessibility, safe-area, pagination, and viewport-stability contracts always win.
- Never call a non-light category “official Aqara category UI” from this snapshot. Use “Aqara-style adapted card” until that category has a confirmed definition.
- The reviewed three-theme light-control artifact is visual-regression evidence only. Its official theme demonstrates the confirmed geometry; its cyberpunk and cozy themes are non-official task-level adaptations. It is not a runtime, data, or bridge source.

## Required hierarchy

Compose cards as `atom → functional component → card component → category default → page composition`.

- Atomic controls own their own geometry, variants, resources, and state appearance.
- Functional components own internal control layout, gaps, capability visibility, and the “无更多控制” fallback.
- Card components own shell, information regions, functional slots, card state layers, and profile geometry. L/XL cards allocate a functional slot; they do not flatten or override its internal rules.
- Category defaults choose the card and functional component from real device capabilities.
- Page composition owns the grid, margins, scrolling, paging, and wallpaper.

Do not render Figma component-set preview canvases, purple fills, debugging fills, preview padding, or preview borders.

## Semantic tokens

These values are the default Aqara paint baseline. All themes preserve the same geometry, hierarchy and behavior; Apple/HA/custom skins may override semantic paint tokens through [theme-skin-contract.md](theme-skin-contract.md). Represent these confirmed baseline values with named CSS variables. Keep aliases semantic; do not scatter resolved literals through component rules.

| Role | Light | Dark |
| --- | --- | --- |
| `action/primary`, button on | `#2E51FF` | `#4570FF` |
| button off, `action/inverse` | `#FFFFFF` | `#FFFFFF` |
| stateless button | `#F0F2FA` | `#FFFFFF` |
| slider track base | `#E1E4F0` | `#FFFFFF` |
| slider fill | `#2E51FF` | `#4460FF` |
| `bg/primary` | `#FFFFFF` | `#46445C` |
| `bg/abnormal` | `#FFFFFFB2` | `#FFFFFF` |
| `text/primary` | `#000000` | `#FFFFFF` |
| `text/secondary` | `#00000080` | `#FFFFFF99` |
| `text/tertiary` | `#0000004D` | `#FFFFFF66` |
| `border/default` | `#E6E7EB` | `#FFFFFF1A` |
| `border/strong` | `#C7C7D4` | `#FFFFFF66` |

Map them to `--aqara-action`, `--aqara-action-on`, `--aqara-action-off`, `--aqara-action-inverse`, `--aqara-button-stateless`, `--aqara-slider-track`, `--aqara-slider-fill`, `--aqara-card-primary`, `--aqara-card-abnormal`, `--aqara-text-primary`, `--aqara-text-secondary`, `--aqara-text-tertiary`, `--aqara-border-default`, and `--aqara-border-strong`.

The official dark `bg/abnormal` resolves to white. Preserve that official token in the token set, but do not map it directly to an inactive Life H5 card in dark mode. For the Life H5 dashboard, define explicit cross-category adaptations: `--aqara-card-inactive` for Boolean-off cards and `--aqara-card-offline` for offline cards. Both use the official light abnormal value `#FFFFFFB2` in light mode and `#2C2B38` in dark mode, a restrained intermediate surface between the official-style H5 canvas `#15161A` and the confirmed online card `#46445C`. State remains unambiguous because off content stays at 100% opacity while offline content alone uses 40%. This prevents lights, gateways and other device categories from becoming dominant white blocks without relabeling the adapted value as official or changing online/action/slider tokens.

## Profiles and card geometry

At the confirmed 390px App viewport, use 16px horizontal margins, four logical columns, 82×60 base cells, and 10px row/column gaps. The corresponding 480 screen uses 16px margins, four 103×90 cells, and 12px gaps.

| Size | Occupancy | App | 480 screen |
| --- | --- | --- | --- |
| S | 2×1 | 174×60 | 218×90 |
| M | 2×2 | 174×130 | 218×192 |
| L | 4×2 | 358×130 | 448×192 |
| XL | 4×4 | 358×270 | 448×396 |

App card radius/padding are 24/14; 480 values are 32/18. Standard App icon, information-row, and circular-control size is 40, with an 8px information gap; the 480 mapping is 60 and 12. App title is PingFang SC Medium 14 and secondary text is PingFang SC Regular 12. The 480 mapping is MiSans medium 24 and regular 21. Use the local system/PingFang stack in H5 and never fetch a remote font.

Home space-device lights always use two-column M compact cards (including power-only, brightness-only and brightness + color-temperature models). Keep icon/explicit Adjust entry at top left, independent real power at top right, actual name and room/status/brightness summary below. No inline sliders, full-row light cards or hero. Adjustment opens a lazy sheet containing only returned writable brightness/color-temperature capabilities, retaining real ranges, units, commit and readback. All roles may use this explicit action; card-body details remain enabled only for male/unscoped by default. Senior keeps M min168px and52px targets; other roles retain M min130px and44px targets. Long text truncates without widening the grid. No power capability means no invented power action. Offline/read-only controls remain disabled. Favorite data, filtering, selection and Space-control detail cards remain independent.

The surrounding H5 App shell follows the reviewed reference artifact rather than using marketing-page typography: its user-facing Studio title is the shared32px single-line heading with ellipsis from home-header-layout-contract.md. The full string remains in the DOM/accessibility tree. This shell adaptation does not change any official card token or geometry.

### Card structure

- **S**: icon + title/status information row; room hidden; no right-top control or functional slot. An S card must not acquire a visible power button merely to make it interactive.
- **M**: icon and right-top circular control on top; title plus `room｜status` at bottom; vertical `space-between` composition.
- **L**: one 40px information row containing icon, title/secondary text, and right-top control, followed by the 62px functional slot. A curtain uses its returned position range exactly once in the same full-width slot and reserves no duplicate header control. Residual capabilities stay in the device-details sheet. Without a direct capability the slot says “无更多控制”.
- **Home light exception**: use M compact cards and a separate adjustment sheet as specified above; L/XL light source compositions are historical only.

## Official controls

- Circular button: App 40×40 with 24×24 icon and approximately 2px stroke. The 480 mapping is 60×60, 36×36, and 3px. H5 keeps a minimum 44×44 hit target without changing the 40px visual circle.
- Horizontal slider: App source is 326×36; its visible endpoint is 36×36 white with a 1px border using the active theme slider-fill token (Aqara source reference: `#4460FF`) and `0 8px 24px #0000001A` shadow. The 480 height is 54. The functional slot, not the atom, supplies final width.
- Historical source vertical slider (not the generated Home light layout): App width is 32; the 480 width is 48. The endpoint matches the track width. The source preview height is not universal: fill the allocated XL control region. Preserve the artifact's layered structure in Life H5: a rounded visual track with `overflow:hidden`, a clipped fill layer, and a visual endpoint sit beneath a transparent native vertical range input. Do not use the native input's painted background as the track in iOS WKWebView because its computed overflow is visible and the fill can escape the pill. Limit the endpoint center to the usable travel between one endpoint radius and `track length - radius`; the full circle remains tangent to and wholly visible inside the track at both 0% and 100%, while only the fill itself reaches the absolute track edges.
- Color-temperature slider: `#FFBB36 → #FFF7DC` track. The color-disc gap maps 8→12 between App and 480.
- Color trigger: use the approved fixed dual-gradient resource when available. A CSS approximation is a labeled non-official task asset and must not be presented as the official bitmap.
- Values, ranges, steps, enum options, units, and protocol coordinates always come from the real Studio definition in this Builder. The visual source never authorizes synthesizing a capability.

## Dynamic light composition

Only `light` has a confirmed category mapping. Apply it to controls that are both returned by Studio and safely renderable:

- All Home lights use M, regardless of fixture name or number of ranges. No ceiling-name S override.
- Brightness/color-temperature controls appear only in the explicit lazy Adjust sheet and require real safely renderable capabilities.
- Other supported controls/readings remain in the role-gated general details sheet. Neither sheet changes card size.
- Non-light cards, favorite devices and Space-control detail cards retain their independent rules.

## Content and visual states

- Title is one line with ending ellipsis. Secondary information is one line and uses `room｜status`; the separator uses the strong-border token.
- Non-light S cards show no separate metric block. Non-light M cards show at most one metric, and omit it when residual details are present; the sheet retains the remaining safe real capabilities. A read-only S card may place its first useful scalar value in the secondary status position.
- Light status is brightness percentage when on and brightness exists, `开` when on without brightness, `关` when off, and `离线` when offline. In responsive H5, preserve the complete accessible name even when visible text truncates.
- Normal, low-battery, and generic-exception cards use `bg/primary`. Off and offline use `bg/abnormal` in the official source model; in the reviewed Life H5 adaptation they use the separate `--aqara-card-inactive` and `--aqara-card-offline` semantic surfaces across every device category.
- Normal/off/low-battery/generic-exception content opacity is 100%. Offline content opacity is 40%, plus explicit offline text and the available abnormal indicator. Do not conflate off with offline.
- Offline outranks generic exception, which outranks low battery, which outranks empty. Render only states present in real Studio data; do not fabricate battery or exception state.
- M/L/XL may show a card-level loading overlay; S does not. Builder pending updates stay card-local and must not replace nodes or shift layout.

## H5 adaptation boundary

Do not import source behaviors that conflict with this Builder: five-second whole-card refreshes, speculative retries, 0.2-second command coalescing, offline action replay, whole-card navigation, long-press menus, fixed 480 paging, simulated loading delays, or a fixed height that clips real content. Each user action keeps the Builder's one-write/no-retry rule and at most one delayed targeted readback.

Keep 44px targets, safe areas, visible focus, reduced motion, responsive text, light/dark host themes, and local assets. Operational success/warning/error/focus tokens may continue to come from the Life design system where the source snapshot has no complete safer definition.

## Acceptance checks

An Aqara-style generated package must:

1. keep `config.uiProfile` as `aqara` in every style and preserve the reviewed Aqara palette when `--style aqara` is explicitly selected;
2. expose the shared semantic token names and four occupancy selectors; preserve confirmed color values in the default Aqara skin;
3. use M for every Home space light, with verified brightness/color-temperature in the explicit lazy Adjust sheet;
4. keep non-light S/L/XL rules unchanged; Home light M uses top icon/Adjust and independent power with bottom identity/status;
5. render compact XL horizontal native inputs with visible labels/values and 44px targets (senior 52px), preserving complete thumbs, keyboard focus and min/max boundaries;
6. distinguish off from offline, preserve every confirmed token, apply the documented dark Life H5 inactive surface to every `.is-off` category and the offline surface to `.is-offline`, keep off content at 100% opacity, and keep offline content at 40% opacity;
7. mark confirmed light versus adapted categories in the DOM;
8. preserve 44px targets, safe areas, light/dark modes, reduced motion, responsive text, and local asset closure;
9. pass `validate_h5.mjs`, `validate_aqara_style.mjs`, `smoke_test_h5.mjs`, browser profile checks, the standard Skill validator, and the portability gate;
10. leave `life-bridge.js`, `studio-runtime.js`, Studio routes, capability projection, and action budgets unchanged unless a separately requested contract release proves otherwise.

Explicit presentation exception: the user-approved Space category detail grid follows [space-control-contract.md](space-control-contract.md) with its independent Figma M-card geometry. This exception applies to the Space detail context in every theme, never to the existing Home grid or to a theme name.

### Home full-width cards and range states

Non-light L/XL Home cards align with the device-grid left/right edges; Home lights always remain half-width M. Preserve the reviewed compact-light height above and the separate Space-detail layout. Horizontal native slider endpoints retain a 1px border using `--aqara-slider-fill`; light/dark and custom themes must not inherit a hardcoded blue border. Verify min/middle/max, on/off/offline/pending and keyboard focus; range fill stays clipped, endpoints remain complete, disabled writes stay disabled and card dimensions stay stable. Drag preview sends no write, release sends the existing single control commit; retain rollback and readback behavior.

## Independent favorite Home mode

The S/M/L/XL rich Home rules in this reference apply to `homeDeviceMode: space`. `favorites` uses the separate Figma compact cards/editor in [favorite-devices-contract.md](favorite-devices-contract.md), in every theme. Preserve each module’s geometry; themes only adapt its paint. The two Home modules are mutually exclusive, and neither changes Space control detail-card rules.

## Shared local icon assets

Equivalent drawing resources share neutral local filenames: `icon-add.svg`, `icon-power.svg`, `device-light-on.svg`, `device-curtain.svg`. Home Favorite and Space detail modules reference these independently; sharing image files does not share their card geometry or control logic. Reuse equivalent bundled assets before adding another export. Preserve distinct on/off variants, desaturation layers, intrinsic sizes, viewBox, gradients, masks and filters. Figma export IDs and local filter-result names alone do not require separate images; verify rendering before merging. Do not add alias copies or external asset dependencies.
