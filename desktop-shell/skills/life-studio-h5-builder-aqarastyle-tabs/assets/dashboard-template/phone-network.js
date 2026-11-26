(function installPhoneNetwork(global, document) {
  'use strict';
  let status = 'unknown';
  let studioUnavailable = false;
  let disposeNative = null;
  const listeners = new Set();
  const banner = document.getElementById('phone-offline-banner');
  const label = document.getElementById('phone-offline-text');
  const retry = document.getElementById('phone-offline-retry');
  const words = {
    'zh-CN': ['网络异常，请重试', '重试', '无法访问 Studio'],
    'zh-TW': ['網路異常，請重試', '重試', '無法存取 Studio'],
    en: ['Network unavailable. Try again', 'Retry', 'Unable to access Studio'],
  };
  function copy() { return words[global.LifeI18n && global.LifeI18n.getLocale() || 'zh-CN'] || words['zh-CN']; }
  function render() {
    const offline = status === 'offline';
    const reason = offline ? 'phone' : studioUnavailable ? 'studio' : '';
    document.documentElement.dataset.phoneNetwork = status;
    document.documentElement.dataset.statusBanner = reason;
    banner.hidden = !reason;
    banner.dataset.reason = reason;
    label.textContent = reason === 'studio' ? copy()[2] : copy()[0];
    retry.textContent = copy()[1];
    banner.setAttribute('aria-label', label.textContent);
  }
  function set(next) {
    if (!['online','offline','unknown'].includes(next) || next === status) return;
    const previous = status;
    status = next;
    render();
    listeners.forEach(listener => listener(status, previous));
    if (previous === 'offline' && next === 'online') {
      const tab = global.StudioTabs && global.StudioTabs.active();
      const refresh = tab && tab !== 'home' ? global.StudioTabs.refresh : global.StudioHomeRefresh && global.StudioHomeRefresh.refresh;
      if (typeof refresh === 'function') void refresh().catch(() => {});
    }
  }
  function start() {
    if (disposeNative || !global.LifeBridge || typeof global.LifeBridge.subscribePhoneNetworkStatus !== 'function') return;
    disposeNative = global.LifeBridge.subscribePhoneNetworkStatus(value => set(value.status));
  }
  retry.addEventListener('click', () => {
    const tab = global.StudioTabs && global.StudioTabs.active();
    const refresh = tab && tab !== 'home' ? global.StudioTabs.refresh : global.StudioHomeRefresh && global.StudioHomeRefresh.refresh;
    if (typeof refresh === 'function') void refresh().catch(() => {});
  });
  global.addEventListener('pagehide', () => { if (disposeNative) disposeNative(); disposeNative = null; });
  global.addEventListener('pageshow', event => { if (event.persisted) start(); });
  global.addEventListener('offline', () => { if (!global.LifeBridge || !global.LifeBridge.capabilities().includes('getCurrentPhoneNetworkStatus')) set('offline'); });
  global.addEventListener('online', () => { if (!global.LifeBridge || !global.LifeBridge.capabilities().includes('getCurrentPhoneNetworkStatus')) set('online'); });
  if (global.LifeI18n && global.LifeI18n.onChange) global.LifeI18n.onChange(render);
  global.LifePhoneNetwork = Object.freeze({
    status: () => status,
    isOffline: () => status === 'offline',
    unavailableText: () => copy()[2],
    errorText: () => copy()[0],
    setStudioUnavailable(value) { const next = value === true; if (studioUnavailable === next) return; studioUnavailable = next; render(); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
  render(); start();
})(window, document);
