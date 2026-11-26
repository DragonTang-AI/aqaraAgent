import {roleMaterialsCSS} from './role-materials.mjs';
import {roleIllustrationsCSS} from './role-illustrations.mjs';
import {roleUsabilityCSS} from './role-usability.mjs';
import {cardVariantIds} from './role-card-variants.mjs';
// Generation only: role defaults are overridable; runtime geometry and controls stay shared.
export const moduleIds=['overview','aiAssistant','favoriteScenes','devices','spaceControl'];
export const metricIds=['online','spaces','scenes','temperature','humidity','presence'];
export const defaultDashboardProfile={style:'apple',visualPreset:'home-tech-glass',tabs:'home,devices,automation',deviceMode:'favorites',order:'overview,aiAssistant,favoriteScenes,devices,spaceControl'};
export const roleProfiles={
 male:{style:'apple',visualPreset:'home-tech-glass',tabs:'home,devices,automation',deviceMode:'space',metrics:metricIds,modules:moduleIds,order:'overview,favoriteScenes,devices,spaceControl,aiAssistant',categories:true,density:'full'},
 female:{style:'apple',tabs:'home,devices',deviceMode:'favorites',metrics:['temperature','humidity','presence'],modules:moduleIds,order:'overview,favoriteScenes,devices,spaceControl,aiAssistant',categories:true,density:'standard'},
 senior:{style:'aqara',tabs:'home',deviceMode:'favorites',metrics:['temperature','humidity'],modules:['overview','favoriteScenes','devices','aiAssistant'],order:'overview,favoriteScenes,devices,aiAssistant,spaceControl',categories:false,density:'simple'},
 child:{style:'aqara',tabs:'home',deviceMode:'space',metrics:['temperature','humidity'],modules:['overview','favoriteScenes','devices'],order:'overview,favoriteScenes,devices,aiAssistant,spaceControl',categories:false,density:'simple'}
};
export function listOption(value,allowed,fallback,name){const result=value===undefined?[...fallback]:String(value).split(',').map(v=>v.trim());if(result.some(id=>!allowed.includes(id))||new Set(result).size!==result.length)throw new Error(name+' must contain unique IDs: '+allowed.join(','));return result;}
export function booleanOption(value,fallback,name){if(value===undefined)return Boolean(fallback);if(!['true','false'].includes(value))throw new Error(name+' must be true or false');return value==='true';}
export function rolePaint(role,{palette=true,illustrations=true}={}){
 if(role==='none')return '';
 const colors={male:[['#eaf2fa','#10243a','#415c73','#f8fcff','#00687b'],['#080e20','#edf8ff','#b1c8dd','#13213a','#54edf5']],female:[['#f7f1f3','#352d3d','#746676','#fffaf9','#694269'],['#1c1825','#f8f0f4','#cbbbc9','#302738','#e8bfd9']],senior:[['#edf2eb','#20392f','#466052','#fffefa','#315f52'],['#1b2925','#f7f8f2','#cdded1','#304138','#b7dec9']],child:[['#f8f4eb','#383448','#675e76','#fffefa','#7156b7'],['#252639','#faf4ff','#d9cee9','#373650','#d5c1ef']]};
 if(!colors[role])throw new Error('Unknown role skin');
 return '\n/* Role paint only; anatomy/size/interaction remain module-owned. */\n'+(palette?colors[role].map((v,i)=>`:root[data-ui-profile="aqara"][data-role-skin="${role}"][data-theme="${i?'dark':'light'}"]{--canvas:${v[0]};--text:${v[1]};--secondary:${v[2]};--surface:${v[3]};--tile:${v[3]};--blue:${v[4]};--aqara-card-primary:${v[3]};--aqara-text-primary:${v[1]};--aqara-text-secondary:${v[2]};--aqara-action-on:${v[4]};--aqara-action:${v[4]};--aqara-slider-fill:${v[4]};--tab-selected-icon:${v[4]};--overview-glow:${role==='senior'?'transparent':'rgba(170,160,140,.09)'};--overview-start:${v[3]};--overview-end:${v[0]};--aqara-action-inverse:${i?role==='female'?'#241a2a':'#10243a':'#ffffff'};--favorite-device-surface:${v[3]};--role-card-surface:${v[3]};--role-card-ink:${v[1]};--glass:${v[3]};--tab-glass-tint:${v[3]};${role==='male'?`--aqara-border-default:${i?'rgba(90,215,245,.28)':'rgba(0,104,123,.22)'};--role-aura-cyan:${i?'rgba(0,216,255,.12)':'rgba(0,156,204,.10)'};--role-aura-violet:${i?'rgba(132,80,255,.13)':'rgba(116,87,240,.08)'};`:''}${role==='female'?`--aqara-border-default:${i?'rgba(230,188,215,.24)':'rgba(143,100,143,.19)'};--aqara-card-inactive:${i?'#2b2632':'#f0e9ee'};--aqara-card-offline:${i?'#292530':'#f0e9ee'};--favorite-device-offline:${i?'#292530':'#f0e9ee'};--favorite-device-action-surface:${i?'#4a3b50':'#f0e8ef'};--aqara-button-stateless:${i?'#4a3b50':'#f0e8ef'};--aqara-slider-track:${i?'#574a5d':'#dfd0df'};--glass:${i?'rgba(46,37,55,.78)':'rgba(255,248,250,.76)'};--tab-glass-tint:${i?'rgba(53,43,62,.72)':'rgba(255,249,250,.72)'};--sheet-glass:${i?'rgba(42,34,51,.94)':'rgba(255,248,250,.94)'};--focus-ring:${i?'#edc4df':'#76517b'};`:''}}`).join('\n'):'')+`
:root[data-role-skin]{--role-card-surface:var(--aqara-card-primary);--role-card-ink:var(--aqara-text-primary)}
:root[data-role-skin] .space-summary-card,:root[data-role-skin] .space-device-card,:root[data-role-skin] .favorite-scene{background:var(--role-card-surface,var(--surface));color:var(--role-card-ink,var(--text));box-shadow:inset 0 0 0 1px var(--aqara-border-default)}
:root[data-role-skin] .hero-card{color:var(--role-card-ink,var(--text));background:linear-gradient(140deg,var(--role-overview-start,var(--overview-start)),var(--role-overview-end,var(--overview-end)));border-color:var(--aqara-border-default);box-shadow:var(--shadow-sm);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
:root[data-role-skin] .summary-grid div,:root[data-role-skin] .space-overview-links button{background:var(--role-card-surface,var(--surface));border-color:var(--aqara-border-default);color:var(--role-card-ink,var(--text))}
:root[data-role-skin] .space-chip[aria-pressed="true"]{background:var(--aqara-action-on);color:var(--aqara-action-inverse)}
:root[data-role-skin="senior"] .hero-card{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}
:root[data-role-skin="senior"] .hero-card::after{display:none}
:root[data-role-skin="senior"] .summary-grid dt{font-size:13px;opacity:1}
:root[data-role-skin="senior"] .device-name,:root[data-role-skin="senior"] .fd-copy strong,:root[data-role-skin="senior"] .space-device-copy strong{font-weight:600}
`+roleMaterialsCSS(role,{palette})+(illustrations?roleIllustrationsCSS(role):'')+roleUsabilityCSS(role,{palette});
}
export function presentationCSS(config){const selectors={overview:['#dashboard-content'],aiAssistant:['#ai-assistant-section'],favoriteScenes:['#scene-section'],devices:['#device-section','#favorite-devices-section'],spaceControl:['#space-control-section']};const hidden=moduleIds.filter(id=>!config.homeModules.includes(id)).flatMap(id=>selectors[id]);if(!config.overviewCategories)hidden.push('#space-overview-links');if(['senior','child'].includes(config.role))hidden.push('#scene-edit','#favorite-devices-edit');
 const ids={online:'online-count',spaces:'space-count',scenes:'scene-count',temperature:'temperature-value',humidity:'humidity-value',presence:'presence-value'};
 return '\n/* Resolved presentation before first paint; no runtime module reordering. */\n'+(hidden.length?hidden.join(',')+'{display:none!important}\n':'')+metricIds.filter(id=>!config.overviewMetrics.includes(id)).map(id=>`.summary-grid [data-overview-metric="${id}"]{display:none!important}`).join('\n')+`\n.summary-grid{grid-template-columns:repeat(${config.overviewMetrics.length===2?2:Math.min(3,config.overviewMetrics.length)},minmax(0,1fr))}\n`+(config.overviewEnvironmentSpaceId?'\n.summary-grid dt{min-height:48px;line-height:24px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}\n':'')+(config.informationDensity==='simple'?'.capability-summary,#device-note,#device-eyebrow,#scene-note,#overview-coverage{display:none!important}\n':'');
}
export function validatePresentation(config,html){
 if(config.overviewLayout!==undefined && !['compact','standard'].includes(config.overviewLayout))throw new Error('Invalid overview layout');
 if(config.overviewLayout==='compact' && (!config.overviewCategories || !html.includes('data-overview-layout="compact"') || !html.includes('id="overview-details"') || /<details[^>]*id="overview-details"[^>]*\bopen(?:[\s=>])/.test(html)))throw new Error('Compact overview must have category entries and an initially closed data disclosure');
 if(config.role && !roleProfiles[config.role])throw new Error('Invalid role');
 if(['senior','child'].includes(config.role)&&(!config.homeModules||config.homeModules.includes('favoriteScenes')&&config.homeModules.includes('devices'))&&config.homeModuleOrder&&config.homeModuleOrder.indexOf('favoriteScenes')>config.homeModuleOrder.indexOf('devices'))throw new Error('Senior/child Favorite scenes must precede Home devices');
 if(config.roleCardVariant!==undefined && !cardVariantIds.includes(config.roleCardVariant))throw new Error('Invalid role card variant');
 if(config.roleCardVariant!==undefined && !html.includes('data-role-card-variant="'+config.roleCardVariant+'"'))throw new Error('Card variant differs from initial HTML');
 if(config.roleSkin && config.roleSkin!=='none' && !roleProfiles[config.roleSkin])throw new Error('Invalid role skin');
 for(const [name,allowed] of [['homeModules',moduleIds],['overviewMetrics',metricIds]])if(config[name]!==undefined){if(!Array.isArray(config[name])||!config[name].length)throw new Error(name+' must be a nonempty array');listOption(config[name].join(','),allowed,[],name);}
 for(const name of ['favoriteSceneDefaults','overviewCategories','homeSpaceRequired','roleIllustrations','enableDevicePairing','enableSpaceDeviceDetails'])if(config[name]!==undefined && typeof config[name]!=='boolean')throw new Error(name+' must be Boolean');
 if(config.informationDensity!==undefined && !['full','standard','simple'].includes(config.informationDensity))throw new Error('Invalid information density');
 if(config.homeSpaceSelection!==undefined && !['manual','first-room'].includes(config.homeSpaceSelection))throw new Error('Invalid Home space selection');
 if(config.homeSpaceId!==undefined && (typeof config.homeSpaceId!=='string'||config.homeSpaceId.length>256))throw new Error('Invalid Home space ID');
 if(config.defaultFavoriteSceneIds!==undefined && (!Array.isArray(config.defaultFavoriteSceneIds)||![0,6].includes(config.defaultFavoriteSceneIds.length)||config.defaultFavoriteSceneIds.some(id=>typeof id!=='string'||!id.trim())||new Set(config.defaultFavoriteSceneIds).size!==config.defaultFavoriteSceneIds.length))throw new Error('Invalid default scene IDs');
 if(config.overviewEnvironmentSpaceId!==undefined && (typeof config.overviewEnvironmentSpaceId!=='string'||config.overviewEnvironmentSpaceId.length>256))throw new Error('Invalid environment source');
 if(config.role!==undefined && !html.includes('data-role="'+config.role+'"'))throw new Error('Role differs from initial HTML');
 if(config.overviewMetrics!==undefined)for(const id of metricIds)if(!html.includes('data-overview-metric="'+id+'"'))throw new Error('Overview metric markup is missing');
}

