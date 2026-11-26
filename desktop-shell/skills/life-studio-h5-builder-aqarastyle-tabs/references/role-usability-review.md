# Role dashboard usability synthesis

Builder agent deliveries follow the `SKILL.md` Agent sandbox checks and upload flow. Browser, screenshot and profile checks below are local maintenance guidance, not extra Builder prerequisites.

## Source and boundary

Targeted review on 2026-10-20 of the public UI/UX Pro Max [Skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md), [quick reference](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/references/quick-reference.md) and [mobile polish rules](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/references/pro-rules.md). This is a narrow H5 adaptation, not an upstream recertification, full accessibility audit or dependency on that Skill. Baseline source revisions remain unchanged. Ordinary generation uses this reference and the bundled generator only.

## Decisions for this product

- **Useful density:** male remains the most comprehensive role preset: three tabs, all five Home modules and six overview metrics. Put common model-supported controls on cards and residual capabilities in the existing detail sheet. Full density never means all endpoints/diagnostics on screen, fetching every list synchronously or enabling unknown commands. Favorites and space devices retain their confirmed exclusivity; do not add another module to claim completeness.
- **One coherent family per role:** preserve the independent card recipes, theme illustrations and actual information hierarchy. Reuse a role's icon wells, corner grammar and toolbar styling across card families. Keep the playful theme expressive; avoid unrelated per-device decorative styles. Illustration budget and fixed card occupancy remain in the role contract.
- **Readable supporting information:** non-senior role overview labels are 12px, with explicit 18px lines; senior typography and containers follow [senior-sizing-contract.md](senior-sizing-contract.md) and theme-secondary ink at full opacity. Coverage and synchronization use 12px/18px without stacked opacity. Child overview labels use14px/22px in the audience hierarchy below. Do not enlarge every compact control to a generic body-font default or resize complex climate/camera headers. Contrast should be checked on the resulting surfaces, including opacity/gradient/artwork, in each theme; color-token arithmetic alone is not a full contrast audit.
- **Discoverable, stable controls:** add surface-only press feedback to existing primary switches and Space/favorite buttons; retain their positions, labels, state glyphs and exact write handlers. Fine-pointer hover is supplementary for PC preview. No scale/translate feedback on these controls, hover-only actions, synthetic haptics, additional confirmation, decorative loops or new event owners. Busy/disabled states keep the existing semantics and failure feedback.
- **Contextual keyboard focus:** retain the existing focus-visible behavior and fallback. Owned role palettes use a solid accent ring on normal cards and panel ink around Space-card controls. Explicit custom theme colors remain authoritative. Do not target selector back buttons or refocus them on opening a dialog. Add scroll margins for card focus near fixed navigation; verify actual visibility rather than assuming a CSS property proves it.
- **Meaningful icon contrast:** owned dark role palettes use pale active fills with dark inverse ink. Apply dark image treatment to power glyphs on those fills; keep curtain symbols, offline dimming and custom palettes independent. Pair inactive neutral surfaces with readable ink, including the male pale Space controls; state-layer corners must match the role button. Loading glyphs follow the surface they actually cover. Verify real supported state renderings, not decorative SVG contrast.

## Validation and exclusions

Use the existing external-QA browser environment. Check light/dark, role variant geometry, 320px/390px and a landscape preview; exercise mouse-down/up without geometry changes, actual keyboard focus and touch/modal focus restoration. Test reduced motion and meaningful image treatment. Retain the shared device/Space/favorites smoke gates and clean App export; review production diffs and compare request/write payloads to demonstrate that presentation changes do not alter transport/data logic.

Keep the 44 CSS px primary-control baseline and documented expanded chip hit regions; native pt/dp recommendations are not interchangeable with CSS px. Fixed compact layouts, system text enlargement, dialogs and native VoiceOver still require their relevant explicit checks. Report what was tested instead of claiming WCAG conformance from a screenshot or a small browser test. Generic recommendations for charts, infinite virtualization, fonts, motion libraries, dynamic imports, service workers or platform APIs need an actual problem and a compatible implementation plan. They are not adopted by this review. No pip/npm/browser installation, upstream repository, new runtime dependency or added Studio read is needed.

## Current role presentation alignment (2026-10-24)

Reference10 local role-panel examples as paint/information-hierarchy evidence only. No runtime dependency on that HTML, its photos, sample device state or demo event handlers.

Preserve32px module spacing,16px heading/card spacing, existing half-card widths and senior-size exceptions. All Home lights are compact M with lazy Adjust sheets. Male: use blue-black technology paint with royal/electric blue actions and crisp keylines, without green or teal theme accents; no technical grid or flashing, keep the compact overview and scene hierarchy. Female: consistent24px corners and restrained warm neutral/sage layered surfaces. Senior: stable16px corners, one readable keyline instead of stacked thick outlines,20px device names/16px status/52px actions; preserve current controls and add no unreviewed text buttons. Child: one static room/window/desk/book/lamp SVG family localized near overview, coordinated cream/lilac material and24px corners; no fabricated room photograph, greeting, task mode or device state. Default/no role retains neutral theme tokens, with the same compact overview/scene geometry as male and no role decoration.

Use one main action hue per palette; off/offline/busy states retain existing semantics. Prefer readable content surfaces and reserve strong glass for navigation/sheets. No new full-width hero, added module, floating AI, four-column scenes, theme-dependent API, persistent scene-mode state or fixed brightness presets. Every explicit theme has separate light/dark tokens and remains authoritative.

