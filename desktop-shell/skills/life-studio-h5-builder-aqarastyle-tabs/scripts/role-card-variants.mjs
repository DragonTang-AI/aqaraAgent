// Generator-only UI variants. Shared entities, control nodes and write handlers stay intact.
export const roleCardVariants={male:'console',female:'soft',senior:'clear',child:'playful'};
export const cardVariantIds=['standard',...Object.values(roleCardVariants)];
export function roleCardCSS(variant){
 if(variant==='standard')return '';
 if(!cardVariantIds.includes(variant))throw new Error('Invalid role card variant');
 const b=`:root[data-role-card-variant="${variant}"]`;
 const spec={console:{radius:'18px',badge:'10px',action:'10px',weight:600,align:'left'},soft:{radius:'24px',badge:'50%',action:'50%',weight:500,align:'left'},clear:{radius:'16px',badge:'8px',action:'8px',weight:700,align:'left'},playful:{radius:'24px',badge:'16px 16px 10px 16px',action:'14px',weight:600,align:'left'}}[variant];
 const shared=`
${b} .device-card,${b} .fd-card,${b} .space-summary-card,${b} .space-device-card{border-radius:${spec.radius}}
${b} .device-icon,${b} .fd-card:not(.fd-speaker-card) .fd-icon-slot,${b} .space-device-icon{border-radius:${spec.badge};box-shadow:inset 0 0 0 1px var(--aqara-border-default);background:var(--role-icon-well,rgba(120,128,155,.08))}
${b} .space-summary-top>.space-category-icon{box-sizing:border-box;border-radius:${spec.badge};background:rgba(120,128,155,.10);box-shadow:inset 0 0 0 1px var(--aqara-border-default)}
${b} .device-card:not(.has-climate-panel):not(.category-camera) .device-meta strong,${b} .fd-copy strong,${b} .space-device-copy strong,${b} .space-summary-copy strong{font-weight:${spec.weight}}
${b} .fd-card:not(.fd-speaker-card) .fd-action::before,${b} .space-circle-action::before,${b} .space-power-glyph,${b} .device-card:not(.aqara-size-s) .device-toggle::before{border-radius:${spec.action}}
${b} .aqara-size-m .device-meta,${b} .fd-card:not(.fd-speaker-card) .fd-copy,${b} .space-device-copy{text-align:${spec.align}}
`;
 const variants={
 console:`
${b} .device-meta>span,${b} .fd-copy>span,${b} .space-device-copy>span{letter-spacing:.02em;font-variant-numeric:tabular-nums}
${b} .aqara-size-m .device-meta{border-top:1px solid transparent;padding-top:4px}
${b} .fd-card:not(.fd-speaker-card) .fd-copy{padding-left:8px;border-left:2px solid transparent}
${b} .space-device-copy{padding-left:8px;border-left:2px solid transparent}
${b} .space-stat-chip{border-radius:8px}
`,
 soft:`
${b} .device-icon,${b} .fd-card:not(.fd-speaker-card) .fd-icon-slot,${b} .space-device-icon{box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 3px 8px var(--role-paper-shadow,rgba(0,0,0,.06))}
${b} .fd-card:not(.fd-speaker-card) .fd-copy strong,${b} .space-device-copy strong{letter-spacing:.01em}
${b} .space-device-copy{border-top:1px solid transparent;padding-top:3px}
${b} .space-stat-chip{border-radius:999px}
`,
 clear:`
${b} .device-card:not(.has-climate-panel):not(.category-camera) .device-meta strong,${b} .fd-copy strong{font-size:17px;line-height:22px}
${b} .device-card:not(.has-climate-panel):not(.category-camera) .device-meta>span{font-size:12px;line-height:16px;opacity:1}
${b} .space-device-copy strong{font-size:17px;line-height:24px}
${b} .fd-copy>span,${b} .space-device-copy>span{font-weight:500}
${b} .space-stat-chip{border-radius:6px;font-size:14px;font-weight:600}
${b} .space-summary-card .space-circle-action{width:56px;min-width:56px;display:flex;flex-direction:column;justify-content:center;gap:0}
${b} .space-summary-card .space-action-image{height:24px}
${b} .space-summary-card .space-summary-actions{gap:8px}
${b} .space-action-label{font-size:13px;line-height:16px;font-weight:600;white-space:nowrap;color:var(--role-control-ink,var(--text))}
`,
 playful:`
${b} .fd-card:not(.fd-speaker-card) .fd-top{align-self:center}
${b} .device-icon,${b} .fd-card:not(.fd-speaker-card) .fd-icon-slot,${b} .space-device-icon{box-shadow:inset 0 0 0 2px var(--aqara-border-default),0 2px 0 var(--role-ambient,rgba(0,0,0,.10))}
${b} .space-stat-chip{border-radius:12px 8px 12px 8px}
`};
 // Summary structure is module-owned for every role; roles retain paint and bounded typography.
 return '\n/* Independent role card UI; shared Space-summary geometry. */\n'+shared+variants[variant]+`
${b} .space-summary-copy strong{font-size:${variant==='clear'?'18px':'16px'};line-height:24px}
${b} .space-stat-chips{justify-content:flex-start}
`;
}
