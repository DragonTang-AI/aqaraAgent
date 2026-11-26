# Senior large-size tier

`role=senior` enables `scripts/senior-sizing.mjs` at generation time, including explicit custom themes, skin none and standard card variants. Other roles receive no sizing CSS. No page zoom, deferred resize, network or control-handler changes. Theme paint stays independent. On role changes regenerate or remove/apply the same isolated tier; do not retain senior CSS under another role.

## Geometry and typography

- Main page titles keep current module-specific size (the shared Home Studio-name heading is32px/44px; directory title remains 34px); section headings24/32, device/scene names20/26–28, state/room16/22–24, overview values36/44 and metric labels16/24. Secondary hints14/22 minimum. Do not enlarge Home's compact toolbar to a 34px hero title.
- Favorite device two columns at >350px, height160px; icon48, action52. Preserve layered image asset coordinates; scale only their parent slot. Names remain bounded/truncated, full accessible names retained.
- Speaker remains independent and full width, auto height, minimum160; transport52, primary play/pause60; volume hit height52/thumb32. Do not merge separate endpoints or infer unsupported commands.
- Favorite scenes two columns, minimum122 with natural128px content at standard two-line settings; separate28px decorative icon row and names at20/28, maximum two lines. Identical24px result/pending icon slots prevent state feedback moving text. At <=350px use one column (also favorite devices and Space-detail cards).
- Summary: shared DOM top/copy/chips. >350px room160/all204; rows52/52/(40), gap12,padding16; category icon48; actions64x52, gap8, readable14px existing labels for clear variant. At <=350px top uses icon48 then actions52 with8 gap, room216/all268. Do not compress three actions alongside the icon on narrow screens. Same responsive arrangement across all categories/states.
- Space-detail cards160 high. Space-rich S/M/L/XL retain type mapping, column/row spans and functional slots, grid rows min78/column gap12 with Home row gap16, S min80,M/L min168,non-light XL min348; Home lights always use M min168 with52px power/Adjust targets and lazy52px sheet controls; climate remains content-aware, camera16:9 unchanged. Do not apply summary/favorite geometry to rich cards.
- Directory and favorite selection rows min92; name20,state16; rows may grow naturally. Editor header60/back52, confirm56. Preserve existing back-button focus/reset policy, never add permanent borders.
- Tab label15,target min64; preserve safe-area/content clearance and single-plane top chrome.

## Maintenance validation

Use installed browser tools only; no dependency/browser installs. `profile_senior_sizing.mjs <workspace> --screenshots <external-dir> --playwright-module <existing> --browser <existing>` on default favorites and explicit space-card products. Cover320/375/390/430,zh-CN/zh-TW/en,light/dark,all/room,three summary categories,long names,scene pending/success/failure,device online/offline and editor cancel/navigation. Check containment/hit areas, no page horizontal overflow, no delayed sizing shift. Verify non-senior generator receives no tier and run existing data/control regression gates. Browser mock checks do not establish native/physical execution; user owns build/device verification. Keep all screenshots/logs outside deliveries. Agent sandbox's existing reduced static gates still apply on that platform.

The shared Home header is an explicit common-size boundary: title32/44,status14/20,Mine52 target. Its navigation anatomy is not enlarged by the senior card tier.
