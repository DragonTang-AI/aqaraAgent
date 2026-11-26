// Paint-only visual preset. Real data, card anatomy, controls and bridge paths remain shared.
export function homeTechGlassCSS(config){
 if(config.visualPreset!=='home-tech-glass')return '';
 const root=':root[data-visual-preset="home-tech-glass"]';
 return `
/* V5 Apple Home inspired: coherent room/scene colour with glass confined to chrome. */
${root}[data-theme="light"]{--canvas:#ebeffa;--text:#1a2d50;--secondary:#64728f;--blue:#5268d4;--aqara-action:#5268d4;--aqara-action-on:#5268d4;--aqara-slider-fill:#5268d4;--tab-selected-icon:#5268d4;--aqara-card-primary:#f7f8ff;--aqara-card-inactive:#e9ecf7;--favorite-device-surface:#f7f8ff;--glass:rgba(248,249,255,.62);--tab-glass-tint:rgba(234,236,255,.66);--home-tech-deck:linear-gradient(145deg,#2c407b,#4d62a5);--home-tech-deck-shadow:rgba(46,57,124,.20);--home-tech-room:rgba(218,224,247,.62);--home-tech-edge:rgba(255,255,255,.86);--home-tech-glint:rgba(255,255,255,.98)}
${root}[data-role="male"][data-theme="light"]{--canvas:#e8eef9;--text:#15284a;--secondary:#596b88;--blue:#2459cb;--aqara-action:#2459cb;--aqara-action-on:#2459cb;--aqara-slider-fill:#2459cb;--tab-selected-icon:#2459cb;--aqara-border-default:rgba(49,91,174,.23);--role-panel:#182c55;--role-panel-line:rgba(92,136,213,.29);--role-control-surface:#d8e4ff;--aqara-card-primary:#f5f8ff;--aqara-card-inactive:#e3e9f6;--favorite-device-surface:#f5f8ff;--glass:rgba(242,247,255,.62);--tab-glass-tint:rgba(218,231,255,.64);--home-tech-deck:linear-gradient(145deg,#172d5a,#315fae);--home-tech-deck-shadow:rgba(31,62,129,.21);--home-tech-room:rgba(211,224,248,.64)}
${root}[data-theme="dark"]{--canvas:#12182d;--text:#eff2ff;--secondary:#b9c2df;--blue:#b8c5ff;--aqara-action:#b8c5ff;--aqara-action-on:#b8c5ff;--aqara-slider-fill:#b8c5ff;--aqara-action-inverse:#202447;--tab-selected-icon:#cbd3ff;--aqara-card-primary:#2d3659;--aqara-card-inactive:#252c49;--favorite-device-surface:#2d3659;--glass:rgba(51,59,100,.64);--tab-glass-tint:rgba(64,70,123,.62);--home-tech-deck:linear-gradient(145deg,#273666,#1d2752);--home-tech-deck-shadow:rgba(0,0,0,.29);--home-tech-room:rgba(45,51,83,.74);--home-tech-edge:rgba(222,227,255,.22);--home-tech-glint:rgba(236,239,255,.24)}
${root}[data-role="male"][data-theme="dark"]{--canvas:#080e1d;--text:#edf3ff;--secondary:#aebddb;--blue:#8db7ff;--aqara-action:#8db7ff;--aqara-action-on:#8db7ff;--aqara-slider-fill:#8db7ff;--aqara-action-inverse:#0b1730;--tab-selected-icon:#a8c7ff;--aqara-border-default:rgba(117,161,245,.27);--role-panel:#10213e;--role-panel-line:rgba(117,161,245,.27);--role-control-surface:#c5d7ff;--aqara-card-primary:#1a2949;--aqara-card-inactive:#14203a;--favorite-device-surface:#1a2949;--glass:rgba(31,46,85,.65);--tab-glass-tint:rgba(38,58,107,.69);--home-tech-deck:linear-gradient(145deg,#0b1732,#172e62);--home-tech-deck-shadow:rgba(0,0,0,.38);--home-tech-room:rgba(27,43,78,.76)}
${root} body{background-color:var(--canvas);background-image:linear-gradient(180deg,rgba(108,124,218,.16),transparent 620px);background-repeat:no-repeat;background-size:100% 620px}
${root}[data-role="male"] body{background-image:linear-gradient(180deg,rgba(75,110,219,.18),transparent 620px)}
${root}[data-role="male"] body{background-size:100% 620px;background-position:center top;background-repeat:no-repeat}
${root} .app-shell{max-width:780px}
${root} #dashboard-content{padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;overflow:visible!important}
${root} #space-overview-links{gap:7px!important;padding:9px;border:1px solid rgba(255,255,255,.20);border-radius:26px;background:var(--home-tech-deck);box-shadow:0 18px 34px var(--home-tech-deck-shadow),inset 0 1px rgba(255,255,255,.16)}
${root} #space-overview-links button{min-height:94px!important;padding:12px 9px!important;border:1px solid rgba(255,255,255,.66)!important;border-radius:18px!important;background:linear-gradient(160deg,rgba(255,255,255,.97),rgba(232,242,255,.92))!important;color:#183046!important;box-shadow:0 5px 13px rgba(7,37,75,.11),inset 0 1px rgba(255,255,255,.96)!important}
${root}[data-role="male"] #space-overview-links button{background-image:linear-gradient(160deg,rgba(250,252,255,.98),rgba(224,234,255,.94))!important}
${root}[data-theme="dark"] #space-overview-links button{border-color:rgba(225,241,255,.14)!important;background:linear-gradient(160deg,#3b526f,#293e5b)!important;color:#f0f7ff!important;box-shadow:inset 0 1px rgba(255,255,255,.12)!important}
${root}[data-role="male"][data-theme="dark"] #space-overview-links button{background-image:linear-gradient(160deg,#273e70,#1b2d54)!important}
${root} #space-overview-links .space-overview-value{color:inherit!important;opacity:.78}
${root} #dashboard-content .overview-details{margin:16px 2px 0!important;color:var(--text)}
${root} #dashboard-content .overview-details>summary{min-height:43px!important;padding:5px 12px!important;border:1px solid var(--home-tech-edge);border-radius:14px;background:var(--glass);color:var(--secondary)!important;box-shadow:inset 0 1px var(--home-tech-glint);-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%)}
${root} #dashboard-content .overview-details-body{color:var(--text)}
${root} .favorite-scene{min-height:88px!important;border-color:rgba(255,255,255,.39)!important;color:#fff!important;box-shadow:0 10px 20px rgba(42,66,113,.15),inset 0 1px rgba(255,255,255,.25)!important}
${root} .favorite-scene:nth-child(4n + 1){background:linear-gradient(145deg,#7184ce,#5267b3)!important}
${root} .favorite-scene:nth-child(4n + 2){background:linear-gradient(145deg,#59739e,#37527e)!important}
${root} .favorite-scene:nth-child(4n + 3){background:linear-gradient(145deg,#bf879f,#965e84)!important}
${root} .favorite-scene:nth-child(4n + 4){background:linear-gradient(145deg,#877ec4,#665fab)!important}
${root}[data-role="male"] .favorite-scene:nth-child(4n + 1){background:linear-gradient(145deg,#376fc7,#24539e)!important}
${root}[data-role="male"] .favorite-scene:nth-child(4n + 2){background:linear-gradient(145deg,#526bb2,#344b8b)!important}
${root}[data-role="male"] .favorite-scene:nth-child(4n + 3){background:linear-gradient(145deg,#6865b5,#474582)!important}
${root}[data-role="male"] .favorite-scene:nth-child(4n + 4){background:linear-gradient(145deg,#527bc1,#375f9e)!important}
${root}[data-theme="dark"] .favorite-scene{border-color:rgba(222,229,255,.17)!important;filter:saturate(.92) brightness(.94)}
${root} .favorite-scene-icon{color:#fff!important;background:rgba(255,255,255,.16)!important;border:1px solid rgba(255,255,255,.15);border-radius:9px}
${root} .favorite-scene-name{color:#fff!important;font-weight:600}
${root} .favorite-devices-grid{padding:8px;gap:9px;border:1px solid var(--home-tech-edge);border-radius:25px;background:var(--home-tech-room);box-shadow:inset 0 1px var(--home-tech-glint),0 10px 20px rgba(40,73,112,.07)}
${root} .fd-card{border:1px solid var(--home-tech-edge);border-radius:19px;box-shadow:0 6px 14px rgba(35,61,94,.08),inset 0 1px var(--home-tech-glint)}
${root}[data-theme="light"] .fd-card:has(.fd-light):not(.is-offline){background:linear-gradient(155deg,#f5e2bc,#e9c988)}
${root}[data-theme="dark"] .fd-card:has(.fd-light):not(.is-offline){background:linear-gradient(155deg,#655469,#4d415d)}
${root} .device-card:not(.is-offline),${root} .space-summary-card,${root} .space-device-card{border:1px solid var(--home-tech-edge)!important;box-shadow:0 8px 17px rgba(31,67,102,.08),inset 0 1px var(--home-tech-glint)!important}
${root} .device-card.category-light.is-on{background:linear-gradient(155deg,#f6e1b9,#e8c787)!important}
${root}[data-role="male"] .device-card.category-light.is-on{background:linear-gradient(155deg,#d4e1ff,#adc6f5)!important}
${root}[data-theme="dark"] .device-card.category-light.is-on{background:linear-gradient(155deg,#655469,#4d415d)!important}
${root}[data-role="male"][data-theme="dark"] .device-card.category-light.is-on{background:linear-gradient(155deg,#24447d,#182f61)!important}
${root} .ai-assistant-card{border-color:var(--home-tech-edge);background:linear-gradient(145deg,rgba(255,255,255,.74),rgba(219,237,255,.53));box-shadow:0 14px 27px rgba(33,69,108,.14),inset 0 1px var(--home-tech-glint);-webkit-backdrop-filter:blur(28px) saturate(160%);backdrop-filter:blur(28px) saturate(160%)}
${root}[data-theme="dark"] .ai-assistant-card{background:linear-gradient(145deg,rgba(112,150,195,.20),rgba(33,58,88,.46))}
${root}[data-theme="dark"] .ai-assistant-chip{background:rgba(174,188,255,.12);color:var(--secondary)}
${root} .icon-button,${root} .studio-tabbar{border:1px solid var(--home-tech-edge);box-shadow:0 12px 27px rgba(31,68,104,.16),inset 0 1px var(--home-tech-glint);-webkit-backdrop-filter:blur(28px) saturate(165%);backdrop-filter:blur(28px) saturate(165%)}
${root} .studio-tabbar{background:linear-gradient(145deg,rgba(249,254,255,.77),rgba(217,236,250,.53)),var(--tab-glass-tint)}
${root}[data-theme="dark"] .studio-tabbar{background:linear-gradient(145deg,rgba(123,161,201,.22),rgba(28,55,79,.54)),var(--tab-glass-tint)}
${root} .studio-tabbar::after{box-shadow:0 4px 12px rgba(44,83,119,.12),inset 0 1px var(--home-tech-glint)}
@media(prefers-reduced-transparency:reduce){${root} .ai-assistant-card,${root} .icon-button,${root} .studio-tabbar,${root} #dashboard-content .overview-details>summary{-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--aqara-card-primary)}}
`;
}
