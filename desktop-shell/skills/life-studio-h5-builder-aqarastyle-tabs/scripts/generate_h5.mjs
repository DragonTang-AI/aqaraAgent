#!/usr/bin/env node
import {seniorSizingCSS} from './senior-sizing.mjs';

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreview } from './preview-package.mjs';
import {roleCardVariants,cardVariantIds,roleCardCSS} from './role-card-variants.mjs';
import { defaultDashboardProfile,roleProfiles,moduleIds,metricIds,listOption,booleanOption,rolePaint,presentationCSS,rolePresentationCSS,compactOverviewHTML,compactOverviewCSS } from './role-profiles.mjs';
import { homeTechGlassCSS } from './home-tech-glass.mjs';
import { themeTokensCSS } from './theme-tokens.mjs';
import { resolveHomeModuleOrder, reorderHomeModules } from './home-layout.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const templateDir = join(skillDir, 'assets', 'dashboard-template');

function fail(message) {
  console.error(`life-studio-h5-builder-aqarastyle-tabs: ${message}`);
  process.exit(1);
}

const supportedOptions = new Set(["allow-direct-fetch", "backend-page-size", "cache-ttl-seconds", "capability-batch-size", "control-readback-delay-ms", "default-favorite-scene-ids", "definition-batch-size", "definition-concurrency", "device-page-size", "disable-overview-index", "enable-device-pairing", "enable-space-device-details", "favorite-devices-scope", "favorite-scene-defaults", "favorite-scenes-scope", "home-device-mode", "home-module-order", "home-modules", "home-space-id", "home-space-required", "home-space-selection", "information-density", "output", "overview-catalog-page-size", "overview-categories", "overview-definition-batch-size", "overview-environment-space-id", "overview-layout", "overview-max-devices", "overview-metrics", "read-only", "role", "role-card-variant", "role-illustrations", "role-recommendations", "role-rest-space-id", "role-skin", "safe-command-codes", "scope", "studio-base-url", "studio-host", "style", "tabs", "theme-tokens", "title", "title-en", "title-zh-tw", "visual-preset", "with-preview"]);
function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) fail(`unexpected argument ${key}`);
    const name = key.slice(2);
    if(!supportedOptions.has(name))fail(`unknown option --${name}`);
    if(Object.hasOwn(result,name))fail(`duplicate option --${name}`);
    if (name === 'read-only' || name === 'allow-direct-fetch' || name === 'with-preview' || name === 'disable-overview-index') {
      result[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for ${key}`);
    result[name] = value;
    index += 1;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (!args.output) fail('--output is required');

const role=args.role || '';if(role && !roleProfiles[role])fail('--role must be male, female, senior, or child');const preset=roleProfiles[role] || defaultDashboardProfile;
const style = args.style ?? preset.style;
if (!['aqara', 'apple', 'ha', 'custom'].includes(style)) fail('--style must be aqara, apple, ha, or custom');
const visualPreset=args['visual-preset'] ?? (style===preset.style ? preset.visualPreset || '' : '');
if(!['','home-tech-glass'].includes(visualPreset) || visualPreset && (style!=='apple' || !['','male'].includes(role)))fail('--visual-preset home-tech-glass requires Apple style and no role or male role');
let customThemeCSS = '';
if (style === 'custom') {
  if (!args['theme-tokens']) fail('--style custom requires --theme-tokens <JSON file> with light and dark paint tokens');
  try { customThemeCSS = themeTokensCSS(JSON.parse(readFileSync(resolve(args['theme-tokens']), 'utf8'))); }
  catch (error) { fail(error.message); }
} else if (args['theme-tokens']) fail('--theme-tokens requires --style custom');
const requestedTabs = String(args.tabs ?? preset.tabs).split(',').map(value => value.trim());
const allowedTabs = ['home', 'devices', 'automation'];
if (requestedTabs[0] !== 'home' || requestedTabs.some(tab => !allowedTabs.includes(tab)) || new Set(requestedTabs).size !== requestedTabs.length) fail('--tabs must be home, home,devices, home,automation, or home,devices,automation');
const tabs = allowedTabs.filter(tab => requestedTabs.includes(tab));
const scope = args.scope ?? 'studio';
if (scope !== 'studio') fail('configurable-tab packages require --scope studio');

const numberArg = (name, fallback, min, max) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const homeDeviceMode = args['home-device-mode'] ?? preset.deviceMode;
if (!['space','favorites'].includes(homeDeviceMode)) fail('--home-device-mode must be space or favorites');

let homeModuleOrder;
try { homeModuleOrder=resolveHomeModuleOrder(args['home-module-order'] ?? preset.order); } catch(error) { fail(error.message); }


let homeModules,overviewMetrics,overviewCategories,homeSpaceRequired;
try{homeModules=listOption(args['home-modules'],moduleIds,preset.modules || moduleIds,'--home-modules');overviewMetrics=listOption(args['overview-metrics'],metricIds,preset.metrics || metricIds,'--overview-metrics');overviewCategories=booleanOption(args['overview-categories'],preset.categories===undefined?true:preset.categories,'--overview-categories');homeSpaceRequired=booleanOption(args['home-space-required'],preset.spaceRequired,'--home-space-required');}catch(error){fail(error.message);}
if(['senior','child'].includes(role)&&homeModules.includes('favoriteScenes')&&homeModules.includes('devices')&&homeModuleOrder.indexOf('favoriteScenes')>homeModuleOrder.indexOf('devices'))fail('Senior/child Favorite scenes must precede Home devices');
const overviewLayout=args['overview-layout'] ?? (overviewCategories && (!role || role==='male') && args['overview-metrics']===undefined?'compact':'standard');if(!['compact','standard'].includes(overviewLayout)||overviewLayout==='compact'&&!overviewCategories)fail('--overview-layout must be standard, or compact with category entries');
const homeSpaceSelection=args['home-space-selection'] ?? preset.spaceSelection ?? 'manual';if(!['manual','first-room'].includes(homeSpaceSelection))fail('--home-space-selection must be manual or first-room');
const roleSkin=args['role-skin'] ?? (role || 'none');if(roleSkin!=='none' && !roleProfiles[roleSkin])fail('--role-skin must be none, male, female, senior, or child');
const roleCardVariant=args['role-card-variant'] ?? roleCardVariants[roleSkin] ?? 'standard';if(!cardVariantIds.includes(roleCardVariant))fail('--role-card-variant must be '+cardVariantIds.join(', '));
let roleIllustrations;try{roleIllustrations=booleanOption(args['role-illustrations'],roleSkin!=='none','--role-illustrations');}catch(error){fail(error.message);}
const informationDensity=args['information-density'] ?? preset.density ?? 'standard';if(!['simple','standard','full'].includes(informationDensity))fail('Invalid information density');
if(args['home-space-id']!==undefined && (!args['home-space-id'].trim() || args['home-space-id'].length>256))fail('--home-space-id must be a nonempty real space ID up to 256 characters');
const favoriteSceneDefaults=booleanOption(args['favorite-scene-defaults'],true,'favorite-scene-defaults');
let defaultFavoriteSceneIds=[];
if(args['default-favorite-scene-ids']){
 try{defaultFavoriteSceneIds=JSON.parse(readFileSync(resolve(args['default-favorite-scene-ids']),'utf8'));}catch(error){fail('Default scene IDs must be a JSON array file');}
 if(!Array.isArray(defaultFavoriteSceneIds)||defaultFavoriteSceneIds.length!==6||defaultFavoriteSceneIds.some(id=>typeof id!=='string'||!id.trim()||id.length>512)||new Set(defaultFavoriteSceneIds.map(id=>id.trim())).size!==6)fail('Provide exactly six distinct confirmed real scene IDs');
 defaultFavoriteSceneIds=defaultFavoriteSceneIds.map(id=>id.trim());
}
const overviewEnvironmentSpaceId=args['overview-environment-space-id'] || '';
if(args['overview-environment-space-id']!==undefined&&(!overviewEnvironmentSpaceId.trim()||overviewEnvironmentSpaceId.length>256))fail('Environment source requires a real space ID');
const workspaceDir = resolve(args.output);
if (existsSync(workspaceDir)) fail(`output already exists: ${workspaceDir}`);
const outputDir = args['with-preview'] ? join(workspaceDir, 'runtime') : workspaceDir;



const devicePageSize = numberArg('device-page-size', 12, 4, 48);
const config = {
  role,visualPreset,roleRecommendations:booleanOption(args['role-recommendations'],['senior','female','child'].includes(role),'--role-recommendations'),roleRestSpaceId:args['role-rest-space-id'] || '',roleSkin,roleCardVariant,roleIllustrations,overviewLayout,homeModules,overviewMetrics,overviewCategories,informationDensity,homeSpaceRequired,homeSpaceSelection,homeSpaceId:args['home-space-id'] || '',
  title: args.title ?? '我的家',
  titles: {
    'zh-CN': args.title ?? '我的家',
    'zh-TW': args['title-zh-tw'] ?? args.title ?? '我的家',
    en: args['title-en'] ?? (args.title === '我的家' ? 'My Home' : args.title) ?? 'My Home',
  },
  style,
  uiProfile: 'aqara',
  scope,
  tabs,
  studioHost: args['studio-host'] ?? '',
  studioBaseUrl: args['studio-base-url'] ?? '',
  apiPath: '/open/api/v1',
  requestMode: 'sdkMode',
  devicePageSize,
  backendPageSize: numberArg('backend-page-size', devicePageSize, 4, 200),
  definitionBatchSize: args['definition-batch-size'] === undefined
    ? numberArg('capability-batch-size', 40, 10, 80)
    : numberArg('definition-batch-size', 40, 10, 80),
  definitionConcurrency: numberArg('definition-concurrency', 2, 1, 4),
  enableOverviewIndex: !args['disable-overview-index'] && (['senior','child'].includes(role) && homeDeviceMode==='favorites' && homeModules.includes('devices') || homeModules.includes('spaceControl') || homeModules.includes('aiAssistant') || homeModules.includes('overview') && (overviewCategories || overviewMetrics.some(id=>['temperature','humidity','presence'].includes(id)))),
  overviewCatalogPageSize: numberArg('overview-catalog-page-size', 200, 40, 200),
  overviewDefinitionBatchSize: numberArg('overview-definition-batch-size', 40, 10, 80),
  overviewMaxDevices: numberArg('overview-max-devices', 200, 40, 1000),
  controlReadbackDelayMs: numberArg('control-readback-delay-ms', 2000, 500, 5000),
  cacheTtlSeconds: numberArg('cache-ttl-seconds', 300, 30, 1800),
  homeDeviceMode,
  homeModuleOrder,
  favoriteDevicesScope: args['favorite-devices-scope'] ?? '',
  maxFavoriteScenes: 10,
  favoriteSceneDefaults, defaultFavoriteSceneIds, overviewEnvironmentSpaceId:overviewEnvironmentSpaceId.trim(),
  favoriteScenesScope: args['favorite-scenes-scope'] ?? '',
  safeCommandCodes: String(args['safe-command-codes'] || '').split(',').map((value) => value.trim()).filter(Boolean),
  enableSpaceDeviceDetails: booleanOption(args['enable-space-device-details'], !role || role === 'male', 'enable-space-device-details'),
  enableDevicePairing: booleanOption(args['enable-device-pairing'], role === 'male', 'enable-device-pairing') && !args['read-only'],
  enableAutomationWrites: !args['read-only'],
  enableDeviceWrites: !args['read-only'],
  enableSceneExecution: !args['read-only'],
  allowDirectFetch: Boolean(args['allow-direct-fetch']),
};

if (config.allowDirectFetch && (!config.studioHost || !config.studioBaseUrl)) {
  fail('--allow-direct-fetch requires --studio-host and --studio-base-url');
}

mkdirSync(outputDir, { recursive: true });
cpSync(templateDir, outputDir, { recursive: true, filter: file => !['.DS_Store','__pycache__'].includes(basename(file)) });
const stylePath=join(outputDir,'styles.css');writeFileSync(stylePath,readFileSync(stylePath,'utf8')+rolePaint(roleSkin,{palette:!args['theme-tokens'] && (!args.style || style===preset.style),illustrations:roleIllustrations})+roleCardCSS(roleCardVariant)+presentationCSS(config)+(roleSkin!=='none'?customThemeCSS.replaceAll(':root',':root[data-role-skin]'):customThemeCSS)+seniorSizingCSS(config)+rolePresentationCSS(config)+compactOverviewCSS(config)+homeTechGlassCSS(config));
const configSource = `// Generated configuration. Never place credentials or physical device IDs in this file.\n` +
  `window.__LIFE_STUDIO_DASHBOARD_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
writeFileSync(join(outputDir, 'config.js'), configSource, 'utf8');

const indexPath = join(outputDir, 'index.html');
let index = readFileSync(indexPath, 'utf8').replaceAll('__DASHBOARD_TITLE__', escapeHtml(config.title));
index = index.replace('<html lang="zh-CN">', `<html lang="zh-CN" data-ui-profile="aqara" data-role-card-variant="${roleCardVariant}" data-role="${role}" data-overview-layout="${overviewLayout}"${roleSkin!=='none'?` data-role-skin="${roleSkin}"`:''} data-home-device-mode="${homeDeviceMode}" data-visual-preset="${visualPreset}" data-style="${style}" data-theme="light" data-studio-tab-count="${tabs.length}" style="--studio-tab-count:${tabs.length}">`);
if(homeDeviceMode==='favorites'){index=index.replace('id="favorite-devices-section" hidden','id="favorite-devices-section"');index=index.replace('id="device-section" class=','id="device-section" hidden class=');}
for (const tab of allowedTabs.filter(tab => !tabs.includes(tab))) {
  index = index.replace(new RegExp(`<section id="${tab}-panel"[^>]*>[\\s\\S]*?</section>`, 'g'), '');
  index = index.replace(new RegExp(`<button id="tab-${tab}"[^>]*>[\\s\\S]*?</button>`, 'g'), '');
}
if (tabs.length === 1) {
  index = index.replace('id="studio-tabbar"', 'id="studio-tabbar" hidden');
  index = index.replace(/(<section id="home-panel"[^>]*?) role="tabpanel" aria-labelledby="tab-home"/, '$1');
}
const metrics={online:'online-count',spaces:'space-count',scenes:'scene-count',temperature:'temperature-value',humidity:'humidity-value',presence:'presence-value'};for(const [id,element] of Object.entries(metrics))index=index.replace('<div><dd id="'+element+'"','<div data-overview-metric="'+id+'"><dd id="'+element+'"');
// Male puts real category controls before secondary statistics, resolved before first paint.
if(role==='male'){const links=index.match(/<div id="space-overview-links"[^>]*>[\s\S]*?<\/div>/);if(links){index=index.replace(links[0],'');index=index.replace('<dl id="summary-grid"',links[0]+'\n        <dl id="summary-grid"');}}
index=compactOverviewHTML(index,config);
if(role==='child'){
  const sprite=readFileSync(join(skillDir,'assets','child-scene-art.svg'),'utf8').trim();
  if(!index.includes('</body>'))fail('missing body close for child art');
  index=index.replace('</body>',sprite+'\n</body>');
}
index=reorderHomeModules(index,homeModuleOrder);
writeFileSync(indexPath, index, 'utf8');

if (args['with-preview']) buildPreview(workspaceDir);
console.log(workspaceDir);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
