(function installLifeBridge(global) {
  'use strict';

  const callbacks = new Map();
  const eventListeners = new Map();
  let sequence = 0;

  function parsePayload(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  function bridgeError(payload, fallback) {
    const value = payload && typeof payload === 'object' ? payload : {};
    const error = new Error(value.message || fallback || 'Life native bridge request failed');
    error.code = value.code;
    error.data = value.data;
    return error;
  }

  function dispatch(name, rawPayload) {
    const payload = parsePayload(rawPayload);
    const callback = callbacks.get(name);
    if (callback) {
      callbacks.delete(name);
      clearTimeout(callback.timer);
      if (callback.kind === 'failure' || (payload && typeof payload === 'object' && Number(payload.code) !== 0)) {
        callback.reject(bridgeError(payload));
      } else {
        callback.resolve(payload);
      }
      return;
    }
    const listeners = eventListeners.get(name);
    if (listeners) listeners.forEach((listener) => listener(payload));
  }

  const previousH5Invoke = typeof global.H5Invoke === 'function' ? global.H5Invoke : null;
  global.H5Invoke = function H5Invoke(name, payload) {
    dispatch(String(name), payload);
    if (previousH5Invoke) previousH5Invoke(name, payload);
  };

  function nativeContext() {
    return global.__AQARA_NATIVE_CONTEXT__ || null;
  }

  function capabilities() {
    const context = nativeContext();
    const values = context && context.capabilities;
    return Array.isArray(values) ? values : [];
  }

  function responseData(payload) {
    const data = payload && typeof payload === 'object' ? payload.data : undefined;
    return data === null || data === undefined ? payload : data;
  }

  function webkitPostMessage() {
    const webkit = global.webkit;
    const handlers = webkit && webkit.messageHandlers;
    const bridge = handlers && handlers.nativeBridge;
    const postMessage = bridge && bridge.postMessage;
    return typeof postMessage === 'function' ? postMessage.bind(bridge) : null;
  }

  function reactNativePostMessage() {
    const webView = global.ReactNativeWebView;
    const postMessage = webView && webView.postMessage;
    return typeof postMessage === 'function' ? postMessage.bind(webView) : null;
  }

  function launchContext() {
    const query = new URLSearchParams(global.location.search);
    return Object.freeze({
      deviceId: query.get('did') || '',
      themeMode: query.get('themeMode') || '',
      language: query.get('language') || '',
    });
  }

  function hasAndroidPromptTransport() {
    const context = nativeContext();
    const navigator = global.navigator;
    const platform = String(context && context.platform || '').toLowerCase();
    const userAgent = String(navigator && navigator.userAgent || '');
    return typeof global.prompt === 'function' &&
      (platform === 'android' || /\b(?:Android|Adr)\b/i.test(userAgent));
  }

  function hasTransport() {
    return Boolean(
      hasAndroidPromptTransport() ||
      webkitPostMessage() ||
      typeof global.invokeCSharpAction === 'function' ||
      reactNativePostMessage(),
    );
  }

  function supports(method) {
    const declared = capabilities();
    return hasTransport() && (declared.length === 0 || declared.includes(method));
  }

  function post(invocation) {
    if (hasAndroidPromptTransport()) {
      global.prompt(String(invocation.action), JSON.stringify(invocation.data || {}));
      return;
    }
    const webkitPost = webkitPostMessage();
    if (webkitPost) {
      webkitPost(invocation);
      return;
    }
    if (typeof global.invokeCSharpAction === 'function') {
      global.invokeCSharpAction(JSON.stringify(invocation));
      return;
    }
    const reactNativePost = reactNativePostMessage();
    if (reactNativePost) {
      reactNativePost(JSON.stringify(invocation));
      return;
    }
    throw new Error('Aqara Life native bridge is unavailable');
  }

  function invoke(method, parameters, options) {
    const timeoutMs = options && options.timeoutMs !== null && options.timeoutMs !== undefined ? options.timeoutMs : 15000;
    if (!supports(method)) return Promise.reject(new Error(`Life bridge capability is unavailable: ${method}`));
    sequence += 1;
    const prefix = `lifeH5_${Date.now()}_${sequence}`;
    const successName = `${prefix}_success`;
    const failureName = `${prefix}_failure`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        callbacks.delete(successName);
        callbacks.delete(failureName);
        reject(new Error(`Life bridge timed out: ${method}`));
      }, timeoutMs);
      callbacks.set(successName, { kind: 'success', resolve, reject, timer });
      callbacks.set(failureName, { kind: 'failure', resolve, reject, timer });
      try {
        post({
          action: method,
          data: { ...(parameters || {}), onSuccess: successName, onFailed: failureName },
        });
      } catch (error) {
        callbacks.delete(successName);
        callbacks.delete(failureName);
        clearTimeout(timer);
        reject(error);
      }
    }).finally(() => {
      callbacks.delete(successName);
      callbacks.delete(failureName);
    });
  }

  function onNativeEvent(name, listener) {
    const listeners = eventListeners.get(name) || new Set();
    listeners.add(listener);
    eventListeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) eventListeners.delete(name);
    };
  }

  async function getStudioAuthInfo(host) {
    if (!host) throw new Error('Studio host is required before requesting Studio auth info');
    const response = await invoke('getStudioAuthInfo', { host });
    return responseData(response);
  }

  async function nativeHttpRequest(request) {
    const timeoutMs = request && request.timeoutMs !== null && request.timeoutMs !== undefined ? request.timeoutMs : 30000;
    return invoke('nativeHttpRequest', request, { timeoutMs });
  }

  async function openNavigationDrawer() {
    const method = 'openNavigationDrawer';
    // New native UI actions require an explicit host advertisement, including legacy hosts.
    if (!capabilities().includes(method) || !supports(method)) throw new Error('Navigation drawer is unavailable');
    const response = await invoke(method, {}, { timeoutMs: 8000 });
    const data = responseData(response);
    if (!data || data.accepted !== true) throw new Error('Navigation drawer was not accepted');
    return data;
  }

  async function openAIAssistant(content) {
    const method = 'openAIAssistant';
    if (!capabilities().includes(method) || !supports(method)) throw new Error('AI assistant is unavailable');
    const question = typeof content === 'string' ? content.trim() : '';
    if (content != null && typeof content !== 'string') throw new TypeError('AI content must be a string');
    if (question && !capabilities().includes('aiAssistantInitialMessage')) throw new Error('AI question navigation is unavailable');
    const response = await invoke(method, question ? { content: question } : {}, { timeoutMs: 8000 });
    const data = responseData(response);
    if (data && data.accepted === false && data.reason === 'disabled') {
      const error = new Error('AI assistant is disabled');
      error.reason = 'disabled';
      throw error;
    }
    if (!data || data.accepted !== true) throw new Error('AI assistant was not accepted');
    return data;
  }

  function normalizeUserAIAgentStatus(payload) {
    const data = responseData(payload);
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.status !== 'boolean') {
      throw new Error('Invalid AI Agent status response');
    }
    return data.status;
  }

  function subscribeUserAIAgentStatus(listener) {
    if (typeof listener !== 'function') throw new TypeError('AI Agent status listener must be a function');
    let disposed = false, eventRevision = 0, requestRevision = 0;
    const deliver = payload => {
      if (disposed) return;
      let enabled;
      try { enabled = normalizeUserAIAgentStatus(payload); }
      catch (_) { enabled = false; }
      listener(enabled);
    };
    const disposeEvent = onNativeEvent('UserAIAgentStatusUpdate', payload => {
      eventRevision += 1;
      deliver(payload);
    });
    const start = () => {
      if (disposed) return;
      const method = 'subscribeUserAIAgentStatus';
      if (!capabilities().includes(method) || !supports(method)) { listener(false); return; }
      const eventAtStart = eventRevision, request = ++requestRevision;
      invoke(method, {}, { timeoutMs: 8000 })
        .then(payload => { if (!disposed && request === requestRevision && eventAtStart === eventRevision) deliver(payload); })
        .catch(() => { if (!disposed && request === requestRevision && eventAtStart === eventRevision) listener(false); });
    };
    start();
    const onNativeContextReady = () => start();
    if (typeof global.addEventListener === 'function') global.addEventListener('aqara:native-context-ready', onNativeContextReady);
    const onVisibility = () => { if (!global.document.hidden) start(); };
    if (global.document && typeof global.document.addEventListener === 'function') global.document.addEventListener('visibilitychange', onVisibility);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      disposeEvent();
      if (typeof global.removeEventListener === 'function') global.removeEventListener('aqara:native-context-ready', onNativeContextReady);
      if (global.document && typeof global.document.removeEventListener === 'function') global.document.removeEventListener('visibilitychange', onVisibility);
    };
    dispose.refresh = start;
    return dispose;
  }

  async function openAddDevice() {
    const method = 'openAddDevice';
    if (!capabilities().includes(method) || !supports(method)) throw new Error('Device pairing is unavailable');
    const response = await invoke(method, {}, { timeoutMs: 8000 });
    const data = responseData(response);
    if (!data || data.accepted !== true) throw new Error('Device pairing was not accepted');
    return data;
  }

  function normalizeStudioConnectStatus(payload) {
    const data = responseData(payload);
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !['local', 'cloud', 'error', 'unknown'].includes(data.connectStatus) ||
        typeof data.studioDid !== 'string' || typeof data.studioName !== 'string') {
      throw new Error('Invalid Studio status response');
    }
    if (data.connectStatus === 'unknown') return Object.freeze({ studioDid: '', studioName: '', connectStatus: 'unknown' });
    const studioDid = data.studioDid.trim();
    if (!studioDid) throw new Error('Missing Studio identity in status response');
    const value = { studioDid, studioName: data.studioName.trim(), connectStatus: data.connectStatus };
    if (data.connectStatus === 'error' && Number.isInteger(data.errorCode)) value.errorCode = data.errorCode;
    return Object.freeze(value);
  }

  async function getCurrentStudioConnectStatus() {
    const method = 'getCurrentStudioConnectStatus';
    if (!capabilities().includes(method) || !supports(method)) throw new Error('Studio status is unavailable');
    return normalizeStudioConnectStatus(await invoke(method, {}, { timeoutMs: 8000 }));
  }

  function subscribeStudioConnectStatus(listener) {
    let disposed = false, eventRevision = 0;
    const unknown = () => Object.freeze({ studioDid: '', studioName: '', connectStatus: 'unknown' });
    const deliver = payload => { if (disposed) return; let value; try { value = normalizeStudioConnectStatus(payload); } catch (_) { value = unknown(); } listener(value); };
    const disposeEvent = onNativeEvent('StudioConnectStatusUpdate', payload => { eventRevision += 1; deliver(payload); });
    const read = () => {
      const revision = eventRevision;
      getCurrentStudioConnectStatus().then(value => { if (!disposed && revision === eventRevision) deliver(value); })
        .catch(() => { if (!disposed && revision === eventRevision) listener(unknown()); });
    };
    const method = 'subscribeStudioConnectStatus';
    let subscribed = false;
    const startSubscription = () => {
      if (disposed || subscribed || !capabilities().includes(method) || !supports(method)) return false;
      subscribed = true;
      const revision = eventRevision;
      invoke(method, {}, { timeoutMs: 8000 }).then(value => { if (!disposed && revision === eventRevision) deliver(value); })
        .catch(() => { subscribed = false; if (!disposed && revision === eventRevision) read(); });
      return true;
    };
    if (!startSubscription()) read();
    const onNativeContextReady = () => { startSubscription(); };
    if (typeof global.addEventListener === 'function') global.addEventListener('aqara:native-context-ready', onNativeContextReady);
    const onVisibility = () => { if (!global.document.hidden) read(); };
    if (global.document && typeof global.document.addEventListener === 'function') global.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (disposed) return; disposed = true; disposeEvent();
      if (typeof global.removeEventListener === 'function') global.removeEventListener('aqara:native-context-ready', onNativeContextReady);
      if (global.document && typeof global.document.removeEventListener === 'function') global.document.removeEventListener('visibilitychange', onVisibility);
      const stop = 'unsubscribeStudioConnectStatus';
      if (subscribed && capabilities().includes(stop) && supports(stop)) invoke(stop, {}, { timeoutMs: 8000 }).catch(() => {});
    };
  }

  function normalizePhoneNetworkStatus(payload) {
    const data = responseData(payload);
    if (!data || typeof data !== 'object' || !['online','offline','unknown'].includes(data.status)) throw new Error('Invalid phone network status');
    return Object.freeze({ status: data.status });
  }

  async function getCurrentPhoneNetworkStatus() {
    const method = 'getCurrentPhoneNetworkStatus';
    if (!capabilities().includes(method) || !supports(method)) return { status: 'unknown' };
    return normalizePhoneNetworkStatus(await invoke(method, {}, { timeoutMs: 8000 }));
  }

  function subscribePhoneNetworkStatus(listener) {
    let disposed = false, eventRevision = 0, subscribed = false;
    const deliver = payload => { if (disposed) return; try { listener(normalizePhoneNetworkStatus(payload)); } catch (_) { listener({ status: 'unknown' }); } };
    const disposeEvent = onNativeEvent('PhoneNetworkStatusUpdate', payload => { eventRevision += 1; deliver(payload); });
    const read = () => { const revision = eventRevision; getCurrentPhoneNetworkStatus().then(value => { if (!disposed && revision === eventRevision) deliver(value); }).catch(() => { if (!disposed && revision === eventRevision) listener({ status: 'unknown' }); }); };
    const start = () => {
      const method = 'subscribePhoneNetworkStatus';
      if (disposed || subscribed || !capabilities().includes(method) || !supports(method)) return false;
      subscribed = true; const revision = eventRevision;
      invoke(method, {}, { timeoutMs: 8000 }).then(value => { if (!disposed && revision === eventRevision) deliver(value); }).catch(() => { subscribed = false; read(); });
      return true;
    };
    if (!start()) read();
    const onContext = () => { start(); };
    const onVisibility = () => { if (!global.document.hidden) read(); };
    global.addEventListener('aqara:native-context-ready', onContext);
    global.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (disposed) return; disposed = true; disposeEvent();
      global.removeEventListener('aqara:native-context-ready', onContext);
      global.document.removeEventListener('visibilitychange', onVisibility);
      if (subscribed && capabilities().includes('unsubscribePhoneNetworkStatus')) invoke('unsubscribePhoneNetworkStatus', {}, { timeoutMs: 8000 }).catch(() => {});
    };
  }

  function normalizeDashboardWatchedTraits(value) {
    if (!Array.isArray(value) || value.length > 4096) throw new TypeError('Invalid dashboard watch list');
    const rows = [], seen = new Set();
    for (const item of value) {
      if (!item || typeof item.deviceId !== 'string' || !item.deviceId.trim() || item.deviceId.length > 256 ||
          !Number.isInteger(item.endpointId) || item.endpointId < 0 ||
          typeof item.functionCode !== 'string' || !item.functionCode.trim() || item.functionCode.length > 256 ||
          typeof item.traitCode !== 'string' || !item.traitCode.trim() || item.traitCode.length > 256) {
        throw new TypeError('Invalid dashboard watch point');
      }
      const point = { deviceId: item.deviceId.trim(), endpointId: item.endpointId,
        functionCode: item.functionCode.trim(), traitCode: item.traitCode.trim() };
      const key = JSON.stringify(point);
      if (!seen.has(key)) { seen.add(key); rows.push(point); }
    }
    return rows;
  }

  function subscribeDataChanges(listener, options) {
    const studioDid = options && typeof options.studioDid === 'string' ? options.studioDid.trim() : '';
    let watchedTraits = normalizeDashboardWatchedTraits(options && options.watchedTraits || []);
    let disposed = false, attempted = false, queuedSignature = '';
    let pending = Promise.resolve();
    const disposeEvent = onNativeEvent('DataChanged', payload => {
      if (disposed) return;
      if (!payload || typeof payload !== 'object' || Number(payload.code) !== 0) return;
      const data = responseData(payload);
      if (!data || typeof data !== 'object' || typeof data.studioDid !== 'string' || !data.studioDid.trim() ||
          data.studioDid.trim() !== studioDid || !['device', 'collections'].includes(data.kind)) return;
      const items = data.kind === 'device' && Array.isArray(data.items) ? data.items.slice(0, 200).filter(item =>
        item && typeof item.deviceId === 'string' && item.deviceId.trim() && Number.isInteger(item.endpointId) && item.endpointId >= 0 &&
        typeof item.functionCode === 'string' && item.functionCode && typeof item.traitCode === 'string' && item.traitCode &&
        (typeof item.value === 'string' || typeof item.value === 'number' || typeof item.value === 'boolean'))
        .map(item => ({ deviceId: item.deviceId.trim(), endpointId: item.endpointId, functionCode: item.functionCode, traitCode: item.traitCode, value: item.value,
          ...(Number.isSafeInteger(item.time) && item.time > 0 ? { time: item.time } : {}) })) : [];
      const reason = data.kind === 'collections' && ['subscriptionAck','sessionRecovery','object'].includes(data.reason) ? data.reason : '';
      const collection = reason === 'object' && ['spaces','scenes'].includes(data.collection) ? data.collection : '';
      listener({ studioDid: data.studioDid.trim(), kind: data.kind, items, reason, collection });
    });
    const start = () => {
      const method = 'subscribeDataChanges';
      if (disposed || !studioDid || !capabilities().includes(method) || !capabilities().includes('unsubscribeDataChanges') ||
          !supports(method) || !supports('unsubscribeDataChanges')) return;
      const signature = JSON.stringify(watchedTraits);
      if (signature === queuedSignature) return;
      queuedSignature = signature;
      const points = watchedTraits;
      pending = pending.then(async () => {
        if (disposed || signature !== JSON.stringify(watchedTraits)) return;
        attempted = true;
        const response = await invoke(method, { studioDid, watchedTraits: points }, { timeoutMs: 35000 });
        const data = responseData(response);
        if ((!data || data.accepted !== true) && queuedSignature === signature) queuedSignature = '';
      }).catch(() => { if (queuedSignature === signature) queuedSignature = ''; });
    };
    start();
    if (typeof global.addEventListener === 'function') global.addEventListener('aqara:native-context-ready', start);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      disposeEvent();
      if (typeof global.removeEventListener === 'function') global.removeEventListener('aqara:native-context-ready', start);
      pending.then(() => {
        if (attempted && capabilities().includes('unsubscribeDataChanges') && supports('unsubscribeDataChanges'))
          return invoke('unsubscribeDataChanges', {}, { timeoutMs: 8000 }).catch(() => {});
      });
    };
    dispose.updateWatchedTraits = value => {
      if (disposed) return;
      watchedTraits = normalizeDashboardWatchedTraits(value);
      start();
    };
    return dispose;
  }

  async function subscribeThemeMode(listener) {
    const dispose = onNativeEvent('onThemeModeChanged', (payload) => {
      const data = responseData(payload);
      listener(data && data.themeMode === 'dark' ? 'dark' : 'light');
    });
    try {
      const response = await invoke('subscribeThemeMode', {});
      const data = responseData(response);
      listener(data && data.themeMode === 'dark' ? 'dark' : 'light');
    } catch {
      const queryTheme = new URLSearchParams(global.location.search).get('themeMode');
      listener(queryTheme === 'dark' ? 'dark' : 'light');
    }
    return dispose;
  }

  function subscribeLanguage(listener) {
    const disposers = [
      onNativeEvent('onLanguageChanged', (payload) => { const data = responseData(payload); listener(data && (data.language || data.locale)); }),
      onNativeEvent('languageChanged', (payload) => { const data = responseData(payload); listener(data && (data.language || data.locale)); }),
    ];
    const onDOMLanguage = (event) => { const detail = event && event.detail; listener(detail && (detail.language || detail.locale)); };
    if (typeof global.addEventListener === 'function') global.addEventListener('aqara:language-changed', onDOMLanguage);
    const navigator = global.navigator;
    listener(launchContext().language || (navigator && navigator.language) || 'zh-CN');
    return () => {
      disposers.forEach((dispose) => dispose());
      if (typeof global.removeEventListener === 'function') global.removeEventListener('aqara:language-changed', onDOMLanguage);
    };
  }

  function subscribePageVisibility(listener) {
    // Strict opt-in: an undeclared capability is not proof that an older host implements it.
    if(!capabilities().includes('getCurrentPageVisibility'))return () => {};
    let stopped=false,documentId='',last=-1,events=0;
    function receive(payload){
      const value=responseData(payload);
      if(stopped || !value || typeof value.documentId!=='string' || !value.documentId || typeof value.visible!=='boolean' || !Number.isInteger(value.sequence) || value.sequence<0)return;
      if(documentId && documentId!==value.documentId)return;
      if(value.sequence<=last)return;
      documentId=value.documentId;last=value.sequence;listener(value);return true;
    }
    const dispose=onNativeEvent('PageVisibilityChanged',payload=>{if(receive(payload))events++;});
    const version=events;
    invoke('getCurrentPageVisibility',{}).then(payload=>{if(events===version)receive(payload);}).catch(()=>{});
    return ()=>{stopped=true;dispose();};
  }

  global.LifeBridge = Object.freeze({
    nativeContext,
    capabilities,
    launchContext,
    hasTransport,
    supports,
    invoke,
    onNativeEvent,
    getStudioAuthInfo,
    nativeHttpRequest,
    openNavigationDrawer,
    openAIAssistant,
    subscribeUserAIAgentStatus,
    openAddDevice,
    getCurrentStudioConnectStatus,
    subscribeStudioConnectStatus,
    getCurrentPhoneNetworkStatus,
    subscribePhoneNetworkStatus,
    subscribeDataChanges,
    subscribePageVisibility,
    subscribeThemeMode,
    subscribeLanguage,
  });
})(window);