Validate all four roles plus generic, explicit room modes,320/390 light/dark, default/empty/error and long-text cases. Compare actual reference and output screenshots outside delivery; ensure no new reads, no metadata requests for automatic roles, exact one-command execution and stable card dimensions.

### Overview artwork polish

The UI/UX Pro Max visual-hierarchy, dark-mode-pairing and content-priority rules apply to the generated overview as an observed composition, not as a request for extra effects. Keep each role's existing SVG family and card geometry. A category tile's decorative traces belong in its unused edge, clear of the icon, name and live value; senior/female/child hero art belongs behind the title corner, while opaque metric cells retain foreground priority. Tune artwork visibility separately for light and dark; do not increase whole-card transparency to make the art show. In preview compare 320px and 390px at both themes, including unknown values and real filled values, and verify art cannot intercept taps or introduce horizontal overflow. If decoration competes with data, reduce or reposition the art before changing type size, metric order or tile dimensions. This is a generator-owned paint decision and needs no upstream skill installation or runtime dependency.


## Audience hierarchy and function copy (1.11.0; supersedes earlier paint-only scope)

Keep the shared header and all real source/capability rules. The local role-demo is a visual reference only. Apply hierarchy from actual role even with a different skin/theme. Generic neutral/no role retains the existing overview and compact scene presentation. The explicitly named AI default and Apple-style male preset may use a colored compact overview tray and coordinated scene paints via `home-tech-glass`; these are surfaces only, not new metrics, state inference, category capabilities or scene interaction. Preserve the original compact card anatomy and disclosure.

| Audience | Overview | Scenes |
| --- | --- | --- |
| Male | Three compact real category shortcuts; six metrics, coverage and freshness in initially closed native disclosure; no hero or illustration | Compact horizontal shortcuts, independent result slot; coordinated colored surfaces under the default Apple technology preset, otherwise theme-neutral |
| Female | Temperature and humidity are primary; presence is one supporting line; category controls stay available | Stacked icon/name, soft consistent corners/icon wells and restrained theme surfaces; no random per-scene hues |
| Senior | Two large environmental readings,36px/44px values and16px/24px labels; unknown stays unknown | Two columns (one below350px, retaining senior-size fallback),20px/28px two-line names, separate28px icon and reserved feedback slot; no add/editor |
| Child | Distinct illustrated overview with two playful, separately tinted reading tiles: descriptive label above a 31px/38px real value, small inert thermometer/drop icons, and localized “家里温度 / 家里湿度” wording for whole-home scope. Retain real source labels when scoped; unknown remains “—”. Do not reuse the senior plain data-card hierarchy | Two columns, centered familiar decorative activity cues plus original names; no add/editor or invented active mode |

Do not describe a global environmental source as a role's bedroom. Explicit configured source names take precedence over audience overview titles. Retain empty/loading/partial/error states and source coverage; no “safe”, “comfortable” or inferred occupancy claims. Resolve collapsed/standard layout in initial HTML; never hide metrics or change disclosure state in response to data. Male category DOM order is resolved at generation, never changed by incoming data. Scene feedback (busy/success/failure) reserves its own area and remains transient; icons use known name keywords only for decoration with a neutral fallback, not suitability/command inference. Long names clamp to two lines with full title/accessible name; theme and locale changes must not move controls.

### One semantic wording map

The executable source of truth is `assets/dashboard-template/i18n.js` → `functionCopy`. `functionText(key,{form:'short'|'full'})` resolves actual role → default, locale zh-CN/zh-TW/en. `controlText` only maps recognized light range traits with matching category/kind; other capability labels remain model-provided. Keep short visible labels separate from complete accessible action names. No per-card duplicate tables.

| Function key | Default / male | Female | Senior / child |
| --- | --- | --- | --- |
| light.adjust | 调节 | 调光 | 调灯光 |
| light.brightness | 亮度 | 亮度 | 灯光亮度 |
| light.temperature | 色温 | 灯光色温 | 灯光冷暖 |
| climate.target | 设定温度 | 设定温度 | 设置温度 |
| curtain.stop | 停止 | 停止 | 停一下（仅真实 StopMotion） |
| speaker.play | 播放 | 播放 | 继续播放 |
| speaker.volume | 音量 | 音量 | 音量；完整读屏名称“调节音量” |

On/off actions remain explicit (“开灯/关灯”, “打开/关闭”); current state strings remain separate. Curtain automatic action stays “自动开合或停止窗帘”, never promises a fixed direction. Existing category/detail/batch labels remain exact when no safe semantic mapping applies. Unknown keys return a supplied fallback, not invented functionality. Do not translate device/room/scene names, units, enum values, current state or API identifiers. “灯光冷暖” means color temperature only, never HVAC control. No requests or metadata writes are introduced by wording or decoration.

### Industry basis and checks

[Apple Writing](https://developer.apple.com/design/human-interface-guidelines/writing) supports familiar, consistent, explicit action labels; [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) supports readable hierarchy and larger text; [W3C clear labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/) supports visible familiar labels. These inform the design; they do not certify H5 accessibility or make CSS pixels equal native points.

Run role defaults/smoke, semantic wording (five audiences × three locales), light/dark320/390 visual checks, long-scene-name and feedback geometry, senior-size matrix, control/slider payload regression, independent automatic collections and shared read-plan gates. Check explicit source labels/custom themes/no role. Scene/device catalog and commands remain real; isolated preview verifies simulation only. Keep screenshots and reports outside delivery packages.
