# Role-based Home presentation

On the Builder agent host, the `SKILL.md` Agent sandbox flow controls generation, its three Node checks and upload. Browser, screenshot and profile instructions in this reference apply only to local skill maintenance when those tools already exist.

## Intent and precedence

For identifying audience versus theme/space, scoped negation, role switching and ambiguous or multi-role requests, first read [role-intent-routing.md](role-intent-routing.md). Confirmed configuration means choices actually confirmed by the user; old role-derived defaults are recomputed when the user changes role.

Use roles only when requested. Map 男主人/male, 女主人/female, 老人/senior, 小孩/child to `--role`. These are overridable usage presets, not gender-based permissions or assumptions about a person's taste. Explicit user choices beat confirmed existing configuration, which beats role defaults, then generic defaults. On an existing artifact preserve confirmed tab/device mode/order/theme unless explicitly changed; do not blindly regenerate it from role defaults. A positive favorites-device request overrides the role's device mode; favorite scenes alone does not. This reference extends existing geometry/data/action contracts, never replaces them.

## Defaults

| Role | Tabs | Home devices | Overview | Visible module order |
|---|---|---|---|---|
| unspecified / AI default | Home/Devices/Smart | favorites | all six real metrics in a collapsed compact overview; category entries | overview, aiAssistant, favoriteScenes, devices, spaceControl |
| male | Home/Devices/Smart | space | online, spaces, scenes, temperature, humidity, presence; category entries | overview, favoriteScenes, devices, spaceControl, aiAssistant |
| female | Home/Devices | favorites | temperature, humidity, presence; category entries | overview, favoriteScenes, devices, spaceControl, aiAssistant |
| senior | Home only | favorites | temperature, humidity; native connection banner | overview, favoriteScenes, devices, aiAssistant |
| child | Home only | space | temperature, humidity; same whole-home scope as generic mode | overview, favoriteScenes, devices |

Generate with `node scripts/generate_h5.mjs --output <new-workspace> --role senior --with-preview`. Role visuals are overridable material suggestions: male blue-black technology: cool silver-blue light surfaces/royal-blue controls and near-black navy dark surfaces/electric-blue controls, with no green or teal theme accent; female pearl ivory, rose quartz and amethyst surfaces with restrained champagne highlights and a coordinated plum-night palette, keeping a single legible plum action color rather than making decorative gold a state signal; senior sage canvas, opaque mint overview, warm wheat scenes and ivory device surfaces with strong readable keylines (deep pine, mint and muted wheat at night); child warm cream canvas, lavender-to-apricot overview, gentle lilac/mint/peach/blue scene rhythm and soft lavender device surfaces (plum/slate counterparts at night), with coherent room/window/desk/book/lamp illustrations. These color fields may distinguish sections but never encode device or scene state. Palettes are defaults, not the sole distinction. All include separate light/dark paint. The three device-card families remain independent. The bounded role-card variants below add UI differences while preserving external dimensions, essential controls, offline opacity and capabilities. Seniors use the explicit large-size tier in [senior-sizing-contract.md](senior-sizing-contract.md), enlarging typography and containers together without changing control semantics. Essential controls and offline/error/disabled states cannot be hidden for decorative simplicity.

Child-only Home keeps the existing room illustration in the overview and plain section headings. Favorite scene cards use one original softly dimensional SVG icon family with rounded geometry, muted light/dark pastel halos, left-aligned real titles and the existing separate feedback slot. The sprite lives in `assets/child-scene-art.svg` and is embedded once in child HTML; per-card references use the existing decorative scene concept key, with a neutral sparkle fallback. Do not add the visual proposal's sample subtitles or data to production. Keep art `aria-hidden` and out of real names, button labels, state summaries, commands and other roles. Preserve the section hierarchy, two-column grid and narrow-screen wrapping; scene execution capability never comes from the art key.

Overview/scene hierarchy and semantic wording are maintained in [role-usability-review.md](role-usability-review.md); role hierarchy is independent of paint and preserves explicit source names.

## Explicit overrides

