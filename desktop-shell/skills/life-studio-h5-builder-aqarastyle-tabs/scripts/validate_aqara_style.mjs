#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { themeColorTokens } from './theme-tokens.mjs';

const packageDir = resolve(process.argv[2] || '');
const errors = [];

function source(name) {
  const path = join(packageDir, name);
  if (!existsSync(path)) {
    errors.push(`missing ${name}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

const configSource = source('config.js');
const dashboard = source('dashboard.js');
const styles = source('styles.css');
const index = source('index.html');

let config = null;
try {
  const context = { window: {} };
  vm.runInNewContext(configSource, context, { filename: 'config.js' });
  config = context.window.__LIFE_STUDIO_DASHBOARD_CONFIG__;
} catch (error) {
  errors.push(`invalid config.js: ${error.message}`);
}

if (!['aqara','apple','ha','custom'].includes(config?.style)) errors.push('unknown theme skin');
if (config?.uiProfile !== 'aqara') errors.push('all themes must use config.uiProfile aqara');
if (!index.includes('data-ui-profile="aqara"')) errors.push('shared Aqara UI profile must be present before startup');
for (const match of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!match[1].includes('[data-style=')) continue;
  const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!/^:root\[data-style="(?:aqara|apple|ha|custom)"\]\[data-theme="(?:light|dark)"\]$/.test(selector)) errors.push('theme skin must use a root light/dark token selector');
  for (const declaration of match[2].split(';').map(value => value.trim()).filter(Boolean)) {
    const key = declaration.split(':')[0];
    if (!themeColorTokens.has(key) && key !== '--device-card-shadow') errors.push('theme skin overrides layout or unsupported token: ' + key);
  }
}

const requiredCssFragments = [
  ':root[data-ui-profile="aqara"]',
  '--aqara-action:#2e51ff',
  '--aqara-action-on:#2e51ff',
  '--aqara-action-off:#fff',
  '--aqara-slider-track:#e1e4f0',
  '--aqara-slider-fill:#2e51ff',
  '--aqara-card-primary:#fff',
  '--aqara-card-abnormal:#ffffffb2',
  '--aqara-card-inactive:#ffffffb2',
  '--aqara-card-inactive:#2c2b38',
  '--aqara-card-offline:#ffffffb2',
  '--aqara-card-offline:#2c2b38',
  '--aqara-text-primary:#000',
  '--aqara-text-secondary:#00000080',
  '--aqara-card-on:#fff',
  '--aqara-card-off:#ffffffb2',
  '[data-ui-profile="aqara"] .device-grid',
  '[data-ui-profile="aqara"] .home-studio-heading h1',
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '.device-card.aqara-size-s',
  '.device-card.aqara-size-m',
  '.device-card.aqara-size-l',
  '.device-card.aqara-size-xl',
  '.aqara-size-l.has-curtain-range',
  '.capability-sheet-layer',
  'touch-action:auto;overscroll-behavior:none',
  'touch-action:pan-y',
  '.capability-sheet-source{display:none!important}',
  '.device-card.has-device-detail-action',
  '.range-vertical-visual',
  '.range-control.is-color-temperature',
  '.device-direct-controls',
  '.range-control.is-direct',
  '.device-toggle::before',
  '.device-card.has-climate-panel .device-toggle[aria-checked="true"]::before',
  '.range-control input::-webkit-slider-thumb',
];
for (const fragment of requiredCssFragments) {
  if (!styles.includes(fragment)) errors.push(`missing Aqara CSS contract fragment: ${fragment}`);
}

for (const fragment of [
  "['aqara', 'apple', 'ha', 'custom'].includes(config.style)",
  "source: 'aqara-confirmed-light'",
  "source: 'aqara-adapted'",
  'card.dataset.designSource = aqaraProfile.source',
  'card.dataset.cardSize = aqaraProfile.size.toUpperCase()',
  'function lightDirectControls',
  "verticalVisual.className = 'range-vertical-visual'",
  "verticalThumb.className = 'range-vertical-thumb'",
  'const thumbBottom = Math.max(0, Math.min(76, progress * 1.08 - 16))',
  'function directControlsModel',
  'function isScalarPresentationReading',
  'function isAqaraPresentationMetadataReading',
  'function compactTelemetry',
  'function openCapabilitySheet',
  'function closeCapabilitySheet',
  'function cardClickIsControl',
  'containSheetGesture',
  "card.setAttribute('aria-haspopup', 'dialog')",
  'function releaseDeviceGridHeight',
  'function deviceDetailText',
  "icon('power')",
  "device.category === 'curtain' && device.control && device.control.kind === 'range'",
  "headerNode.className = 'card-control-spacer'",
]) {
  if (!dashboard.includes(fragment)) errors.push(`missing Aqara dashboard mapping: ${fragment}`);
}

if (!styles.includes('--tap-size:44px')) errors.push('44px minimum touch-target token is missing');
if (!styles.includes('safe-area-inset-top')) errors.push('safe-area support is missing');
if (!styles.includes('[data-theme="dark"]')) errors.push('dark-theme support is missing');
if (/\.device-card\.has-capability-details\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i.test(styles)) errors.push('capability disclosure must not force every collapsed card to full width');
if (/\[data-style=["']aqara["']\][^{]*has-capability-details[^{]*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i.test(styles)) errors.push('Aqara capability disclosure must not override S/M/L/XL occupancy');
if (!dashboard.includes("return { size: 'm', source: 'aqara-confirmed-light' }")) errors.push('power-only pendant/chandelier and unspecified lights must retain the M-card default');
if (!dashboard.includes("device.control.value ? ' is-on' : ' is-off'")) errors.push('Boolean cards must distinguish on and off visual states');
if (!styles.includes('.device-card.is-offline>*{opacity:.4}')) errors.push('only offline card content should use the confirmed 40% opacity');
if (!styles.includes('[data-ui-profile="aqara"] .device-card.is-offline{opacity:1}')) errors.push('Aqara offline cards must keep the card surface opaque');
if (!styles.includes('.device-card.is-off{background:var(--aqara-card-inactive)}')) errors.push('off cards across all categories must use the dedicated inactive surface');
if (!styles.includes('.device-card.is-offline{background:var(--aqara-card-offline)}')) errors.push('offline cards must use the dedicated semantic offline surface');
if (!styles.includes('[data-theme="dark"] .device-card.is-off{--surface:var(--aqara-card-inactive)')) errors.push('dark off cards must retain the dark-theme text family instead of becoming black-on-white cards');
if (!styles.includes('[data-theme="dark"] .device-card.is-offline{--surface:var(--aqara-card-offline)')) errors.push('dark offline cards must retain the dark-theme text family instead of inheriting black-on-white abnormal colors');
if (!/\.camera-stream-viewport\{[^}]*height:0;padding-top:56\.25%/.test(styles) || !/\.camera-stream-video\{[^}]*height:100%;object-fit:contain;object-position:center/.test(styles)) errors.push('camera media must preserve the complete source aspect ratio inside a responsive 16:9 viewport');
if (!styles.includes('.camera-stream-button:disabled{color:var(--aqara-text-secondary);background:transparent;box-shadow:inset 0 0 0 1px var(--separator);opacity:1}')) errors.push('disabled/offline camera actions must use the neutral outlined state instead of an active or white fill');
if (/\.device-card\.is-off[^\{]*\{[^}]*background\s*:\s*var\(--aqara-card-abnormal\)/.test(styles)) errors.push('Life H5 off cards must not map directly to the white dark abnormal token');
if (!styles.includes('.aqara-size-s .read-only-badge{display:none}')) errors.push('read-only S cards must not expose a control badge');
if (dashboard.includes("createElement('button'); summary") || dashboard.includes('capability-summary')) errors.push('device cards must not expose the obsolete visible capability footer');
if (!dashboard.includes("elements.deviceGrid.style.removeProperty('min-height')")) errors.push('temporary grid anti-clamping height must be released after category/disclosure layout settles');
if (/Math\.max\(stableDeviceGridHeights\.get\(key\)\s*\|\|\s*0,\s*height\)/.test(dashboard)) errors.push('grid height cache must store the latest measured content height, not a historical maximum');
if (/\b(?:html|body)\{[^}]*min-width:320px/.test(styles)) errors.push('root hard minimum width breaks zoom/large-text reflow below 320 effective CSS pixels');
if ((index.match(/<main\b/g) || []).length !== 1) errors.push('index.html must contain exactly one main landmark');

const forbidden = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\(?:Users|Documents|Desktop)\\/i,
  /aqara-smart-home-card-design\/(?:specs|references)\//,
];
if (/requestedStyle\s*(?:===|!==)\s*['"]aqara/.test(dashboard)) errors.push('theme must not gate Aqara control, telemetry or geometry behavior');

for (const [name, value] of [['config.js', configSource], ['dashboard.js', dashboard], ['styles.css', styles], ['index.html', index]]) {
  for (const pattern of forbidden) if (pattern.test(value)) errors.push(`${name} contains a non-portable visual-source dependency`);
}

if (!dashboard.includes("const directControls = device.category === 'light' ? []") || !dashboard.includes('light-adjust-source') || !styles.includes('.device-card .light-adjust')) errors.push('Home lights require compact cards and independent lazy adjustment controls');

if (errors.length) {
  console.error('AQARA STYLE INVALID');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('AQARA UI / THEME PASS (shared profile, tokens, responsive card mapping, provenance labels, touch targets, themes, safe areas, and source independence verified)');
