# Shared Home header layout

Applies to every generated Home, without a role/theme opt-out. Visual reference is the user-provided 2026-10-23 screenshot, limited to the navigation, Studio name and connection line; it does not authorize copying lower cards, tabs, AI panel, sample names or data. Do not package the screenshot or rely on a developer filesystem path.

## Shared anatomy

1. System safe area: reuse existing native/browser inset handling. Do not draw phone clock, Wi-Fi, battery or a fake status bar.
2. Navigation `#topbar`: sticky44px row, no fill/shadow/independent blur, existing shared scroll material only. Mine is left; existing supported trailing action (currently Refresh) stays right. Ignore the screenshot's trailing ellipsis for functionality.
3. Mine: shared local SVG `viewBox 0 0 24 24`, path `M4 6h16M4 12h12M4 18h8`, round2px strokes,26px glyph in52px target; left target extends12px outside the content gutter for visual alignment. Three strokes decrease in length from top to bottom, same left edge. No avatar/person/circle, permanent colored well, shadow or glass disk. Preserve keyboard focus feedback and current openNavigationDrawer handler/capability checks; it is not a new route.
4. `home-studio-heading` inside Home panel below nav: one-line32px/44px, weight700, separate from buttons, full content width. Fixed44px slot, ellipsis for long names and complete title/accessible text. Use actual native studioName; not configured page title, space root or screenshot text. Gap from nav12px; gap to status8px. No branding eyebrow. The screenshot's title caret is shown only when a genuine supported Studio-selection action exists; do not add a decorative fake dropdown/button.
5. Connection: plain14px/20px text, fixed20px slot, no capsule, dot, border, fill or blur;24px bottom spacing. Chinese cloud text `远程访问 Studio 中`, local `局域网访问 Studio 中`; Traditional Chinese/English use equivalent existing localization keys. Loading/error/unknown stay truthful native states. Error text can use semantic error ink. Never hardcode cloud/local or infer connection from a successful API request.

Use semantic text/secondary colors over the continuous theme canvas; match the light reference hierarchy and adapt contrast in dark/custom themes. Geometry and glyph are shared even for senior/child; their existing card size tiers/materials remain unchanged. Decorative page SVG starts below the header (safe-top+160px); do not repeat an earlier art tile back into the header. Overview/card illustrations remain module-owned. Do not add an opaque header rectangle to hide theme art.

Only the navigation row sticks; large title and status scroll with Home content. Home title/status are hidden with Home on Devices/Smart, which retain their own headings. Preserve body::before single-plane scroll guard, measured nav height, rAF-coalesced scroll handling and reduced-transparency behavior. No post-load header relocation: text updates cannot change row/title/status heights. Keep header outside configurable Home-module reordering.

## Maintenance validation

`profile_shared_home_header.mjs <comparison-parent> --qa-output <external-dir> --playwright-module <existing> --browser <existing>` checks generic/male/female/senior/child at320/390 in light/dark/three locales, exact SVG/52px hit box, separate32px title, plain20px status, actual local/cloud/error/unknown updates, long-title bounds, no HTTP on same-identity header updates, unchanged card DOM, Mine bridge, no fake selector, source-independent safe text and single-Home/explicit multi-Tab visibility. Use the existing native status/scroll-background/Home-layout and role/preview/portability gates. Browser simulations do not establish native or physical-device acceptance; build remains user-owned. Never install dependencies/browsers. Keep screenshots/reports outside deliveries.

Same-identity name/local/cloud/error updates preserve data and request budget. Unknown status deliberately clears identity under the existing bridge contract; recovering identity can legitimately reread metadata. Validate that separately, never bypass the isolation to satisfy a visual test.

Check card identity immediately around same-identity native header updates. Existing full-page locale rendering may legitimately rebuild localized cards; do not misattribute that baseline behavior to the header or change it in this visual task.
