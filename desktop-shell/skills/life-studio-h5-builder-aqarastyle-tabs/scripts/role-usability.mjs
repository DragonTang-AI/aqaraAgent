// Generation-only role polish. No listeners, requests, geometry or state inference.
export function roleUsabilityCSS(role,{palette=true}={}){
 if(role==='none')return '';
 const b=`:root[data-role-skin="${role}"]`;
 return `\n/* Role usability: readable overview, stable press feedback and contextual focus. */
${b} .summary-grid dt{font-size:${role==='senior'?13:12}px;line-height:18px;opacity:1;color:var(--aqara-text-secondary);word-break:keep-all;overflow-wrap:break-word;overflow-wrap:anywhere}
${b} .overview-coverage,${b} .freshness{font-size:12px;line-height:18px;opacity:1;color:var(--aqara-text-secondary)}
${b} .device-card,${b} .fd-card,${b} .space-summary-card,${b} .space-device-card{scroll-margin-top:calc(var(--safe-top) + 76px);scroll-margin-bottom:calc(var(--safe-bottom) + 110px)}
${b} .device-toggle::before,${b} .fd-action::before,${b} .space-circle-action::before{transition:opacity .12s ease-out}
${b} .device-toggle:not(:disabled):not([aria-busy="true"]):active::before,${b} .fd-action:not(:disabled):not([aria-busy="true"]):active::before,${b} .space-circle-action:not(:disabled):not([aria-busy="true"]):active::before{opacity:.72}
${b} .space-summary-copy:active{opacity:.75}
${b} .aqara-size-s.category-light .device-toggle:not(:disabled):active{background:rgba(120,128,155,.12)}
@media(hover:hover) and (pointer:fine){${b} .device-toggle:not(:disabled):hover::before,${b} .fd-action:not(:disabled):hover::before,${b} .space-circle-action:not(:disabled):hover::before{opacity:.86}}
@media(prefers-reduced-motion:reduce){${b} .device-toggle::before,${b} .fd-action::before,${b} .space-circle-action::before{transition:none}}
`+(palette?`
${b}{--focus-ring:var(--aqara-action)}
${b} .space-summary-card,${b} .space-device-card{--focus-ring:var(--role-panel-ink,var(--aqara-action))}
/* Stateful power surfaces and inks are paired, including pending glyphs. */
${b}{--favorite-device-action-surface:var(--canvas);--aqara-action-off:var(--canvas)}
${b} .automation-switch::before{box-shadow:inset 0 0 0 1px var(--aqara-border-default)}
${b} .automation-switch[aria-checked="true"]::after{background:var(--aqara-action-inverse)}
${b} .device-toggle:not([aria-checked="true"]){color:var(--aqara-text-primary)}
${b} .aqara-size-s.category-light .device-row>.device-toggle{color:transparent}
${b} .space-power-glyph:not(.is-on){background:var(--role-control-surface)}
${b}[data-theme="dark"] .fd-action.is-on:not(.is-curtain) .fd-action-glyph img,${b}[data-theme="dark"] .space-power-glyph.is-on img,${b}[data-theme="dark"] .fd-action.is-on .fd-spinner{filter:brightness(0);opacity:1}
${b} .space-circle-action .space-fixed-loading{filter:brightness(0)}
${role==='male'?'':`${b}[data-theme="dark"] .space-circle-action .space-fixed-loading{filter:brightness(0) invert(1)}`}
`: '');
}