- `--tabs`, `--home-device-mode`, `--home-module-order` override role defaults through existing contracts.
- `--home-modules overview,devices,...` selects visible modules from the five existing IDs. Hidden modules stay structurally present for safe backwards compatibility, are hidden before first paint, and do not instantiate their optional scene/space controllers. Device DOM is not generated when its module is hidden. Overview category entries can independently require the shared space controller.
- `--overview-metrics temperature,humidity,...` selects nonempty unique IDs from `online,spaces,scenes,temperature,humidity,presence`; visible metrics use a compact 1/2/3-column grid without blank slots. Metrics remain actual derived data, not invented role-specific statistics. Native connection status remains in the existing banner, not a fabricated metric.
- `--overview-categories true|false` controls existing lighting/shading/climate entries.
- `--information-density full|standard|simple`: simple hides only redundant summary/coverage copy and capability footers; never removes operational controls or alters card heights. Full/standard retain existing complete device capabilities and detail access; density is presentation, not a capability filter.
- `--role-skin none|male|female|senior|child` separates role behavior from visuals. Omitting `--style` lets the generator select the role's default style and palette. An explicit `--style` matching the role preset base keeps that palette; a different explicit style or custom `--theme-tokens` replaces the role palette while the visual language remains recognizable. Use `--role-skin none` to opt out of role paint/decorations; actual-role information hierarchy, everyday copy and accessibility rules remain. Custom tokens are applied last. Continue using reviewed light/dark theme-token files or safe paint-only CSS for creative themes; role palettes are not an exhaustive style catalog.

Do not auto-save Favorite devices. Senior/child automatic collections never read/write official favorites and have no add controls; follow daily-use-role-contract.md. Female retains missing-key view-only recommendations with official favorites. Generic/male/female Favorite scenes follow first-use/default and saved-record rules; senior/child use isolated role projections. Favorites restore the user's RN-compatible service-side selections in the current host context; explicit empty remains empty for service-backed roles; senior/child automatic projections do not read that key. Role/page changes never partition or auto-populate server favorites. Do not rename unrelated real scenes to “学习/休息”, infer a scene's room from its name, or claim a child role has authorization boundaries. The scene catalog remains the real Studio catalog for manual favorite selection until reliable association filters exist.

## Home space scope

`--home-space-id <real-space-ID>` binds Home device discovery and environment aggregation to that actual space and descendants. Resolve descendants from the current `/spaces` tree, then pass documented `spaceIds` and `needChildren:false` to the existing paged `/devices` API. Scope both initial pages and overview discovery; reuse one tree read/in-flight catalog. Never filter only the visible first 12 rows or relabel whole-home readings as room data. When Home space scope and favorite-device mode are explicitly combined, favorite-device discovery/reconciliation uses the same scoped queries and local choices are also separated by selected space. Home scene preferences/catalog are separate and are not falsely room-scoped. Devices/Smart tabs retain their existing full Studio responsibility.

`--home-space-required` defaults to false for all roles, including child; `--home-space-selection` defaults to `manual`. With no explicit restriction, child reuses generic whole-home discovery, pagination, refresh and family-wide overview; its visible local room/category projection follows the daily-use contract. New child pages use actual matched room chips and per-room category filtering from daily-use-role-contract.md; no synthetic recommendation chip. A room-chip change does not rebind Home or issue extra requests. Child skin/layout and disabled card-detail policy remain independent. Only explicitly requested room restrictions enable scoped discovery. `--home-space-required true --home-space-selection first-room` remains an optional explicit startup policy, never inferred from age or role. A real configured `--home-space-id` always wins. When no room is specified, first-room reuses the initial `/spaces` read and automatically selects the first non-root leaf space in API tree order, then loads its device page and overview. Do not pick a floor/root as an implicit whole-home substitute, infer ownership from a name, or scan rooms until a nonempty one appears. A valid empty room shows its actual empty state. No room requires an extra tap merely to start its initial load.

Use `--home-space-required true --home-space-selection manual` when the user explicitly wants to choose before loading, or names a target room that cannot yet be resolved to a reliable ID. Manual mode shows actual choices and issues no device read until selection. Automatic mode with no candidate rooms shows the localized no-rooms state; `/spaces` failure or a configured/selected missing ID fails visibly, without all-device fallback. Both policies use the same explicit room-switch path; selection is retained during refresh within the current page session. This update adds no cross-session preference storage. On a changed native Studio/account collection epoch, automatic unconfigured selection is resolved from the new tree; stale requests cannot choose or publish an old room. Explicit IDs remain strict. The automatic cache namespace is distinct from the legacy unbound/manual snapshot.

Changing Home space is blocked during active writes; query parameters, snapshot namespaces and revisions prevent old-room data from becoming the new room's completed result. Home scope is a UI/data-query boundary, not account permission enforcement. Actual selected names are shown in the overview and filters. Neither preview nor App may claim an automatically opened room is the child's own room.


