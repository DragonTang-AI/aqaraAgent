// Generator-only contract. Themes may customize paint, never geometry or behavior.
export const themeColorTokens = new Set([
  '--canvas', '--glass', '--aqara-action', '--aqara-action-on', '--aqara-action-off', '--aqara-action-inverse',
  '--aqara-button-stateless', '--aqara-slider-track', '--aqara-slider-fill', '--aqara-card-primary',
  '--aqara-card-abnormal', '--aqara-card-inactive', '--aqara-card-offline', '--aqara-text-primary',
  '--aqara-text-secondary', '--aqara-text-tertiary', '--aqara-border-default', '--aqara-border-strong',
  '--tab-glass-tint', '--tab-selected-icon', '--overview-start', '--overview-middle', '--overview-end',
  '--favorite-device-control-ink', '--favorite-device-surface', '--favorite-device-offline', '--favorite-device-action-surface', '--favorite-device-alert-surface', '--favorite-device-check-fill', '--favorite-device-check-text',
  '--space-action-surface', '--space-batch-surface', '--space-selected-fill', '--space-selected-text', '--favorite-confirm-fill', '--favorite-confirm-text', '--favorite-scene-tint', '--overview-glow', '--focus-ring', '--sheet-glass', '--sheet-glow', '--directory-icon-tint',
  '--tab-text', '--tab-selected-text', '--tab-selection-fill',
  ...Array.from({length:5}, (_, i) => ['--scene-'+i+'-start', '--scene-'+i+'-end']).flat(),
]);

export function validateThemeTokens(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'dark,light') {
    throw new Error('theme tokens must contain exactly light and dark objects');
  }
  for (const mode of ['light', 'dark']) {
    const values = input[mode];
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) throw new Error(mode + ' theme must contain paint tokens');
    for (const [key, value] of Object.entries(values)) {
      if (!themeColorTokens.has(key)) throw new Error('Unsupported theme token (layout and behavior are fixed): ' + key);
      if (typeof value !== 'string') throw new Error('Theme color must be a string: ' + key);
      const color = value.trim();
      const hex = /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(color);
      const rgb = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
      const validRGB = rgb && rgb.slice(1,4).every(n => Number(n) >= 0 && Number(n) <= 255) &&
        (color.toLowerCase().startsWith('rgba') ? rgb[4] !== undefined : rgb[4] === undefined) && (rgb[4] === undefined || Number(rgb[4]) <= 1);
      if (!hex && !validRGB) throw new Error('Use a hex or rgb/rgba color only: ' + key);
    }
  }
  return input;
}

export function themeTokensCSS(input) {
  validateThemeTokens(input);
  return '\n/* Caller-supplied paint tokens; shared Aqara UI contract remains fixed. */\n' + ['light','dark'].map(mode =>
    ':root[data-style="custom"][data-theme="' + mode + '"]{' + Object.entries(input[mode]).map(([key,value]) => key + ':' + value.trim() + ';').join('') + '}').join('\n') + '\n';
}
