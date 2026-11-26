(function (global) {
  'use strict';
  function showNativePage(kind, content, onClose) {
    if (document.querySelector('.preview-mine-overlay')) return;
    const locale = global.LifeI18n.getLocale();
    const isPairing = kind === 'device-pairing';
    const isAI = kind === 'ai-assistant';
    const words = isPairing ? (locale === 'en' ? ['Add device · Simulated','The App opens device setup here. Preview does not scan, connect or add real devices.','Close'] : locale === 'zh-TW' ? ['新增設備 · 模擬預覽','App 中開啟設備入網頁；此預覽不掃描、連線或新增真實設備。','關閉'] : ['添加设备 · 模拟预览','App 中打开设备入网页；此预览不扫描、连接或添加真实设备。','关闭']) : isAI ? (locale === 'en' ? ['AI assistant · Simulated', 'The App opens its AI conversation page here. This preview does not send messages or control devices.', 'Close'] : locale === 'zh-TW' ? ['AI 助手 · 模擬預覽', 'App 中開啟 AI 對話頁；此預覽不傳送訊息或控制裝置。', '關閉'] : ['AI 助手 · 模拟预览', 'App 中打开 AI 对话页；此预览不发送消息或控制设备。', '关闭']) : (locale === 'en' ? ['Me · Simulated', 'The App opens its native personal center here.', 'Close'] : locale === 'zh-TW' ? ['我的 · 模擬預覽', 'App 中開啟真實的原生個人中心。', '關閉'] : ['我的 · 模拟预览', 'App 中打开真实的原生个人中心。', '关闭']);
    const overlay = document.createElement('div'); overlay.className = 'preview-mine-overlay';
    const panel = document.createElement('section'); panel.className = 'preview-mine-panel'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-label',words[0]);
    if (isAI) panel.classList.add('preview-ai-panel');
    if (isPairing) panel.classList.add('preview-pairing-panel');
    const title = document.createElement('h2'); title.textContent = words[0];
    const description = document.createElement('p'); description.textContent = words[1];
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'preview-mine-close'; closeButton.textContent = words[2];
    const focused = (isAI && content ? Array.from(document.querySelectorAll('.ai-assistant-chip')).find(button => button.textContent.trim() === content) : null) || (isPairing ? document.querySelector('.directory-add-device') : null) || document.getElementById(isAI ? 'ai-assistant-button' : 'mine-button') || document.activeElement, app = document.getElementById('app'), inert = app.inert, overflow = document.body.style.overflow;
    const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); app.inert = inert; document.body.style.overflow = overflow; if (focused && focused.isConnected) focused.focus(); if (onClose) onClose(); };
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); close(); } else if (event.key === 'Tab') { event.preventDefault(); closeButton.focus(); } };
    closeButton.addEventListener('click',close); overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    panel.append(title,description);
    if (isAI && content) { const question = document.createElement('p'); question.className = 'preview-ai-question'; question.textContent = content; panel.append(question); }
    panel.append(closeButton); overlay.append(panel); document.body.append(overlay);
    app.inert = true; document.body.style.overflow = 'hidden'; document.addEventListener('keydown',onKey); closeButton.focus();
  }
  function install(scenario, theme, report) {
    if (global.webkit || global.ReactNativeWebView || global.invokeCSharpAction || global.__AQARA_NATIVE_CONTEXT__) throw new Error('Preview cannot run inside a native host');
    const model = global.PreviewStudio.create(scenario);
    const studioStatus = Object.assign({}, scenario.studioHeader || { studioDid:'mock-studio-'+scenario.id, studioName:'Example Studio', connectStatus:'local' });
    let phoneNetworkStatus = scenario.phoneNetworkStatus === 'offline' ? 'offline' : 'online';
    let pageSequence = 0, pageVisible = true, aiAgentEnabled = scenario.aiAgentEnabled !== false;
    const pageVisibility = visible => { pageVisible = visible; pageSequence++; global.H5Invoke('PageVisibilityChanged',{documentId:'preview-page',sequence:pageSequence,visible}); };
    global.__AQARA_NATIVE_CONTEXT__ = { platform: 'preview', capabilities: ['getCurrentPageVisibility', 'nativeHttpRequest', 'subscribeThemeMode', 'openDevicePlugin', 'openAddDevice', 'openNavigationDrawer', 'openAIAssistant', 'aiAssistantInitialMessage', 'subscribeUserAIAgentStatus', 'getCurrentStudioConnectStatus', 'subscribeStudioConnectStatus', 'unsubscribeStudioConnectStatus', 'getCurrentPhoneNetworkStatus', 'subscribePhoneNetworkStatus', 'unsubscribePhoneNetworkStatus', 'subscribeDataChanges', 'unsubscribeDataChanges'] };
    global.webkit = { messageHandlers: { nativeBridge: { postMessage(invocation) {
      const action = invocation.action, data = invocation.data || {};
      setTimeout(function () {
        try {
          let response;
          if (action === 'getCurrentPageVisibility') response={code:0,data:{documentId:'preview-page',sequence:pageSequence,visible:pageVisible}};
          else if (action === 'nativeHttpRequest') { if (phoneNetworkStatus === 'offline') throw new Error('Phone network unavailable'); response = model.request(data); }
          else if (action === 'getCurrentPhoneNetworkStatus' || action === 'subscribePhoneNetworkStatus') response = { code:0, data:{status:phoneNetworkStatus} };
          else if (action === 'unsubscribePhoneNetworkStatus') response = { code:0, data:{accepted:true} };
          else if (action === 'getCurrentStudioConnectStatus' || action === 'subscribeStudioConnectStatus') response = { code:0, data:Object.assign({},studioStatus) };
          else if (action === 'subscribeUserAIAgentStatus') response = { code:0, data:{status:aiAgentEnabled} };
          else if (action === 'unsubscribeStudioConnectStatus') response = { code:0, data:{accepted:true} };
          else if (action === 'subscribeDataChanges') response = { code:0, data:{accepted:data.studioDid===studioStatus.studioDid && Array.isArray(data.watchedTraits) && data.watchedTraits.length<=4096} };
          else if (action === 'unsubscribeDataChanges') response = { code:0, data:{accepted:true} };
          else if (action === 'subscribeThemeMode') response = { code: 0, data: { themeMode: theme } };
          else if (action === 'openAddDevice') { pageVisibility(false); showNativePage('device-pairing', null, () => pageVisibility(true)); report('operation', { kind: 'device-pairing' }); response = { code:0, data:{accepted:true} }; }
          else if (action === 'openNavigationDrawer') { showNativePage('navigation-drawer'); report('operation', { kind: 'navigation-drawer' }); response = { code: 0, data: { accepted: true } }; }
          else if (action === 'openAIAssistant') { if (!aiAgentEnabled) response = { code:0, data:{accepted:false,reason:'disabled',status:false} }; else { const content = typeof data.content === 'string' ? data.content.trim() : ''; showNativePage('ai-assistant', content); report('operation', { kind: 'ai-assistant', ...(content ? { content } : {}) }); response = { code: 0, data: { accepted: true } }; } }
          else if (action === 'openDevicePlugin') {
            if (!scenario.devices.some(item => item.deviceId === data.deviceId)) throw new Error('Unknown device');
            report('operation', { kind: 'device-plugin', deviceId: data.deviceId, deviceName: data.deviceName }); response = { code: 0, data: { accepted: true } };
          } else throw new Error('Unsupported preview capability: ' + action);
          if (action === 'nativeHttpRequest' && data.method === 'POST' && !data.url.endsWith('/users/me/metadata/query')) report('operation', { kind: 'simulated-write', route: data.url });
          global.H5Invoke(data.onSuccess, response);
        } catch (error) { global.H5Invoke(data.onFailed, { code: 400, message: error.message }); }
      }, 60);
    } } } };
    global.PreviewPhoneNetwork = Object.freeze({ setStatus(value) { if (!['online','offline'].includes(value)) throw new Error('Invalid preview network status'); phoneNetworkStatus=value; global.H5Invoke('PhoneNetworkStatusUpdate',{status:value}); } });
  }
  global.PreviewHost = Object.freeze({ install });
})(window);