### Migrating an existing child dashboard

Remove inherited child defaults (`homeSpaceRequired:true`, `homeSpaceSelection:first-room`) when aligning an unbound child Home to generic discovery: set required false and selection manual. Preserve explicit `homeSpaceId` and user-confirmed room/choose-before-load restrictions. Do not treat a historical automatically inherited first-room flag as a user-confirmed restriction. Preserve disabled child details, tab/module choices and favorites. Use `profile_child_home_business.mjs <comparison-parent>` with child/generic/bound/manual preview workspaces to assert shared whole-home initial discovery, children's distinct per-room maximum-four presentation and zero-request local chips, generic empty/unassigned room access, whole-home refresh and strict explicit scopes; follow the existing installed-browser/external-QA rules.

## Work plan and validation

Read role choices alongside existing layout, theme, favorite-device and space-control references. Keep one shared template, optional role configuration, bounded card variants and paint tokens; do not duplicate source templates or introduce native changes. Hidden modules need no dedicated background work; existing shared indexing still runs when visible environment readings, AI suggestions or space controls require it. Explicitly opening the favorite picker can extend the index even when automatic indexing is disabled.

Run normal static/preview/portability and device/scene/write-budget smoke gates. Run `smoke_test_roles.mjs` for preset/override/invalid config and presentation checks, plus `smoke_test_home_space_startup.mjs` for automatic/manual startup, one-read scope bootstrap, failure/empty/race handling and Studio isolation. Generate all four preview workspaces; run `profile_roles.mjs <parent-of-four-role-workspaces> --qa-output <external-dir> --playwright-module <existing-module> --browser <existing-browser>`. Inspect light/dark, 320px, long labels, module order, empty/default favorites, manual selection, scoped room switching and English. Keep screenshots/mock/QA in the isolated preview or external QA folders; export App via the existing inventory. Never install dependencies to run validation; report unavailable gates.

## Short Agent prompts

- 男主人：使用此 Skill 生成全屋掌控型三 Tab 看板，按空间展示设备，总览完整，卡片采用统一的赛博朋克科技风。
- 男主人使用 Apple 风格默认参数时，生成器自动选用 `home-tech-glass` 视觉预设：浅色为冷银蓝与深海蓝总览，深色为蓝黑底色、电光蓝与克制的玻璃浮层。场景使用协调的四种渐变色，但真实名称、状态、执行反馈和卡片结构不变。空间设备与空间控制保持原来的数据、尺寸及交互。若用户指定其他风格，则不套用该预设。
- 未指定角色的通用默认与“AI默认看板”是同一配置：生成器默认 Apple 风格、`home-tech-glass`、三 Tab、常用设备和上表模块顺序，无需 Agent 追加专用参数。该视觉预设只改浅/深色配色、紧凑总览的内衬层次、场景表面和浮动控件玻璃；三个分类入口共用聚焦底盘，“家庭数据”折叠入口置于底盘之外、下方留出间距。概念性面板名不得替代 App 内实际 Studio 名称。用户显式指定的样式、页数、设备模式和顺序优先；Aqara 风格仍可显式选择。
- 女主人：使用此 Skill 生成舒适生活型两 Tab（首页、设备）看板，首页使用常用设备，总览突出温湿度和有人空间，卡片温润精致、配色统一。
- 老人：使用此 Skill 生成清晰易用的单首页看板，常用设备优先，总览优先有可靠来源的环境数据，无来源时减少指标，卡片高对比、低透明度，简化说明但保留必要状态。
- 小孩：使用此 Skill 生成明亮友好的单首页看板，设备和空间筛选业务沿用默认模式，复用全屋数据发现，首页默认展示儿童相关空间与设备，仅显示匹配的真实房间；总览简洁，省略 AI 和空间控制。仅明确指定房间时限制数据范围；无法解析房间时先手动选择，不猜测 ID。

All prompts inherit existing real-data, light/dark, stable-card geometry, user preference and no-auto-favorites rules. Explain limitations before claiming unsupported data or permission capabilities.

## Visual diversity review