// Actual audience drives hierarchy; custom themes/skins still own paint tokens.
export function rolePresentationCSS(config){
 if(!config.role)return '';const b=':root[data-role="'+config.role+'"]';
 const common=`
/* Audience information hierarchy; fixed slots across loading, feedback and locales. */
${b} .favorite-scene{position:relative;display:grid;grid-template-columns:minmax(0,1fr) ${config.role==='senior'?24:20}px;grid-template-rows:28px auto;gap:8px 6px;align-content:center;min-height:104px;padding:14px}
${b} .favorite-scene-icon{display:grid;place-items:center;grid-column:1;grid-row:1;width:28px;height:28px;color:var(--aqara-action);pointer-events:none}
${b} .favorite-scene-icon svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
${b} .favorite-scene-name{grid-column:1/-1;grid-row:2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:anywhere;line-height:24px;min-height:48px}
${b} .favorite-scene-status{grid-column:2;grid-row:1;align-self:center}
${b} .summary-grid{gap:10px}
${b} .summary-grid dd{font-variant-numeric:tabular-nums}
${b} .summary-grid dt{min-width:0}
${b} .space-overview-links button{flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;min-height:64px}
`;
 const variants={
 male:`${b} .summary-grid{margin-top:16px;gap:6px 12px}${b} .summary-grid div{padding:8px 0;background:transparent;border:0;box-shadow:none}${b} .summary-grid dd{font-size:22px;line-height:28px}${b} .summary-grid dt{font-size:12px;line-height:18px}${b} .space-overview-links{margin-top:16px}${b} .space-overview-name{font-weight:600}${b} .space-overview-value{font-size:12px}${b} .favorite-scene{min-height:84px;padding:12px;grid-template-columns:20px minmax(0,1fr) 20px;grid-template-rows:auto;gap:6px}${b} .favorite-scene-icon{width:20px;height:20px;grid-column:1;grid-row:1}${b} .favorite-scene-icon svg{width:20px;height:20px}${b} .favorite-scene-name{grid-column:2;grid-row:1}${b} .favorite-scene-status{grid-column:3;grid-row:1}`,
 female:`${b} #overview-coverage{display:none}${b} .summary-grid{grid-template-columns:repeat(${config.overviewMetrics.length===1?1:2},minmax(0,1fr))}${b} .summary-grid [data-overview-metric="presence"]{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:10px 12px}${b} .summary-grid dd{font-size:30px;line-height:36px;font-weight:500}${b} .summary-grid [data-overview-metric="presence"] dd{font-size:16px;line-height:24px}${b} .summary-grid [data-overview-metric="presence"] dt{font-size:13px;line-height:20px}${b} .favorite-scene{border-radius:24px}${b} .favorite-scene-icon{border-radius:10px;background:var(--canvas)}${b} .favorite-scene-name{font-weight:500}`,
 senior:`${b} .favorite-scene{min-height:122px;padding:16px;gap:10px 8px;grid-template-rows:28px auto}${b} .favorite-scene-name{font-size:20px;line-height:28px;min-height:56px;font-weight:600}${b} .favorite-scene-icon svg{width:28px;height:28px;stroke-width:2}${b} .summary-grid div{padding:16px 12px}${b} .summary-grid dd{font-size:36px;line-height:44px}${b} .summary-grid dt{font-size:16px;line-height:24px}${b} .hero-copy h2{font-size:22px;line-height:30px}`,
 child:`${b} .summary-grid div{border-radius:20px;padding:14px 12px}${b} .summary-grid dd{font-size:30px;line-height:38px}${b} .summary-grid dt{font-size:14px;line-height:22px}${b} .favorite-scene{border-radius:24px}${b} .favorite-scene-name{font-size:16px;font-weight:600;text-align:left}`
 };
 const mask=svg=>`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
 const childTemperatureIcon=mask('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z" fill="none" stroke="black" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v9" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>');
 const childHumidityIcon=mask('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C9 6 5 10 5 15a7 7 0 0 0 14 0c0-5-4-9-7-13Z" fill="none" stroke="black" stroke-width="2" stroke-linejoin="round"/><path d="M9 16a3 3 0 0 0 3 3" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>');
 const childOverview=config.role==='child'?`
/* Child overview keeps the same real readings, with a simpler and distinct reading order. */
${b} .favorite-scene.is-child-art{grid-template-rows:52px auto;align-content:space-between;min-height:136px;padding:14px;border-radius:23px;background:radial-gradient(circle at 100% 0%,var(--child-scene-halo,rgba(195,175,225,.23)),transparent 45%),var(--role-card-surface,var(--surface));box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 8px 20px rgba(73,55,105,.08)}
${b} .favorite-scene.is-child-art:nth-child(6n+1){--child-scene-halo:rgba(255,211,133,.31)}
${b} .favorite-scene.is-child-art:nth-child(6n+2){--child-scene-halo:rgba(151,217,205,.27)}
${b} .favorite-scene.is-child-art:nth-child(6n+3){--child-scene-halo:rgba(174,162,229,.29)}
${b} .favorite-scene.is-child-art:nth-child(6n+4){--child-scene-halo:rgba(244,181,207,.27)}
${b} .favorite-scene.is-child-art:nth-child(6n+5){--child-scene-halo:rgba(151,200,231,.28)}
${b} .favorite-scene.is-child-art:nth-child(6n+6){--child-scene-halo:rgba(175,211,231,.28)}
${b} .favorite-scene-icon.is-child-art{grid-column:1;grid-row:1;justify-self:start;width:52px;height:52px;border-radius:18px;background:rgba(255,255,255,.43);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 4px 12px rgba(73,55,105,.09)}
${b} .favorite-scene-icon.is-child-art svg{width:46px;height:46px;fill:initial;stroke:none;overflow:visible}
${b} .favorite-scene.is-child-art .favorite-scene-name{align-self:end}
${b}[data-theme="dark"] .favorite-scene-icon.is-child-art{background:rgba(255,255,255,.10);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
${b} .hero-card{padding:20px 18px 18px;border-radius:28px}
${b} .hero-copy{min-height:68px;padding-right:104px}
${b} .hero-copy #summary-label{font-size:25px;line-height:34px;font-weight:700}
${b} .summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
${b} .summary-grid div{position:relative;display:grid;grid-template-rows:minmax(40px,auto) 1fr;min-height:132px;padding:15px;border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
${b} .summary-grid [data-overview-metric="temperature"]{background:var(--child-temperature-panel,var(--aqara-card-primary))}
${b} .summary-grid [data-overview-metric="humidity"]{background:var(--child-humidity-panel,var(--aqara-card-primary))}
${b} .summary-grid dt{grid-row:1;align-self:start;max-width:calc(100% - 25px);font-size:14px;line-height:20px;font-weight:600;opacity:1;color:var(--aqara-text-secondary)}
${b} .summary-grid dd{grid-row:2;align-self:end;font-size:31px;line-height:38px;font-weight:700;letter-spacing:-.03em}
${b} .summary-grid [data-overview-metric="temperature"]::before,${b} .summary-grid [data-overview-metric="humidity"]::before{content:"";position:absolute;top:14px;right:14px;width:21px;height:21px;background:var(--aqara-action);opacity:.8;pointer-events:none;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
${b} .summary-grid [data-overview-metric="temperature"]::before{-webkit-mask-image:${childTemperatureIcon};mask-image:${childTemperatureIcon}}
${b} .summary-grid [data-overview-metric="humidity"]::before{-webkit-mask-image:${childHumidityIcon};mask-image:${childHumidityIcon}}
@media(max-width:350px){${b} .hero-copy{padding-right:86px}${b} .summary-grid{gap:8px}${b} .summary-grid div{padding:12px;min-height:124px}${b} .summary-grid dd{font-size:27px;line-height:34px}}
`:'';
 return common+variants[config.role]+childOverview;
}

// Shared compact overview is generated once; native disclosure preserves its state on data updates.
export function compactOverviewHTML(html,config){
 if(config.overviewLayout!=='compact')return html;
 const start=html.indexOf('<section id="dashboard-content"'),end=html.indexOf('</section>',start);
 if(start<0||end<0)throw new Error('Missing overview section');let block=html.slice(start,end);
 const links=block.match(/<div id="space-overview-links"[^>]*>[\s\S]*?<\/div>/),metrics=block.match(/<dl id="summary-grid"[^>]*>[\s\S]*?<\/dl>/),coverage=block.match(/<p id="overview-coverage"[^>]*>[\s\S]*?<\/p>/),freshness=block.match(/<p class="freshness"[^>]*>[\s\S]*?<\/p>/);
 if(!links||!metrics||!coverage||!freshness)throw new Error('Incomplete overview anatomy');
 for(const part of [links,metrics,coverage,freshness])block=block.replace(part[0],'');
 const paths={light:'M9 18h6m-5 3h4M8 14c-5-6 0-12 4-12s9 6 4 12l-1 3H9Z',shade:'M3 3h18M5 4v17l7-4 7 4V4M12 4v13',climate:'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 5l3 3 3-3m-6 14 3-3 3 3'};
 let quick=links[0];for(const [key,path] of Object.entries(paths))quick=quick.replace('data-space-overview="'+key+'" disabled>','data-space-overview="'+key+'" disabled><svg class="overview-quick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>');
 block+=quick+'<details id="overview-details" class="overview-details"><summary><span id="overview-details-label">家庭数据</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary><div class="overview-details-body">'+metrics[0]+coverage[0]+freshness[0]+'</div></details>';
 return html.slice(0,start)+block+html.slice(end);
}
export function compactOverviewCSS(config){
 if(config.overviewLayout!=='compact')return '';return `
/* Compact Home: category shortcuts are the overview; statistics are a native disclosure. */
:root[data-overview-layout="compact"][data-role-skin="male"] body{background-image:radial-gradient(ellipse at 100% 0%,var(--role-aura-cyan,var(--role-aura)),transparent 60%),radial-gradient(ellipse at 0% 70%,var(--role-aura-violet,transparent),transparent 65%);background-size:auto}
:root[data-overview-layout="compact"] #dashboard-content{padding:0;border:0;background:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;overflow:visible}
:root[data-overview-layout="compact"] #dashboard-content::before,:root[data-overview-layout="compact"] #dashboard-content::after{display:none}
:root[data-overview-layout="compact"] #dashboard-content>.hero-copy{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
:root[data-overview-layout="compact"] #space-overview-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
:root[data-overview-layout="compact"] #space-overview-links button{display:grid;grid-template-columns:18px minmax(0,1fr);grid-template-rows:22px 20px;align-items:center;gap:4px 6px;min-width:0;min-height:78px;padding:12px 10px;border:1px solid var(--aqara-border-default);border-radius:20px;background:var(--aqara-card-primary);color:var(--aqara-text-primary);box-shadow:none}
:root[data-overview-layout="compact"][data-role-skin="male"] #space-overview-links button{background-image:var(--role-overview-tile-art,none);background-repeat:no-repeat;background-size:120px 80px;background-position:right center}
:root[data-overview-layout="compact"] .overview-quick-icon{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;color:var(--aqara-action)}
:root[data-overview-layout="compact"] .space-overview-name{font-size:13px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
:root[data-overview-layout="compact"] .space-overview-value{grid-column:1/-1;min-width:0;font-size:12px;line-height:20px;color:var(--aqara-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:root[data-overview-layout="compact"] .overview-details{margin-top:8px;color:var(--text)}
:root[data-overview-layout="compact"] .overview-details>summary{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 4px;list-style:none;font-size:14px;line-height:20px;color:var(--secondary);cursor:pointer;touch-action:manipulation}
:root[data-overview-layout="compact"] .overview-details>summary::-webkit-details-marker{display:none}
:root[data-overview-layout="compact"] .overview-details>summary svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8}
:root[data-overview-layout="compact"] .overview-details[open]>summary svg{transform:rotate(90deg)}
:root[data-overview-layout="compact"] .overview-details>summary:focus-visible{outline:2px solid var(--aqara-action);outline-offset:2px;border-radius:8px}
:root[data-overview-layout="compact"] .overview-details-body{padding:4px 12px 12px;border:1px solid var(--aqara-border-default);border-radius:16px;background:var(--aqara-card-primary)}
:root[data-overview-layout="compact"] .summary-grid{margin-top:8px;gap:8px}
:root[data-overview-layout="compact"] .summary-grid div{padding:8px 0;border:0;background:none;box-shadow:none}
:root[data-overview-layout="compact"] .summary-grid dd{font-size:20px;line-height:28px}
:root[data-overview-layout="compact"] .summary-grid dt{font-size:12px;line-height:18px;color:var(--aqara-text-secondary)}
:root[data-overview-layout="compact"] .favorite-scene{display:grid;position:relative;grid-template-columns:28px minmax(0,1fr) 20px;grid-template-rows:auto;gap:6px;align-items:center;min-height:76px;padding:12px;border-radius:20px;background:var(--aqara-card-primary);color:var(--aqara-text-primary);box-shadow:none;border:1px solid var(--aqara-border-default)}
:root[data-overview-layout="compact"] .favorite-scene-icon{display:grid;place-items:center;width:28px;height:28px;grid-column:1;grid-row:1;color:var(--aqara-action)}
:root[data-overview-layout="compact"] .favorite-scene-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
:root[data-overview-layout="compact"] .favorite-scene-name{grid-column:2;grid-row:1;min-width:0;min-height:0;line-height:24px;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;text-align:left}
:root[data-overview-layout="compact"] .favorite-scene-status{grid-column:3;grid-row:1}
`;
}
