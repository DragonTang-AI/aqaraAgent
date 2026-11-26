# Shared Aqara UI with theme skins

## Fixed structure and behavior

`config.uiProfile` and root `data-ui-profile` are always `aqara`; `config.style` and `data-style` choose a paint skin. The generator includes both attributes in initial HTML so first paint has the correct grid and geometry before dashboard startup. Native theme changes update `data-theme` independently; do not change layout/model projection or reload data to switch theme.

Space-mode Home device cards in every style use the same S/M/L/XL rules from aqara-visual-contract.md: all Home lights use two-column M with explicit lazy Adjust sheets and independent power; L full-width curtain control; compact non-light scalar/metadata policy; adaptive details sheets; camera XL with 16:9 contain framing. Preserve spacing, typography, geometry, control selection, DOM lifecycle, 44px targets, gesture ownership, request budgets, filters, pagination and accessibility. Theme names must never gate these JS behaviors. Devices remains a real space-grouped list; Smart retains real scenes/automation switches. AI/Mine entry placement and host contracts apply to every theme.

Colors may differ; off and offline keep explicit semantics (off content fully visible, offline content 40%, card surface retained). Do not recreate the legacy Apple colorful generic device tiles, change sizes from names, discard capabilities, introduce a second rendering implementation or claim these skins are official Apple/HA component designs.

## Built-in and custom generation

For Apple-inspired skins, apply [apple-theme-guidance.md](apple-theme-guidance.md) alongside this contract. Official HIG examples inform materials and color; they do not replace Aqara card structure or sizing.

Explicit `--style aqara` preserves the reviewed Aqara palette; the unspecified-role default uses Apple glass paint. `--style apple` uses neutral iOS-inspired light/dark surfaces and blue accents. `--style ha` uses blue/teal light/dark surfaces. All retain the Aqara UI grammar and the shared Liquid Glass web adaptation, with one navigation backdrop and usable fallback.

Other themes use `--style custom --theme-tokens <caller-selected JSON file>`. The input must contain exactly `light` and `dark` objects. Keys are the allowlisted semantic CSS paint tokens in scripts/theme-tokens.mjs; values are hex colors or rgb/rgba colors. Transparency belongs in the color alpha, never whole-card opacity. Unknown keys, geometry such as --radius-md/width/gap, raw CSS, URLs, expressions and missing light/dark objects are rejected before creating the output directory. The generator compiles tokens into local styles.css; neither the input path nor a runtime dependency is delivered. Unspecified colors inherit the reviewed per-mode baseline. Choose complete, coherent palettes where required by the desired theme.

Supported semantic groups: canvas/glass; action on/off/inverse; stateless button; slider track/fill; card primary/abnormal/inactive/offline; text primary/secondary/tertiary; default/strong border; tab glass tint/text/selection fill; overview gradient stops/glow; legacy scene gradient pairs; favorite-scene tint/confirm fill/text; focus ring; sheet glass/glow; directory icon tint. Generic surface/text/action aliases derive from these tokens. The custom API exposes colors only; built-in shadows are paint declarations. Themes do not override card geometry, accessibility state opacity or continuous backdrop animation.

## Creative latitude

The AI chooses the palette, color relationships, gradient stops and alpha values from the requested mood; built-in skins and the example below are starting points, not mandatory palettes. Do not reduce every theme to a blue accent or ask users for hex values unless they request exact brand colors. For an expressive theme, coordinate overview, scenes, AI entry, cards, sheets, device directory and tabs through semantic paint tokens, keeping status meaning recognizable. Create separate light/dark palettes; dark mode is not a filter, color inversion or uniform reduction in opacity. Neutral off/offline surfaces must remain distinguishable and text readable over glass. Theme variation must not alter Aqara geometry or business rules.

Prefer a small coherent family of hues, with sufficient variation in scene gradients; evaluate readability after composing translucent layers. If a requested material cannot be represented safely by existing paint tokens, extend a shared semantic paint slot and its validator instead of adding theme-specific layout or JavaScript branches. Do not embed a particular demonstration palette as the only permitted custom theme.

Example (illustrative only; other tokens inherit the Aqara per-mode baseline):