Do not treat four accent colors on the same white cards as sufficient role adaptation. Within the existing anatomy, vary at least background/material construction, elevation/keyline treatment and button/room-chip chrome together. Apply a coherent family across overview, device/favorite cards, space summaries, space details and theme states. Palette, opacity, static gradients, inset strokes and shadows are paint; card width/height/padding, grid occupancy, hit targets and data semantics remain module-owned. Radius, icon wells, text hierarchy and Space-shared summary chrome may use the explicitly selected role-card variants below; generic theme colors do not change layout. Preserve offline/pending/disabled behavior; decoration cannot suggest a fake device state or a new action. Use inexpensive static CSS/SVG paints; avoid decorative DOM, bitmap assets, continuous animation or blur on every card. Keep reduced-motion behavior.

Male/female/senior/child examples are reference directions, not mandatory gender aesthetics. AI may reinterpret the user's requested theme and role preference while preserving geometry and ensuring readable light/dark controls. An explicit theme changes colors without silently discarding role material; `--role-skin none` remains the explicit escape hatch.

For visual review generate a separate, temporary common-module comparison for every role with `--home-modules overview,devices,spaceControl --home-device-mode space --overview-categories true --tabs home`. Use the generic whole-home scope for child unless the test explicitly requests a room restriction. Run `profile_role_materials.mjs <comparison-parent> --qa-output <external-dir>` with existing browser/module paths. Compare the same space-control cards in light/dark, including action surfaces and detail cards, rather than relying on different module visibility to imply visual diversity. Assert 358×172 all-space / 358×126 room summaries and 173×126 detail external geometry at 390px, role-specific corner shapes and summary geometry and check 320px. The comparison does not change default senior/child visibility. The isolated comparison previews may be delivered separately as examples of explicit module overrides. Keep comparison screenshots and reports outside exported App/preview products. Scoped room roots retain their actual-room identity for active-room counts; projecting a room as the local navigation root must not erase it from room statistics.


## Expressive theme illustration layer

Role adaptation must read as a distinct, coherent theme at first glance, rather than four variations of the same neutral dashboard. The generator includes self-contained SVG art in CSS image variables for light/dark; the browser selects it with the existing theme attribute. This is dynamic theme rendering, not frame-by-frame animation. `--role-illustrations false` omits art while retaining role palette/materials; `--role-skin none` omits the complete role skin. Preserve explicit user preferences on edits.

Reference themes: male orbital/blueprint smart-home motifs; female botanical garden/pearl flowers; senior calm mountains/sun with restrained low-opacity illustration and strong legibility; child cheerful one room/window/desk/book/lamp illustration family with a bright cream/lilac palette and a readable night counterpart. Child overview has its own playful two-tile information hierarchy and concise whole-home labels; it must not be reduced to a smaller senior overview. These are starting examples, not gender prescriptions or a closed catalog. AI may design other coherent themes (space adventure, woodland, ocean, etc.) based on user preference, varying composition and vector shapes, not merely hue. Do not introduce unrelated stickers or brand/cartoon characters. Keep app-owned labels localized and real device/space names unchanged.

The compact male overview has no large hero illustration or canvas scene linework; its three existing category tiles may carry a quiet circuit SVG in background paint. Other role overviews use one enlarged, restrained corner illustration drawn from their existing motif, with light/dark colors selected before first paint. Senior art remains quieter than child art. Keep metric cells opaque and foreground text above decoration. Space-summary card decoration stays in non-overlapping background paint; floating motif pseudo-elements are omitted from its functional rows. Use CSS background images or noninteractive pseudo-elements (`pointer-events:none`, empty content), outside the accessibility tree. Decoration must not cover labels, status, pending/error indicators, action icons or touch targets. Keep existing device and space-control card width/height/padding and all S/M/L/XL grid occupancy; scene-card role sizing follows the separate Favorite scenes contract. Apply the separately declared role-card variant for bounded corner/identity/action-zone differences; preserve each actual command order and all controls. At narrow widths reduce or omit art rather than compressing controls. Do not reinterpret a decorative star, sun, color or shape as a device state. `--role-illustrations false` also removes the compact tile SVG.

Keep the vector layer generator-owned and independent of runtime models/bridge. Ship only the selected role's small reusable art, reference CSS variables across cards, and switch colors without DOM rebuilding, requests or timers. Use closed, trusted vector markup: no scripts, event attributes, foreignObject, remote images/fonts, links or user/API strings interpolated into SVG. Inline SVG image data is permitted; it needs no PNG, network or new runtime module. Default target: under 16 KiB extra raw CSS per selected role; avoid complex filters, path-heavy illustrations and per-card SVG copies. The underlying CSS surfaces must remain legible if images are disabled.

