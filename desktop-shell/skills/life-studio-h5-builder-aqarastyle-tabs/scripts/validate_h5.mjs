#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { validateWorkspace } from './preview-package.mjs';
import { validatePresentation } from './role-profiles.mjs';
import { validateHomeModuleOrder } from './home-layout.mjs';

const packageDir = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(packageDir) || !statSync(packageDir).isDirectory()) {
  console.error('usage: node validate_h5.mjs <package-directory>');
  process.exit(1);
}

const required = ['index.html', 'config.js', 'life-bridge.js', 'phone-network.js', 'camera-webrtc-readiness.js', 'camera-session-provider.js', 'camera-webrtc-runtime.js', 'i18n.js', 'studio-runtime.js', 'dashboard.js','favorite-metadata.js','favorite-scenes.js','favorite-devices.js','favorite-speaker.js','space-control.js', 'styles.css', 'tabs.css', 'studio-tabs-runtime.js', 'space-filter.js','studio-tabs.js'];
const errors = [];
// The platform's normal runtime gate also rejects stale derived canvas resources.
if (basename(packageDir) === 'runtime' && (existsSync(join(dirname(packageDir),'manifest.json')) || existsSync(join(dirname(packageDir),'preview')))) {
  try { validateWorkspace(dirname(packageDir)); } catch (error) { errors.push(error.message); }
}
function checkCleanOutput(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (/^(?:qa|tests?|screenshots|test-results|playwright-report)$/i.test(entry.name) || /^(?:qa[-_]|verification[-_])/i.test(entry.name)) errors.push(`verification artifact is forbidden in deliverable: ${path}`);
    if (/\.png$/i.test(entry.name)) errors.push(`PNG assets are forbidden in deliverable: ${path}`);
    if (entry.isFile() && /\.svg$/i.test(entry.name) && /data:image\/png/i.test(readFileSync(join(directory,entry.name),'utf8'))) errors.push(`embedded PNG is forbidden: ${path}`);
    if (entry.isDirectory()) checkCleanOutput(join(directory, entry.name), path + '/');
  }
}
checkCleanOutput(packageDir);

for (const file of required) {
  if (!existsSync(join(packageDir, file))) errors.push(`missing ${file}`);
}

const sources = Object.fromEntries(
  required.filter((file) => existsSync(join(packageDir, file))).map((file) => [file, readFileSync(join(packageDir, file), 'utf8')]),
);

