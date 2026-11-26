// Generation-only accessible size tier. No state, network, listeners or role paint.
export function seniorSizingCSS(config){
 if(config.role!=='senior')return '';
 return `
/* Senior large tier: resolved before first paint, independent of theme/role skin. */
:root[data-role="senior"]{--senior-name:20px;--senior-status:16px;--senior-touch:52px;--senior-icon:48px;--senior-card:160px}
:root[data-role="senior"] h2,:root[data-role="senior"] #scene-section .section-heading h2,:root[data-role="senior"] #space-control-heading{font-size:24px;line-height:32px}
:root[data-role="senior"] .summary-grid dd{font-size:28px;line-height:36px}
:root[data-role="senior"] .summary-grid dt{font-size:16px;line-height:24px}
:root[data-role="senior"] .hero-copy #summary-label{font-size:24px;line-height:32px}
:root[data-role="senior"] .freshness,:root[data-role="senior"] .overview-coverage,:root[data-role="senior"] .section-note,:root[data-role="senior"] .notice,:root[data-role="senior"] .toast,:root[data-role="senior"] .pull-indicator{font-size:14px;line-height:22px}
:root[data-role="senior"] .icon-button,:root[data-role="senior"] .favorite-scenes-edit,:root[data-role="senior"] .directory-filter,:root[data-role="senior"] .directory-search-close,:root[data-role="senior"] .scene-execute{width:52px;height:52px;min-height:52px}
:root[data-role="senior"] .icon-button svg{width:26px;height:26px}
:root[data-role="senior"] .fd-card:not(.fd-speaker-card){height:var(--senior-card)}
:root[data-role="senior"] .fd-top{height:52px}
:root[data-role="senior"] .fd-icon-slot{width:48px;height:48px}
/* Keep the existing layered endpoint asset coordinates; enlarge its single containing slot. */
:root[data-role="senior"] .fd-icon-slot>.fd-icon{transform:scale(1.2);transform-origin:top left}
:root[data-role="senior"] .fd-copy strong,:root[data-role="senior"] .fd-speaker-entry strong,:root[data-role="senior"] .space-device-copy strong{font-size:20px;line-height:26px}
:root[data-role="senior"] .fd-copy>span,:root[data-role="senior"] .fd-speaker-entry>span>span,:root[data-role="senior"] .space-device-copy>span{font-size:16px;line-height:22px}
:root[data-role="senior"] .fd-action{width:52px;height:52px;right:14px;top:14px}
:root[data-role="senior"] .fd-action::before{width:48px;height:48px}
:root[data-role="senior"] .fd-speaker-card{min-height:160px;gap:16px}
:root[data-role="senior"] .fd-speaker-entry>svg{width:48px;height:48px;flex-basis:48px}
:root[data-role="senior"] .fd-speaker-card button:not(.fd-speaker-entry){width:52px;height:52px;min-height:52px;flex-basis:52px}
:root[data-role="senior"] .fd-speaker-card button[data-speaker-action="play"],:root[data-role="senior"] .fd-speaker-card button[data-speaker-action="pause"]{width:60px;height:60px;min-height:60px;flex-basis:60px}
:root[data-role="senior"] .fd-speaker-volume{font-size:16px;min-height:52px;flex-wrap:wrap}
:root[data-role="senior"] .fd-speaker-volume input{height:52px;min-width:64px}
:root[data-role="senior"] .fd-speaker-volume input::-webkit-slider-thumb{width:32px;height:32px}
:root[data-role="senior"] .fd-speaker-volume input::-moz-range-thumb{width:32px;height:32px}
:root[data-role="senior"] .fd-speaker-hint{font-size:14px;line-height:22px}
:root[data-role="senior"] .favorite-scene{min-height:80px;font-size:20px;line-height:26px;gap:8px}
:root[data-role="senior"] .favorite-scene-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:anywhere}
/* Reserve identical success/failure/pending icon bounds. */
:root[data-role="senior"] .favorite-scene-status,:root[data-role="senior"] .favorite-scene-status.is-success{width:24px;height:24px;flex:0 0 24px;margin:0}
:root[data-role="senior"] .ai-assistant-card{min-height:80px;padding:16px}
:root[data-role="senior"] #ai-assistant-title{font-size:20px;line-height:28px}
:root[data-role="senior"] .ai-assistant-chip{font-size:16px;line-height:24px;min-height:48px;display:flex;align-items:center}
:root[data-role="senior"] .filter-chip,:root[data-role="senior"] .space-chip,:root[data-role="senior"] .fd-space-chip{min-height:52px;font-size:17px;line-height:24px}
:root[data-role="senior"] .space-summary-card{height:160px;grid-template-rows:52px 52px;gap:12px;align-content:start}
:root[data-role="senior"] .space-summary-card[data-scope="*"]{height:204px;grid-template-rows:52px 52px 40px}
:root[data-role="senior"] .space-summary-top{height:52px;grid-template-columns:48px minmax(0,1fr);gap:12px}
:root[data-role="senior"] .space-summary-top>.space-category-icon{width:48px;height:48px}
:root[data-role="senior"] .space-summary-actions{height:52px;gap:8px}
:root[data-role="senior"] .space-summary-card .space-circle-action{width:64px;min-width:64px;height:52px;display:flex;flex-direction:column;justify-content:center;gap:0}
:root[data-role="senior"] .space-action-label{font-size:14px;line-height:20px}
:root[data-role="senior"] .space-summary-copy strong{font-size:20px;line-height:28px}
:root[data-role="senior"] .space-summary-copy>span{font-size:16px;line-height:24px}
:root[data-role="senior"] .space-stat-chips{height:40px}
:root[data-role="senior"] .space-stat-chip{font-size:16px;line-height:24px;min-height:40px}
:root[data-role="senior"] .space-device-card{height:160px}
:root[data-role="senior"] .space-device-top{height:52px}
:root[data-role="senior"] .space-device-top>img{width:48px;height:48px}
:root[data-role="senior"] .space-circle-action{width:52px;min-width:52px;height:52px}
:root[data-role="senior"] .space-detail footer button{min-height:52px;font-size:18px}
:root[data-role="senior"] .space-detail-back{width:52px;height:52px}
:root[data-role="senior"] .directory-row,:root[data-role="senior"] .fd-choice,:root[data-role="senior"] .favorite-choice{min-height:92px}
:root[data-role="senior"] .directory-copy strong,:root[data-role="senior"] .fd-choice-copy strong,:root[data-role="senior"] .favorite-choice{font-size:20px;line-height:28px}
:root[data-role="senior"] .directory-meta,:root[data-role="senior"] .fd-choice-copy>span,:root[data-role="senior"] .favorite-choice small{font-size:16px;line-height:24px}
:root[data-role="senior"] .directory-icon,:root[data-role="senior"] .directory-icon img{width:48px;height:48px;max-width:48px;max-height:48px}
:root[data-role="senior"] .directory-group-title,:root[data-role="senior"] .directory-message,:root[data-role="senior"] .directory-filter-note{font-size:16px;line-height:24px}
:root[data-role="senior"] .directory-space,:root[data-role="senior"] .space-filter-choice,:root[data-role="senior"] .directory-filter-option{min-height:52px;font-size:18px}
:root[data-role="senior"] .directory-range-toolbar .directory-space{max-width:calc(100% - 62px)}
:root[data-role="senior"] .directory-search input{font-size:18px}
:root[data-role="senior"] .smart-segment-tab{min-height:52px;font-size:18px}
:root[data-role="senior"] .fd-editor>header,:root[data-role="senior"] .favorite-editor header{height:60px;flex:0 0 60px;grid-template-columns:52px minmax(0,1fr) 52px}
:root[data-role="senior"] .fd-editor>header h2,:root[data-role="senior"] .favorite-editor header h2{font-size:20px;line-height:28px}
:root[data-role="senior"] .fd-editor>header button,:root[data-role="senior"] .favorite-editor header button{width:52px;height:52px}
:root[data-role="senior"] .fd-editor>footer button,:root[data-role="senior"] .favorite-editor footer button,:root[data-role="senior"] .directory-filter-actions button{min-height:56px;font-size:18px}
:root[data-role="senior"] .studio-tabbar button{min-height:64px;font-size:15px}
:root[data-role="senior"] .studio-tabbar svg{width:28px;height:28px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-grid{grid-auto-rows:minmax(78px,auto);gap:12px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card{padding:16px;min-height:168px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card.aqara-size-s{min-height:80px;grid-template-columns:48px minmax(0,1fr);grid-template-rows:48px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card.aqara-size-m,:root[data-role="senior"][data-ui-profile="aqara"] .device-card.aqara-size-l{min-height:168px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card.aqara-size-xl{min-height:348px}

:root[data-role="senior"][data-ui-profile="aqara"] .device-icon{width:48px;height:48px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card:not(.has-climate-panel):not(.category-camera) .device-meta strong{font-size:20px;line-height:26px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card:not(.has-climate-panel):not(.category-camera) .device-meta>span{font-size:16px;line-height:22px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card:not(.aqara-size-s) .device-toggle{width:52px;height:52px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-toggle::before{width:48px;height:48px}
:root[data-role="senior"][data-ui-profile="aqara"] .device-card.aqara-size-l{grid-template-columns:48px minmax(0,1fr) 52px;grid-template-rows:52px minmax(62px,auto) auto}
:root[data-role="senior"] .range-control input{min-height:52px}
:root[data-role="senior"][data-ui-profile="aqara"] .range-control input::-webkit-slider-thumb{width:36px;height:36px}
:root[data-role="senior"] .capability-sheet-copy strong{font-size:20px;line-height:28px}
:root[data-role="senior"] .capability-sheet-subtitle,:root[data-role="senior"] .capability-sheet-content .capability-control-row>span{font-size:16px;line-height:24px}
:root[data-role="senior"] .directory-heading h2{font-size:34px;line-height:44px}
:root[data-role="senior"] .directory-navigation{height:52px}
:root[data-role="senior"] .directory-menu,:root[data-role="senior"] .directory-add-device,:root[data-role="senior"] .directory-search-clear{width:52px;height:52px;min-height:52px}
:root[data-role="senior"] .directory-search,:root[data-role="senior"] .directory-search-input{min-height:52px}
:root[data-role="senior"] .directory-count,:root[data-role="senior"] .space-detail header p,:root[data-role="senior"] .space-detail-groups h3{font-size:16px;line-height:24px}
:root[data-role="senior"] .automation-switch{height:52px;min-height:52px}
:root[data-role="senior"] .automation-switch::before{top:12px;bottom:12px}
:root[data-role="senior"] .automation-switch::after{top:14px}
:root[data-role="senior"][data-ui-profile="aqara"] .has-climate-panel .device-meta strong,:root[data-role="senior"] .category-camera .device-meta strong{font-size:20px;line-height:26px}
:root[data-role="senior"][data-ui-profile="aqara"] .has-climate-panel .device-meta>span,:root[data-role="senior"] .category-camera .device-meta>span{font-size:16px;line-height:22px}
:root[data-role="senior"] .climate-current span,:root[data-role="senior"] .climate-target>span,:root[data-role="senior"] .climate-selectors label>span{font-size:14px;line-height:22px;opacity:1}
:root[data-role="senior"] .device-select,:root[data-role="senior"] .command-button,:root[data-role="senior"] .range-control{font-size:16px}
:root[data-role="senior"] .device-select{min-height:52px}
:root[data-role="senior"] .climate-current strong{font-size:32px}
:root[data-role="senior"] .camera-stream-status{font-size:14px}
:root[data-role="senior"] .camera-stream-button{min-height:52px;font-size:16px}
:root[data-role="senior"] .space-overview-links button{min-height:52px;font-size:16px}
:root[data-role="senior"] .fd-empty,:root[data-role="senior"] .favorite-scenes-empty{font-size:16px;line-height:24px}
@media(max-width:350px){
 :root[data-role="senior"] .favorite-devices-grid,:root[data-role="senior"] .favorite-scenes-grid,:root[data-role="senior"] .space-device-grid{grid-template-columns:minmax(0,1fr)}
 :root[data-role="senior"] .space-summary-card{height:216px;grid-template-rows:108px 52px}
 :root[data-role="senior"] .space-summary-card[data-scope="*"]{height:268px;grid-template-rows:108px 52px 40px}
 :root[data-role="senior"] .space-summary-top{height:108px;grid-template-columns:minmax(0,1fr);grid-template-rows:48px 52px;gap:8px}
 :root[data-role="senior"] .space-summary-actions{justify-content:flex-end;width:100%;gap:8px}
 :root[data-role="senior"][data-ui-profile="aqara"] .device-card{padding:12px}
}
`;
}