Review the actual default and same-module comparison previews: child art should feel visibly playful and cute in both themes; all four families should be recognizable without reading role names. Check contrast, 320px and long names, decorative hit-test isolation, theme switching, unchanged card geometry/control actions and no extra requests. Screenshots/reports remain external. Art references are visual defaults only: they never enable a hidden Space control module or weaken the child's existing room selection behavior.


## Role card UI variants (independent from color and artwork)

A role dashboard must adapt the card UI itself, not only its palette, texture or illustrations. Generation resolves `roleCardVariant` and the initial `data-role-card-variant` attribute before first paint. `--role-card-variant standard|console|soft|clear|playful` is independent of role behavior, palette and SVG visibility; explicit choices win. Default male → console, female → soft, senior → clear, child → playful. `standard` restores the existing module layout while retaining a selected role's paint/art. A plain theme without a requested role/variant stays standard.

| Variant | Devices / favorites / Space details | Space summary |
|---|---|---|
| console | 18px corners, squared icon wells, squared action surfaces, subtle keylines, left-aligned numeric status | shared top icon/actions, left-aligned name/status, all-space room-chip row; role paint and bounded typography only |
| soft | consistent24px silhouette, circular icon medallions, left-aligned compact-card identity, quiet spacing without a decorative separator | shared top icon/actions, left-aligned name/status, all-space room-chip row; role paint and bounded typography only |
| clear | 16px frame, rectangular icon/control wells, stronger 17px device names and explicit readable status | shared top icon/actions, left-aligned name/status, all-space room-chip row; role paint and bounded typography only |
| playful | consistent24px silhouette, rounded badge wells, left-aligned compact identity, centered favorite icon, rounded-square controls | shared top icon/actions, left-aligned name/status, all-space room-chip row; role paint and bounded typography only |

These are extensible, reviewed UI recipes rather than gender rules. AI can choose another recipe for the user's actual preferences and may refine the bounded silhouette, icon well, hierarchy or shared summary chrome after real visual review. Do not claim fresh layout invention from changing only colors or swapping SVG. Each chosen recipe must remain coherent across light/dark and each supported card family. Larger names apply to simple rich cards and compact favorites; complex climate/camera headers retain their existing font metrics. Font treatment must fit existing text slots; retain accessible complete device names even where a visual line truncates.

Outer bounds stay stable: Home S/M/L/XL occupancy and climate/camera functional slots, 126px compact favorite/details cards, auto-height full-width speaker cards, and shared 172px all-space / 126px room Space-summary cards. Role changes do not move Space-summary icon, copy, chips or action groups. All use the same Grid and DOM reading order (top actions, copy, optional chips). The clear variant uses 56×44 icon+text actions with 8px gaps so three actions plus the category icon fit at 320px; labels use existing translations, one line with visual ellipsis and full accessible names. Controls preserve their actual handlers/order and hit targets. Other role card variants, camera 16:9 and independent speaker anatomy remain unchanged.

Validation must cover same-data comparisons for rich device cards, manually selected favorites, Space summaries and category details, not only backgrounds. Verify each recipe’s expected corner shapes, text alignment and icon wells; verify shared Space-summary coordinates, unchanged scope-specific dimensions, no overlap/out-of-card hit targets, long names, 320px, light/dark, offline states and actual action/detail entry behavior. A hidden module stays hidden even if it has a card recipe. Browser screenshots/reports stay outside the products. No additional list/definition requests, dependency installation, duplicate controls or runtime theme-driven rebuilding is needed.

For UI/UX Pro Max-derived usability refinements and their explicit H5 scope, read [role-usability-review.md](role-usability-review.md). These refinements preserve role card recipes and do not expand feature permissions or module coverage.

### 开关状态配色（2026-10-20）

- 角色只改变配色和既有圆角，不改开关语义、命令、点击区域和离线/忙碌禁用规则。开启态使用 action-on 与 action-inverse 成对颜色；关闭态使用中性底色与可辨识图标，不沿用其他主题的硬编码白色底。
- 智能页开关轨道与滑块也遵循成对颜色，深色浅强调轨道不使用白色滑块；关闭轨道保留细边界。常用设备、空间设备、空间详情的电源图标，以及加载图标，在浅/深色分别检查；浅色强调底用浅色图标，深色模式的浅色强调底用深色图标。男主人空间详情的中性按钮为浅色底，关闭图标应为深色。
- 空间详情电源状态层与按钮底层使用同一角色圆角，禁止出现圆形开启底叠在方形按钮上的双层配色。全开/全关等批量命令仍为无状态按钮，窗帘和音箱保留其独立语义。
- 显式主题优先；自定义主题必须自行提供成对的 action-on/action-inverse。角色默认配色补丁不得覆盖用户主题。检查四角色、浅深色、开/关/忙碌/离线，验证外框尺寸和写入接口不变。