const html = sources['index.html'] ?? '';
if (html.includes('id="refresh-button"')) errors.push('top-right refresh button must not appear in generated dashboards');
function validateOverviewRender(source, config) {
  const start = source.indexOf('function renderOverviewSummary(');
  const end = start < 0 ? -1 : source.indexOf('\n  function scheduleOverviewIndex(', start);
  if (start < 0 || end < 0) {
    errors.push('dashboard overview render function is missing or cannot be isolated');
    return;
  }
  const render = source.slice(start, end).trim();
  const cases = [
    { name: 'deferred', overview: null },
    { name: 'loading', overview: { status: 'loading', indexedDeviceCount: 1, deviceTotalCount: 3 } },
    { name: 'complete', overview: { status: 'complete', indexedDeviceCount: 3, deviceTotalCount: 3, temperature: { value: 22, spaceCount: 1 }, humidity: { value: 45, spaceCount: 1 }, presence: { monitoredSpaceCount: 1, occupiedSpaceCount: 0 } } },
  ];
  for (const layout of new Set([config.overviewLayout, 'compact'])) {
    for (const item of cases) {
      const node = () => ({ textContent: '', hidden: false });
      const elements = Object.fromEntries(['temperatureValue','humidityValue','presenceValue','temperatureLabel','humidityLabel','presenceLabel','onlineCount','spaceCount','sceneCount','summaryDetail','summaryLabel','overviewCoverage'].map(key => [key, node()]));
      elements.onlineCount.textContent = '2'; elements.spaceCount.textContent = '1'; elements.sceneCount.textContent = '1';
      const context = { config: { ...config, overviewLayout: layout }, elements, overview: item.overview, currentSnapshot: { spaces: [] }, t: key => key };
      try { runInNewContext(`${render}\nrenderOverviewSummary(overview);`, context, { timeout: 300 }); }
      catch (error) { errors.push(`dashboard overview render failed (${layout}/${item.name}): ${error.name}: ${error.message}`); return; }
    }
  }
}
try {
  const configMatch = (sources['config.js'] || '').match(/Object\.freeze\(([\s\S]*)\);/);
  const parsedConfig = JSON.parse(configMatch?.[1] || '{}');
  validateOverviewRender(sources['dashboard.js'] ?? '', parsedConfig);
  if (parsedConfig.uiProfile !== 'aqara' || !html.includes('data-ui-profile="aqara"')) errors.push('all themes require the shared Aqara UI profile');
  if (!['aqara','apple','ha','custom'].includes(parsedConfig.style) || !html.includes('data-style="' + parsedConfig.style + '"')) errors.push('theme skin differs from initial HTML');
  try { validateHomeModuleOrder(html,parsedConfig.homeModuleOrder); } catch(error) { errors.push(error.message); }
  try { validatePresentation(parsedConfig,html); } catch(error) { errors.push(error.message); }
  if(['senior','child'].includes(parsedConfig.role)){
    if(!sources['dashboard.js'].includes('favoriteKeys=automaticRoleCollections?[]'))errors.push('automatic roles must exclude all official favorite metadata keys');
    if(!sources['styles.css'].includes('#scene-edit,#favorite-devices-edit'))errors.push('automatic roles must hide add actions before first paint');
    for(const file of ['favorite-scenes.js','favorite-devices.js'])if(!sources[file].includes('if(options.automatic)return;'))errors.push(file+' must guard the automatic-role editor');
    if(!sources['favorite-scenes.js'].includes('automaticScenes(catalog,options.role)'))errors.push('automatic role scenes must project the real catalog');
  }
  const homeMode = parsedConfig.homeDeviceMode || 'space';
  if (!['space','favorites'].includes(homeMode)) errors.push('invalid Home device module mode');
  if (!html.includes('data-home-device-mode="'+homeMode+'"')) errors.push('Home device mode differs from initial HTML');
  if(parsedConfig.homeModuleOrder!==undefined){
    for(const [id,hidden] of [['device-section',homeMode==='favorites'],['favorite-devices-section',homeMode!=='favorites']]){const tag=html.match(new RegExp('<section\\b[^>]*id=\"'+id+'\"[^>]*>'))?.[0]||'';if(/\bhidden\b/.test(tag)!==hidden)errors.push('Home device mode must be correct before startup: '+id);}
  }

  if (!html.includes('id="favorite-devices-section"') || !html.includes('id="device-section"')) errors.push('missing mutually exclusive Home module containers');
  const tabs = parsedConfig.tabs;
  const allowed = ['home', 'devices', 'automation'];
  if (!Array.isArray(tabs) || tabs[0] !== 'home' || tabs.some(tab => !allowed.includes(tab)) || new Set(tabs).size !== tabs.length) errors.push('invalid or missing config.tabs');
  else {
    for (const tab of allowed) {
      const enabled = tabs.includes(tab);
      if (html.includes(`id="tab-${tab}"`) !== enabled || html.includes(`id="${tab}-panel"`) !== enabled) errors.push(`tab markup differs from config.tabs: ${tab}`);
    }
    if (!html.includes(`data-studio-tab-count="${tabs.length}"`)) errors.push('incorrect tab count in initial HTML');
    if ((/id="studio-tabbar" hidden/.test(html)) !== (tabs.length === 1)) errors.push('tab bar must be hidden only for Home-only packages');
  }
} catch { errors.push('invalid generated page configuration'); }
if(!html.includes('src="space-filter.js"') || html.indexOf('src="space-filter.js"')>html.indexOf('src="studio-tabs.js"'))errors.push('space filter must load before the optional directory controller');
if(!html.includes('src="favorite-metadata.js"') || html.indexOf('src="favorite-metadata.js"')>html.indexOf('src="favorite-scenes.js"'))errors.push('shared metadata store must load before favorite modules');
if (!/<script\b[^>]*src=["']favorite-devices\.js["'][^>]*>/.test(html)) errors.push('favorite-devices.js must load in the production entry');
if (!/<script\b[^>]*src=["']favorite-speaker\.js["'][^>]*>/.test(html) || html.indexOf('src="favorite-speaker.js"') > html.indexOf('src="studio-runtime.js"')) errors.push('favorite-speaker.js must load before runtime inspection');
if (html.indexOf('src="favorite-devices.js"') > html.indexOf('src="dashboard.js"')) errors.push('favorite module must load before dashboard startup');
const favoriteTag=html.match(/<script\b[^>]*src=["']favorite-devices\.js["'][^>]*>/)?.[0] || '';
const dashboardTag=html.match(/<script\b[^>]*src=["']dashboard\.js["'][^>]*>/)?.[0] || '';
if (/\basync\b/.test(favoriteTag) || /\bdefer\b/.test(favoriteTag) !== /\bdefer\b/.test(dashboardTag)) errors.push('favorite module and dashboard require consistent ordered script loading');
const mainCount = (html.match(/<main\b/gi) || []).length;
if (mainCount !== 1) errors.push(`expected exactly one semantic main landmark, found ${mainCount}`);
for (const ref of [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1])) {
  if (/^(?:https?:)?\/\//i.test(ref)) errors.push(`external asset is forbidden: ${ref}`);
  if (!ref.startsWith('#') && !/^(?:data:|mailto:|tel:)/.test(ref) && !existsSync(join(packageDir, ref.split(/[?#]/)[0]))) {
    errors.push(`missing referenced asset: ${ref}`);
  }
}

const allText = Object.values(sources).join('\n');
if (/\.png\b|data:image\/png/i.test(allText)) errors.push('production code must not reference PNG assets or embedded PNG data');
const requiredTokens = [
  'nativeHttpRequest',
  'hasAndroidPromptTransport',
  'global.prompt',
  "headers: { source: 'studio' }",
  'launchContext',
  "path: '/devices'",
  "path: '/spaces'",
  "path: '/devices/definitions'",
  "path: '/devices/trait/execute'",
  "path: '/devices/trait/read'",
  "path: '/devices/command/execute'",
  "path: '/scenes'",
  "path: '/scenes/execute'",
  "path: '/automations/manual-triggers/execute'",
  'loadDevicePage',
  'loadOverviewIndex',
  'overviewCatalogPageSize',
  'overviewDefinitionBatchSize',
  'environmentReading',
  'indexedDeviceCount',
  'overview-coverage',
  'loadNextPage',
  'readBackDevice',
  'TargetPositionPercentage',
  'CurrentPositionPercentage',
  'has-curtain-range',
  '--range-progress',
  'HeaterCoolerMode',
  'CoolingTemperature',
  'HeatingTemperature',
  'CurrentTemperature',
  'has-climate-panel',
  'climate-panel',
  'isPresentationReading',
  'presentationReadings',
  'capabilityDetailsModel',
  'lightDirectControls',
  'device-direct-controls',
  'is-direct',
  'capability-details',
  'has-capability-details',
  'capabilitySheetLabel',
  'openDeviceDetails',
  'closeDetails',
  'unknownValue',
  'control.id',
  "input.addEventListener('input'",
  "input.addEventListener('change'",
  "input.addEventListener('pointerdown'",
  "input.addEventListener('pointerup'",
  "input.addEventListener('touchend'",
  "input.addEventListener('keyup'",
  'lastCommittedValue',
  'captureLayoutAnchor',
  'restoreLayoutAnchor',
  'overflow-anchor:none',
  'controlReadbackDelayMs',
  'safeCommandCodes',
  'loadCached',
  'sessionStorage',
  'subscribeLanguage',
  "'zh-CN'",
  "'zh-TW'",
  'devicePageSize',
  'pull-indicator',
  'updated-at',
  'aria-atomic',
  '--tap-size:44px',
  'safe-area-inset-top',
  'safe-area-inset-right',
  'safe-area-inset-bottom',
  'safe-area-inset-left',
  'width:100%;max-width:780px',
  'width:calc(100% - 32px);max-width:380px',
  'top:0;right:0;bottom:0;left:0',
  'overflow-wrap:break-word;overflow-wrap:anywhere',
  '@supports not (aspect-ratio:1/1)',
  '--range-thumb-bottom',
  'padding-top:56.25%',
  '.studio-tabbar button:focus,.directory-row:focus',
  'top:var(--safe-top)',
  '--top-chrome-header-height',
  '--top-chrome-opacity',
  'touch-action:manipulation',
  'prefers-reduced-motion:reduce',
  'function makeDeviceCard',
  'function setDeviceControlPending',
  'function controlValuesEqual',
  'captureViewportAnchor',
  'stableDeviceGridHeights',
  'updateFilterSelection',
  'pendingControls',
  'controlOperations',
  'hasMoreDevices',
  'updateDeviceCardState',
  'capability-sheet-panel',
  'capability-sheet-source',
  'has-device-detail-action',
  "card.setAttribute('aria-haspopup', 'dialog')",
  "card.setAttribute('aria-expanded', 'false')",
  'function openCapabilitySheet',
  'function closeCapabilitySheet',
  'function controlTargets',
  'function cardClickIsControl',
  'containSheetGesture',
  "'touchmove'",
  "'wheel'",
  'touch-action:pan-y',
  'touch-action:auto',
  'overscroll-behavior:none',
  '.capability-body[hidden]',
  'hasRenderedContent',
  'WebRTCProvideOffer',
  'WebRTCSignalingEvent',
  'cameraWebRTCPrepareLive',
  'cameraWebRTCCreateSession',
  'cameraWebRTCAddIceCandidate',
  'cameraWebRTCCloseSession',
  'WebRTCProvideICECandidates',
  'onCameraWebRTCSignal',
  'waitForIceGathering',
  'waitForMediaReady',
  'normalizeAnswerSDP',
  "line.startsWith('a=candidate:')",
  "panel.dataset.streamAvailability = offline ? 'offline'",
  "offline ? t('offline') : t('cameraPlay')",
  'camera-stream-video',
];
for (const token of requiredTokens) {
  if (!allText.includes(token)) errors.push(`missing required runtime token: ${token}`);
}

const forbiddenPatterns = [
  [/Bearer\s+[A-Za-z0-9._~-]{12,}/i, 'embedded bearer credential'],
  [/(?:access|refresh)[_-]?token\s*[:=]\s*["'][^"']{8,}["']/i, 'embedded token value'],
  [/(?:localStorage|sessionStorage|indexedDB)[\s\S]{0,180}(?:accessToken|refreshToken|Authorization)/i, 'credential persistence'],
  [/\b(?:mock|demo)(?:Devices?|Scenes?|Data|Snapshot)\b/i, 'production mock/demo data'],
  [/__POINT_ALIASES__/i, 'captured physical point aliases'],
  [/<dialog\b|\.showModal\s*\(/i, 'HTML dialog API incompatible with Life iOS 15.1'],
  [/requestConfirmation|confirm-dialog|confirmDialog/i, 'second confirmation UI'],
  [/\?\./, 'optional chaining is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\?\?/, 'nullish coalescing is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\.replaceAll\s*\(/, 'String.replaceAll is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\.replaceChildren\s*\(/, 'Node.replaceChildren is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/Promise\.allSettled\s*\(/, 'Promise.allSettled is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\.at\s*\(/, 'Array.at is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/(?:^|[;{])\s*inset\s*:/im, 'CSS inset shorthand is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\bwidth\s*:\s*min\s*\(/i, 'CSS min() sizing is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/(?:bottom|top|left|right)\s*:[^;}]*clamp\s*\(/i, 'CSS clamp() positioning is unsupported by the Chromium 74 Android WebView compatibility target'],
  [/\.camera-stream-viewport\s*\{[^}]*aspect-ratio\s*:/is, 'camera layout must not depend on aspect-ratio in Chromium 74'],
  [/color-mix\s*\(/i, 'CSS color-mix incompatible with Life iOS 15.1'],
  [/(?:column-count|column-width|column-span)\s*:/i, 'CSS multi-column masonry can fragment interactive cards in Life WKWebView'],
  [/serviceWorker/i, 'service worker unsupported for the local plugin package'],
  [/(?:class=["'][^"']*\bskip-link\b|\.skip-link\s*\{)/i, 'viewport-fixed skip link unsupported by the single-navigation Life layout'],
  [/<details\b[^>]*class=["'][^"']*\bcapability-details\b|createElement\(["']details["']\)[\s\S]{0,180}capability-details/i, 'native details capability disclosure can trigger implicit WKWebView scrolling'],
  [/GetDevicesFullRequest|GetDeviceInfoRequest|ExecuteTraitRequest|ExecuteCommandRequest|ExecuteAutomationManualTriggerRequest/i, 'legacy Studio root-envelope operation'],
  [/\/devices\/definitions\/full/i, 'internal Studio full-definition endpoint'],
  [/[🎨🚀⚙🏠💡🔒🌡]/u, 'emoji used as a structural icon'],
  [/\.device-toggle\s*\{[^}]*height:\s*(?:[0-3]?\d|4[0-3])px/isu, 'device switch touch target below 44px'],
];
for (const [pattern, label] of forbiddenPatterns) {
  if (pattern.test(allText)) errors.push(`forbidden ${label}`);
}

const applicationJs = ['config.js', 'i18n.js', 'studio-runtime.js', 'dashboard.js'].map((file) => sources[file] ?? '').join('\n');
if (/(?:window|global)\.webkit|(?:window|global)\.prompt\s*\(|ReactNativeWebView|invokeCSharpAction/.test(applicationJs)) {
  errors.push('application code must use LifeBridge instead of binding directly to an iOS or Android transport');
}

const dashboardControlFlow = (sources['dashboard.js'] ?? '').match(/async function handleDevice[\s\S]*?async function handleScene/)?.[0] ?? '';
if (/\brefresh\s*\(/.test(dashboardControlFlow)) errors.push('device control must not trigger a collection refresh');
if (/\brenderDevices\s*\(/.test(dashboardControlFlow)) errors.push('device control must reconcile only the operated card, not rebuild the device collection');
if (/\breplaceDeviceCard\s*\(/.test(dashboardControlFlow)) errors.push('device control must update the existing operated card in place, not replace it');
const sceneControlFlow = (sources['dashboard.js'] ?? '').match(/async function handleScene[\s\S]*?async function loadMoreDevices/)?.[0] ?? '';
if (/\brenderScenes\s*\(/.test(sceneControlFlow)) errors.push('scene control must update the existing scene button in place, not rebuild the scene collection');
const categoryClickFlow = (sources['dashboard.js'] ?? '').match(/button\.addEventListener\('click', \(\) => \{ if \(activeSpace === id\)[\s\S]*?renderDevices\(anchor\);(?: renderAIAssistant\(currentSnapshot\);)? \}\)/)?.[0] ?? '';
if (!categoryClickFlow || /\brenderFilters\s*\(/.test(categoryClickFlow)) errors.push('space switching must retain existing filter nodes and update selection in place');

if (!/<meta\s+name=["']viewport["'][^>]*content=["'][^"']*viewport-fit=cover/i.test(html)) errors.push('viewport meta must opt into host safe-area geometry with viewport-fit=cover');
const styles = sources['styles.css'] ?? '';
if (!/\.capability-sheet-content\{[^}]*overflow-y:auto/is.test(styles)) errors.push('device-details sheet needs an internally scrollable content region');
if (!/\.topbar\s*\{[^}]*top:\s*var\(--safe-top\)/is.test(styles)) errors.push('sticky header must stop below the host top safe area');
if (!/body::before\s*\{[^}]*height:\s*(?:var\(--safe-top\)|calc\(var\(--safe-top\)[^;}]*\))[^}]*pointer-events:\s*none/is.test(styles)) errors.push('missing noninteractive host status-area guard');

for (const file of ['config.js', 'life-bridge.js', 'phone-network.js', 'camera-webrtc-readiness.js', 'camera-session-provider.js', 'camera-webrtc-runtime.js', 'i18n.js', 'studio-runtime.js', 'dashboard.js','favorite-metadata.js','favorite-scenes.js','favorite-devices.js','favorite-speaker.js','space-control.js', 'studio-tabs-runtime.js', 'space-filter.js','studio-tabs.js']) {
  if (!sources[file]) continue;
  const result = spawnSync(process.execPath, ['--check', join(packageDir, file)], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${file} syntax error: ${(result.stderr || result.stdout).trim()}`);
}

if (errors.length > 0) {
  console.error(`INVALID ${basename(packageDir)}`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`VALID ${basename(packageDir)} (${required.length} required files, no external assets, overview render, syntax and safety checks passed)`);
