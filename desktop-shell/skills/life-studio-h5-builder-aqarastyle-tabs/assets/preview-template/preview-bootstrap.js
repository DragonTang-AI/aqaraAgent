(async function () {
  'use strict';
  const query = new URLSearchParams(location.search);
  const settings = window.__PREVIEW_SETTINGS__;
  const scenario = query.get('scenario') || 'typical';
  const theme = query.get('themeMode') === 'dark' ? 'dark' : 'light';
  const language = ['zh-CN','zh-TW','en'].includes(query.get('language')) ? query.get('language') : 'zh-CN';
  const instanceId = query.get('instanceId') || 'standalone';
  let parentOrigin = '';
  try { const parsed = new URL(query.get('parentOrigin')); if (['http:','https:'].includes(parsed.protocol) && parsed.origin === query.get('parentOrigin')) parentOrigin = parsed.origin; } catch (_) { /* standalone */ }
  function report(type, payload) {
    if (parentOrigin && parent !== window) parent.postMessage({ protocol: 'life-preview', version: '1.0', instanceId, type, payload }, parentOrigin);
  }
  function load(src) { return new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('Cannot load preview asset')); document.body.append(script); }); }
  try {
    if (!window.__PREVIEW_SCENARIOS__[scenario]) throw new Error('Unknown preview scenario');
    // Each iframe gets its own volatile cache, including same-origin sibling frames.
    window.PreviewHost.install(window.__PREVIEW_SCENARIOS__[scenario], theme, report);
    const cache = new Map();
    Object.defineProperty(window, 'sessionStorage', { value: Object.freeze({ getItem: key => cache.has(String(key)) ? cache.get(String(key)) : null, setItem: (key, value) => cache.set(String(key), String(value)), removeItem: key => cache.delete(String(key)), clear: () => cache.clear(), key: index => [...cache.keys()][index] || null, get length() { return cache.size; } }) });
    const preferences = new Map();
    Object.defineProperty(window, 'localStorage', { value: Object.freeze({ getItem:key=>preferences.get(String(key)) || null, setItem:(key,value)=>preferences.set(String(key),String(value)), removeItem:key=>preferences.delete(String(key)), clear:()=>preferences.clear() }) });
    for (const src of settings.scripts) await load(src);
    window.LifeI18n.setLocale(language);
    const badge = document.createElement('span'); badge.className = 'preview-badge'; badge.textContent = '模拟预览 · Simulated'; document.body.append(badge);
    // Sample media is presentation-only and never enters the WebRTC runtime.
    const attach = () => document.querySelectorAll('.camera-stream-viewport').forEach(viewport => {
      if (viewport.querySelector('.preview-camera')) return;
      const button = document.createElement('button'); button.className = 'preview-camera'; button.textContent = '示例画面 / Sample';
      button.addEventListener('click', event => { event.stopPropagation(); const image = document.createElement('img'); image.src = '../preview/sample-camera.svg'; image.className = 'preview-camera-image'; image.alt = 'Simulated camera image'; viewport.append(image); button.remove(); }); viewport.append(button);
    });
    const observer = new MutationObserver(attach); observer.observe(document.querySelector('#device-grid'), { childList: true }); attach();
    addEventListener('pagehide', () => observer.disconnect(), { once: true });
    addEventListener('message', event => {
      const message = event.data;
      if (!parentOrigin || event.source !== parent || event.origin !== parentOrigin || !message || message.protocol !== 'life-preview' || message.version !== '1.0' || message.instanceId !== instanceId) return;
      if (message.type === 'phone-network') { if (message.payload && ['online','offline'].includes(message.payload.status)) window.PreviewPhoneNetwork.setStatus(message.payload.status); return; }
      if (message.type !== 'configure' && message.type !== 'reset') return;
      const value = message.payload || {};
      if (value.scenario !== undefined && !Object.hasOwn(window.__PREVIEW_SCENARIOS__, value.scenario)) return;
      if (value.theme !== undefined && !['light','dark'].includes(value.theme)) return;
      if (value.language !== undefined && !['zh-CN','zh-TW','en'].includes(value.language)) return;
      const next = new URL(location.href);
      if (value.scenario) next.searchParams.set('scenario', value.scenario);
      if (value.theme) next.searchParams.set('themeMode', value.theme);
      if (value.language) next.searchParams.set('language', value.language);
      location.replace(next.href);
    });
    addEventListener('error', event => report('error', { message: event.message }));
    addEventListener('unhandledrejection', event => report('error', { message: String(event.reason && event.reason.message || event.reason) }));
    report('ready', { scenario, theme, language });
  } catch (error) {
    document.body.replaceChildren(); const message = document.createElement('p'); message.textContent = error.message; document.body.append(message); report('error', { message: error.message });
  }
})();