## Optional directory scope

Device/Smart filtering follows [directory-space-filter-contract.md](directory-space-filter-contract.md). Roles preserve the same RN-compatible multiselect/query semantics; senior uses larger controls, child retains Home-only defaults and gets directory filtering only with explicitly enabled tabs. Home room state does not constrain or preselect optional directories, and roles are not access control. Explicit tabs/theme take precedence.

## Device setup visibility

Only male defaults `enableDevicePairing` to true. Female/senior/child default false; explicit feature intent can override, while read-only disables it. Never infer account permission from gender/age. No Devices tab means no action. See [device-pairing-contract.md](device-pairing-contract.md).

## Home space-device card detail entry

`enableSpaceDeviceDetails` is independent of device mode, theme and permissions. Default true for male or no role; default false for female, senior and child, including explicit Home space-device mode. Explicit `--enable-space-device-details true|false` overrides the default. Recompute inherited defaults when switching roles, preserving separately confirmed overrides. Role skin alone never selects this policy. Missing config values in older pages resolve from the same role defaults.

When false, Home space-device card bodies do not open the capability sheet by click, Enter or Space. Do not create their hidden detail source or detail-action marker/chevron, tabindex, dialog ARIA or clickable cursor. Keep card geometry, state/online data and inline controls unchanged. In particular retain existing direct whole-card light switching where applicable; it is not detail navigation. Guard the sheet opening function as well as omitting triggers. This is UI simplification, not authorization. Do not change favorites, Devices tab plugin entries or Space control/category detail pages.

Validate male/unscoped true, three other roles false, explicit overrides, missing-field compatibility and invalid non-Boolean inputs. Browser-check both click and keyboard, unchanged inline control writes, and unchanged independent module navigation; use generated preview fixtures, never real device operations.

The explicit light Adjust button is a scoped exception: all roles can open only model-backed brightness/color-temperature controls, without enabling card-body details or changing favorite selection/data.

Run `scripts/profile_space_device_details.mjs <preview-workspace>` with existing Playwright/browser paths for this policy.

### Senior geometry exception

For `role=senior`, the [senior sizing contract](senior-sizing-contract.md) supersedes the ordinary 126px/172px and clear-variant font/target sizes above. The shared summary DOM and functional slots remain; narrow screens use a deterministic two-row top region. `roleSkin`/card-variant choices alone do not enable this tier.

Senior and child daily-use content/source/default-scene rules are in [daily-use-role-contract.md](daily-use-role-contract.md); both default to Home only, while confirmed extra tabs remain supported.

For the current coordinated role paint and light-card hierarchy, follow [role-usability-review.md](role-usability-review.md#cohesive-role-presentation-2026-10-23). Shared occupancy and control slots remain authoritative.

Senior/child ordering invariant: favoriteScenes precedes devices in either Home device mode, including explicit order edits. Senior/child select at most six suitable enabled real scenes without unrelated fill or official metadata; generic/male/female saved account selections remain authoritative.

### Compact male and default overview

Male/unscoped generation defaults to `overviewLayout=compact` when category entries are enabled and metrics are not explicitly overridden. Three 78px-min category shortcuts replace the hero; “家庭数据 / Home details” is initially collapsed and contains the same six metrics, source coverage and freshness. Toggle performs no request, retains keyboard focus and uses native details semantics. Custom explicit metrics default to standard presentation; `--overview-layout standard|compact` is an explicit override, compact requires category entries. Two-column scene shortcuts are min76px with neutral 20px decorative icons, real names and reserved execution feedback. No scene/control/filter/metadata semantics change.

Male default theme uses royal blue for light-mode actions and electric blue for dark-mode actions; violet is decorative ambient paint only, never a second on/off or failure signal. Light mode remains cool silver-blue; dark mode uses near-black navy with readable pale text. No flashing, animated scanning grids, neon text glow or card geometry changes. Preserve compact category overview, collapsed data, two-column scenes, header and all business contracts. Existing explicit themes/custom tokens and `--role-skin none` retain precedence.