```json
{
  "light": {
    "--canvas": "#f5f4f0",
    "--aqara-card-primary": "#ffffff",
    "--aqara-card-inactive": "#e9e6df",
    "--aqara-card-offline": "#e9e6df",
    "--aqara-action": "#79502b",
    "--aqara-action-on": "#79502b",
    "--aqara-slider-fill": "#79502b",
    "--glass": "rgba(255,255,255,0.86)"
  },
  "dark": {
    "--canvas": "#191714",
    "--aqara-card-primary": "#38332d",
    "--aqara-card-inactive": "#25211d",
    "--aqara-card-offline": "#25211d",
    "--aqara-action": "#e3ba89",
    "--aqara-action-on": "#79502b",
    "--aqara-slider-fill": "#e3ba89",
    "--glass": "rgba(37,33,29,0.86)"
  }
}
```

## Validation and editing

Every package runs validate_h5.mjs, validate_aqara_style.mjs and existing runtime/tab smoke gates. The Aqara validator accepts all supported skins but requires the shared profile and rejects theme-selector rules with layout declarations or unsupported variables. Browser profile_h5.mjs checks the same card/control/interaction geometry for every theme, retaining exact Aqara palette golden checks only for the default Aqara skin. Other skins must retain distinct online/inactive surfaces and state semantics. Run profile_theme_skins.mjs for the built-in light/dark matrix and a custom palette; inspect screenshots outside all deliverables. It also checks invalid custom themes are rejected and geometry overrides fail validation. Color acceptance alone does not prove legibility: inspect contrast against the composed background, long translations, empty/loading/error states, and narrow screens. Use suitable readable text and accent colors in both modes.

Runtime DOM/CSS changes are shared by preview/App. After editing, refresh and validate the preview, run relevant browser gates, then export the production allowlist. Production remains free of mock/QA resources. No native App change is required for this theme separation. Generation needs no upstream repository, Figma access or another skill.

Space control retains its dedicated Figma summary/detail geometry in every theme (see space-control-contract.md), including the explicit user-approved detail-card exception. The existing Home profile is unchanged. Optional paint tokens cover space action/batch surfaces and selected tab fill/text.

## Independent favorite Home mode

The S/M/L/XL rich Home rules in this reference apply to `homeDeviceMode: space`. `favorites` uses the separate Figma compact cards/editor in [favorite-devices-contract.md](favorite-devices-contract.md), in every theme. Preserve each module’s geometry; themes only adapt its paint. The two Home modules are mutually exclusive, and neither changes Space control detail-card rules.

## Continuous background and safe-area chrome

Treat a theme’s page paint as one continuous coordinate space, including the top safe area. At scroll origin the inert fixed chrome plane has zero opacity, exposing the actual page background (solid, fixed layered gradient or role illustration), rather than repainting --canvas, copying/resizing a gradient into a short strip, or changing the approved palette. Keep html’s canvas as the fallback/overscroll color. Do not remove safe-area padding or the guard to hide a seam.

Use one fixed, masked material plane for the status area and the visible Home header. Separate status/header backdrop-filter surfaces remain visually different even with identical color tokens, so the header itself stays transparent and does not create a second blur or hard separator. The shared plane uses --glass and one blur, with a 24px feathered lower edge. Its opacity follows clamp(scrollY / 48, 0, 1), including fast reversal and negative overscroll; no threshold color jump or delayed CSS transition. A requestAnimationFrame-coalesced scroll callback writes opacity only when it changes, with no layout reads or requests. Measure Home header height only on resize/hidden-state changes (ResizeObserver/MutationObserver); exclude hidden headers on Devices/Smart. Keep the plane below actual navigation controls, above scrolling content, inert and nonblocking. Initialize and restore on pageshow/tab scroll restoration. Full-screen sheets/search own their surfaces above it. Reduced transparency or unavailable blur changes this same plane to --surface, not a second header layer.

Sticky Smart segments keep their bounded surface and selected state, with a thin inset semantic separator and optional blur. Never use --canvas as a spread shadow or opaque halo around an element over gradients/artwork. This rule does not prohibit canvas within intentional opaque sheets or normal component states.

For template maintenance and page/theme restyles, run profile_background_continuity.mjs with existing browser/module options on the modified package and role variants. Include nonzero --safe-top (59px), origin, intermediate offsets (0/4/8/12/24/48px), fast up/down reversal and scrolled Home/Devices/Smart, light/dark, 320px and desktop, tab return, and the actual composited gradient/artwork. Verify the Smart segment stays below the safe area and no geometry or input ownership changes. Existing safe-area geometry tests alone do not establish visual continuity. Keep screenshots/QA outside the product; App appearance still requires user real-device verification.
