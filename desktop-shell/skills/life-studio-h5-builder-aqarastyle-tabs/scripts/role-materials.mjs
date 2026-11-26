// Generator-only visual language. No geometry, new controls, state inference or animation.
export function roleMaterialsCSS(role,{palette=true}={}){
 if(role==='none')return '';
 const base=`:root[data-role-skin="${role}"]`;
 const variables=['light','dark'].map((mode,i)=>{
  const dark=Boolean(i),male=role==='male',ink=male&&palette?'#edf8ff':'var(--aqara-text-primary)',pane=male&&palette?(dark?'#10213b':'#17334c'):'var(--aqara-card-primary)';
  return `${base}[data-theme="${mode}"]{--role-overview-start:${palette?'var(--overview-start)':'var(--aqara-card-primary)'};--role-overview-end:${palette?'var(--overview-end)':'var(--canvas)'};--role-panel:${pane};--role-panel-ink:${ink};--role-panel-muted:${male&&palette?'#b8d4e8':'var(--aqara-text-secondary)'};--role-panel-line:${male&&palette?'rgba(90,215,245,.28)':'var(--aqara-border-default)'};--role-highlight:${dark?'rgba(255,255,255,.08)':'rgba(255,255,255,.94)'};--role-ambient:${dark?'rgba(0,0,0,.22)':'rgba(75,57,40,.09)'};--role-grid-line:${male&&palette?'rgba(181,219,247,.07)':'rgba(105,145,180,.10)'};--role-aura:${!palette?'transparent':role==='female'?(dark?'rgba(176,111,155,.18)':'rgba(196,137,170,.19)'):role==='child'?(dark?'rgba(166,142,207,.06)':'rgba(181,157,212,.09)'):role==='senior'?'rgba(194,178,136,.05)':'rgba(154,151,141,.05)'};--role-control-ink:${male&&palette?'#10243a':'var(--aqara-text-primary)'};--role-control-surface:${male&&palette?'#d9eff5':'var(--aqara-card-primary)'};--role-paper-shadow:${dark?'rgba(0,0,0,.18)':'rgba(75,57,40,.07)'};}`;
 }).join('\n');
 const shared=`
${base} .space-summary-card{color:var(--role-panel-ink)}
${base} .space-summary-copy{color:inherit}
${base} .space-summary-copy>span{color:var(--role-panel-muted)}
${base} .space-device-card{color:var(--role-panel-ink)}
${base} .space-device-copy>span{color:var(--role-panel-muted)}
${base} .space-summary-card,${base} .space-device-card{--space-action-surface:var(--role-control-surface)}
${base} .ai-assistant-card{background:var(--role-card-surface);color:var(--role-card-ink);box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 3px 10px var(--role-paper-shadow)}
${base} .ai-assistant-chip{background:var(--canvas);color:var(--secondary)}
${base} .favorite-scene{color:var(--role-card-ink)}
${base}[data-role-card-variant] .device-card.category-light:not(.is-offline) .device-icon{background:transparent;box-shadow:none}
${base}[data-role-card-variant] .device-card.category-light.is-on:not(.is-offline) .device-icon{background:radial-gradient(ellipse at center,rgba(240,192,104,.16),transparent 72%)}
${base} .device-meta>span{font-variant-numeric:tabular-nums}

`;
 // These surfaces belong only to the built-in role palettes. A requested style or
 // theme-token file continues to own every paint decision for its selected role.
 const defaultRoleSurfaces=palette&&role==='senior'?`
${base}[data-theme="light"]{--role-overview-panel:#dfeade;--role-scene-panel:#f1ead8;--role-device-panel:#fffefa;--role-accent-line:#9eb8a5;--role-warm-line:#c5bba0}
${base}[data-theme="dark"]{--role-overview-panel:#355343;--role-scene-panel:#464539;--role-device-panel:#304138;--role-accent-line:#789b82;--role-warm-line:#968c6e}
${base} .hero-card{background:var(--role-overview-panel);border-color:var(--role-accent-line);box-shadow:inset 0 0 0 1px var(--role-accent-line)}
${base} .summary-grid div{background:var(--role-device-panel);border-color:var(--role-accent-line)}
${base} .favorite-scene{background:var(--role-scene-panel);box-shadow:inset 0 0 0 1px var(--role-warm-line)}
${base} .fd-card:not(.is-offline),${base} .device-card:not(.is-offline){background:var(--role-device-panel);box-shadow:inset 0 0 0 1px var(--role-accent-line)}
`:palette&&role==='child'?`
${base}[data-theme="light"]{--role-overview-panel:linear-gradient(135deg,#e8e0f9,#f8eadb);--role-metric-panel:#fffaf6;--child-temperature-panel:#e5def8;--child-humidity-panel:#e4f3eb;--role-scene-a:#f0e9fa;--role-scene-b:#e9f3ed;--role-scene-c:#f9eddf;--role-scene-d:#eaf0fa;--role-device-panel:#f5effb;--role-accent-line:#d4c5e8}
${base}[data-theme="dark"]{--role-overview-panel:linear-gradient(135deg,#403758,#514559);--role-metric-panel:#373a4e;--child-temperature-panel:#514466;--child-humidity-panel:#38534f;--role-scene-a:#463b60;--role-scene-b:#354c4a;--role-scene-c:#554637;--role-scene-d:#37465f;--role-device-panel:#3d3854;--role-accent-line:#73618d}
${base} .hero-card{background:var(--role-overview-panel);border-color:var(--role-accent-line);box-shadow:inset 0 0 0 1px var(--role-accent-line),0 8px 24px var(--role-paper-shadow)}
${base} .summary-grid div{background:var(--role-metric-panel);border-color:var(--role-accent-line)}
${base} .favorite-scene-icon{background:var(--role-metric-panel)}
${base} .favorite-scene{background:var(--role-scene-a);box-shadow:inset 0 0 0 1px var(--role-accent-line),0 4px 12px var(--role-paper-shadow)}
${base} .favorite-scene:nth-child(4n + 2){background:var(--role-scene-b)}
${base} .favorite-scene:nth-child(4n + 3){background:var(--role-scene-c)}
${base} .favorite-scene:nth-child(4n){background:var(--role-scene-d)}
${base} .device-card:not(.is-offline){background:var(--role-device-panel);box-shadow:inset 0 0 0 1px var(--role-accent-line),0 4px 12px var(--role-paper-shadow)}
`:palette&&role==='female'?`
/* Pearl, rose and amethyst are presentation only; plum remains the sole action color. */
${base}[data-theme="light"]{--role-overview-panel:linear-gradient(132deg,#f2dce5 0%,#eee0ef 53%,#f9eddc 100%);--role-metric-panel:#fffbfa;--role-scene-a:linear-gradient(145deg,#f8e7e8,#fff7f2);--role-scene-b:linear-gradient(145deg,#eee4f4,#faf3fc);--role-scene-c:linear-gradient(145deg,#f8ecd9,#fff8ed);--role-scene-d:linear-gradient(145deg,#e8e1ee,#f6eef7);--role-device-panel:#fffaf9;--role-space-panel:#f9edf2;--role-accent-line:rgba(145,103,142,.25);--role-gold-line:rgba(179,143,92,.34)}
${base}[data-theme="dark"]{--role-overview-panel:linear-gradient(132deg,#54374f 0%,#3c304b 55%,#574052 100%);--role-metric-panel:#3b3045;--role-scene-a:linear-gradient(145deg,#4a3446,#3b2c3e);--role-scene-b:linear-gradient(145deg,#443453,#342d45);--role-scene-c:linear-gradient(145deg,#51404a,#423444);--role-scene-d:linear-gradient(145deg,#483650,#382e43);--role-device-panel:#362c3d;--role-space-panel:#3a2e43;--role-accent-line:rgba(232,188,215,.26);--role-gold-line:rgba(224,191,149,.27)}
${base} .hero-card{background:var(--role-overview-panel);border-color:var(--role-accent-line);box-shadow:inset 0 1px 0 var(--role-highlight),inset 0 0 0 1px var(--role-gold-line),0 12px 30px var(--role-paper-shadow)}
${base} .summary-grid div,${base} .space-overview-links button{background:var(--role-metric-panel);border-color:var(--role-accent-line)}
${base} .favorite-scene{background:var(--role-scene-a);box-shadow:inset 0 1px 0 var(--role-highlight),inset 0 0 0 1px var(--role-gold-line),0 6px 16px var(--role-paper-shadow)}
${base} .favorite-scene:nth-child(4n + 2){background:var(--role-scene-b)}
${base} .favorite-scene:nth-child(4n + 3){background:var(--role-scene-c)}
${base} .favorite-scene:nth-child(4n){background:var(--role-scene-d)}
${base} .fd-card:not(.is-offline),${base} .device-card:not(.is-offline){background:var(--role-device-panel);box-shadow:inset 0 1px 0 var(--role-highlight),inset 0 0 0 1px var(--role-accent-line),0 8px 20px var(--role-paper-shadow)}
${base} .space-summary-card,${base} .space-device-card{background:linear-gradient(145deg,var(--role-device-panel),var(--role-space-panel));box-shadow:inset 0 1px 0 var(--role-highlight),inset 0 0 0 1px var(--role-accent-line),0 8px 18px var(--role-paper-shadow)}
${base} .ai-assistant-card{background:linear-gradient(120deg,var(--role-device-panel),var(--role-space-panel));box-shadow:inset 0 1px 0 var(--role-highlight),inset 0 0 0 1px var(--role-accent-line),0 8px 18px var(--role-paper-shadow)}
`:'';
 const languages={
 male:`
${base} body{background-image:radial-gradient(ellipse at 12% 20%,var(--role-aura),transparent 58%);background-size:auto}
${base} .space-summary-card,${base} .space-device-card{background:linear-gradient(145deg,rgba(255,255,255,.035),transparent 65%),var(--role-panel);box-shadow:inset 0 0 0 1px var(--role-panel-line),0 4px 12px rgba(9,22,28,.10)}
${base} .space-summary-copy strong,${base} .space-device-copy strong{font-weight:600;letter-spacing:.02em}
${base} .space-stat-chip{color:var(--role-panel-muted);background:rgba(124,173,210,.12);box-shadow:inset 0 0 0 1px var(--role-panel-line)}
${base} .space-circle-action::before{background:var(--role-control-surface);box-shadow:inset 0 1px 0 var(--role-highlight),0 2px 8px rgba(0,0,0,.18)}
${base} .device-card:not(.is-offline),${base} .fd-card:not(.is-offline){box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 3px 10px rgba(28,40,43,.08)}
${base} .hero-card{box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 10px 28px rgba(22,57,87,.12)}
`,
 female:`
${base} body{background-image:radial-gradient(ellipse at 100% 6%,var(--role-aura),transparent 50%),radial-gradient(ellipse at 0% 80%,var(--role-aura),transparent 55%)}
${base} .space-summary-card,${base} .space-device-card{background:linear-gradient(145deg,var(--role-panel),var(--surface));box-shadow:inset 0 1px 0 var(--role-highlight),0 4px 14px var(--role-paper-shadow)}
${base} .space-circle-action::before{background:var(--role-control-surface);box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 2px 5px var(--role-paper-shadow)}
${base} .space-stat-chip{background:var(--role-panel);color:var(--role-panel-muted);box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 2px 4px var(--role-paper-shadow)}
${base} .space-category-icon{filter:saturate(.72)}
${base} .fd-card:not(.is-offline),${base} .favorite-scene{background:var(--role-card-surface);box-shadow:inset 0 1px 0 var(--role-highlight),0 4px 12px var(--role-paper-shadow)}
${base} .device-card:not(.is-offline){box-shadow:inset 0 1px 0 var(--role-highlight),0 6px 18px var(--role-paper-shadow)}
`,
 senior:`
${base} body{background-image:none}
${base} .space-summary-card,${base} .space-device-card{background:var(--surface);box-shadow:inset 0 0 0 1px var(--secondary);-webkit-backdrop-filter:none;backdrop-filter:none}
${base} .space-summary-copy strong,${base} .space-device-copy strong{font-weight:700}
${base} .space-summary-copy>span,${base} .space-device-copy>span{color:var(--text)}
${base} .space-circle-action::before{background:var(--surface);box-shadow:inset 0 0 0 1px var(--secondary)}
${base} .space-stat-chip{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--secondary);font-weight:600}
${base} .fd-card:not(.is-offline),${base} .device-card:not(.is-offline),${base} .favorite-scene{box-shadow:inset 0 0 0 1px var(--secondary)}
${base} .hero-card{box-shadow:inset 0 0 0 1px var(--secondary)}
`,
 child:`
${base} body{background-image:radial-gradient(circle at 90% 12%,var(--role-aura),transparent 32%),radial-gradient(circle at 4% 70%,rgba(243,197,129,.10),transparent 38%)}
${base} .space-summary-card[data-space-category="light"]{--role-category-aura:rgba(160,137,204,.12)}
${base} .space-summary-card[data-space-category="shade"]{--role-category-aura:rgba(160,137,204,.12)}
${base} .space-summary-card[data-space-category="climate"]{--role-category-aura:rgba(160,137,204,.12)}
${base} .space-summary-card,${base} .space-device-card{background:var(--role-panel);box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 4px 12px var(--role-paper-shadow)}
${base} .space-circle-action::before{background:var(--role-category-aura,var(--role-aura));box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 2px 0 var(--role-ambient)}
${base} .space-summary-copy strong,${base} .space-device-copy strong{font-weight:600}
${base} .space-stat-chip{background:var(--role-panel);color:var(--role-panel-muted);box-shadow:inset 0 0 0 1.5px var(--aqara-border-default),0 2px 0 var(--role-ambient);font-weight:600}
${base} .fd-card:not(.is-offline),${base} .favorite-scene{background:var(--role-card-surface);box-shadow:inset 0 0 0 1px var(--aqara-border-default),0 4px 12px var(--role-paper-shadow)}
${base} .device-card:not(.is-offline){box-shadow:inset 0 0 0 1.5px var(--aqara-border-default),0 4px 12px var(--role-paper-shadow)}
`};
 return '\n/* Independent role materials: palette can come from an explicit theme. */\n'+variables+shared+languages[role]+defaultRoleSurfaces+(role==='male' && palette?`\n${base} .space-power-glyph:not(.is-on) img{filter:brightness(0)}\n${base}[data-theme="dark"] .space-summary-card .space-action-image img{filter:brightness(0)}\n`: '');
}
