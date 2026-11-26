(function (global, document) {
  'use strict';
  const runtime = global.StudioTabsRuntime;
  const spaceFilter=global.StudioSpaceFilter;const spaceSelections={devices:[],smart:[]};let spaceIndex=spaceFilter.build([]),spaceKnown=false,spaceDialog=null,spaceOpening=false;
  const spaceScope=key=>key==='devices'?'devices':'smart';
  const selectedSpaces=key=>spaceSelections[spaceScope(key)];
  const selectedSpaceSets={devices:new Set(),smart:new Set()};
  const assignedSpace=item=>{const nested=item && item.space && item.space.spaceId;const value=nested==null || String(nested).trim()===''?item && item.spaceId:nested;return String(value==null?'':value).trim();};
  const config = global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {};
  const configured = config.tabs || ['home'];
  const order = ['home', 'devices', 'automation'];
  if (!Array.isArray(configured) || configured[0] !== 'home' || configured.some(tab => !order.includes(tab)) || new Set(configured).size !== configured.length) throw new Error('Invalid tab configuration');
  const tabs = order.filter(tab => configured.includes(tab));
  const $ = id => document.getElementById(id);
  document.documentElement.dataset.studioTabCount = String(tabs.length);
  document.documentElement.style.setProperty('--studio-tab-count', String(tabs.length));
  $('studio-tabbar').hidden = tabs.length === 1;
  const words = {
    'zh-CN': ['首页','设备','智能','场景','自动化','全部','离线','状态未知','未分配空间','正在读取…','读取失败，请重试','重试','加载更多','暂无设备','暂无场景','暂无自动化','没有匹配结果','搜索','清除搜索','关闭搜索','筛选设备','状态','类型','重置','确定','已停用','已启用','当前 App 未提供设备插件跳转，请更新 App 后重试','打开设备插件失败','自动化状态更新失败，请重试','执行场景','执行成功','操作失败，请重试','空间信息暂不可用，使用设备空间归属','已加载','共计','个设备','个场景','个自动化','在线','返回','我的','设备类型选项来自已加载设备；加载更多后自动补充'],
    'zh-TW': ['首頁','設備','智能','場景','自動化','全部','離線','狀態未知','未分配空間','正在讀取…','讀取失敗，請重試','重試','載入更多','暫無設備','暫無場景','暫無自動化','沒有符合的結果','搜尋','清除搜尋','關閉搜尋','篩選設備','狀態','類型','重置','確定','已停用','已啟用','目前 App 未提供設備外掛跳轉，請更新 App 後重試','開啟設備外掛失敗','自動化狀態更新失敗，請重試','執行場景','執行成功','操作失敗，請重試','空間資訊暫不可用，使用設備空間歸屬','已載入','共計','個設備','個場景','個自動化','在線','返回','我的','設備類型選項來自已載入設備；載入更多後自動補充'],
    en: ['Home','Devices','Smart','Scenes','Automations','All','Offline','Unknown status','Unassigned','Loading…','Unable to load. Try again.','Retry','Load more','No devices yet','No scenes yet','No automations yet','No matching results','Search','Clear search','Close search','Filter devices','Status','Type','Reset','Apply','Disabled','Enabled','Update the app to enable device plugin navigation','Unable to open device plugin','Unable to update automation status. Try again.','Run scene','Request accepted','Operation failed. Please try again.','Space details unavailable; using device assignments','Loaded','Total','devices','scenes','automations','Online','Back','Me','Device types come from loaded devices; load more to discover additional types']
  };
  const pairingWords = { 'zh-CN':['添加设备','当前 App 不支持添加设备，请更新 App 后重试','无法打开添加设备页面，请重试'], 'zh-TW':['新增設備','目前 App 不支援新增設備，請更新 App 後重試','無法開啟新增設備頁面，請重試'], en:['Add device','Update the App to add devices','Unable to open device setup. Try again.'] };
  const pairingText = index => (pairingWords[locale()] || pairingWords['zh-CN'])[index];
  let pairingAttempt = null;
  function locale() { return global.LifeI18n && global.LifeI18n.getLocale() || 'zh-CN'; }
  const t = index => (words[locale()] || words['zh-CN'])[index];
  const typeLabels = {
    light: ['照明','照明','Lighting'], switch: ['开关照明','開關照明','Switches'], gateway: ['网关中控','網關中控','Gateways'], hub: ['中枢','中樞','Hubs'], camera: ['摄像监控','攝影監控','Cameras'], windowcovering: ['遮阳控制','遮陽控制','Shades'], lock: ['智能门锁','智能門鎖','Locks'], sensor: ['传感监测','感測監測','Sensors'], thermostat: ['环境调节','環境調節','Climate'], outlet: ['插座','插座','Outlets']
  };
  function typeLabel(type) { const labels = typeLabels[String(type).toLowerCase()]; return labels ? labels[locale() === 'en' ? 2 : locale() === 'zh-TW' ? 1 : 0] : type; }
  let active = 'home'; let smartKey = 'scenes';
  const positions = { home: 0, devices: 0, automation: 0 }; const smartPositions = { scenes: 0, automations: 0 };
  const state = {};
  ['devices','scenes','automations'].forEach(key => { state[key] = { items: [], total: null, pageNum: 0, hasMore: false, loaded: false, busy: false, error: false, query: '', revision: 0, inFlight: false, queuedReset: false, errorReset: true }; });
  const searches = new Map(); const deviceTypes = new Set(); const filters = { offline: false, type: '' };
  const pendingAutomations = new Set(); const sceneActions = new Map();
  let names = new Map(); let spaceAttempted = false; let spacesPromise = null; let spaceWarning = false;
  let opening = false; let homeNeedsRefresh = false; let homeScenesDirty = false; let noticeTimer; let searchSession = null; let filterDialog = null;
  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, callback, className = 'directory-action') { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', callback); return node; }
  // Static, local SVG controls only; API text is always assigned through textContent.
  const paths = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', filter: '<path d="M3 4h18l-7 8v7l-4 2V12L3 4Z"/>', chevron: '<path d="m9 6 6 6-6 6"/>', play: '<path d="m9 5 11 7-11 7Z"/>', check: '<path d="m5 12 4 4L19 6"/>', menu: '<path d="M4 6h16M4 12h12M4 18h8"/>', add: '<path d="M12 5v14M5 12h14"/>' };
  function svg(name) { const holder = el('span','directory-symbol'); holder.setAttribute('aria-hidden','true'); holder.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + paths[name] + '</svg>'; return holder; }
  function iconButton(name, label, callback, className) { const node = button('', callback, className || 'directory-icon-button'); node.setAttribute('aria-label', label); node.append(svg(name)); return node; }
  function phoneOffline() { return Boolean(global.LifePhoneNetwork && global.LifePhoneNetwork.isOffline()); }
  function notice(text) { const node = $('toast'); clearTimeout(noticeTimer); node.textContent = phoneOffline() ? global.LifePhoneNetwork.errorText() : text; node.hidden = false; noticeTimer = setTimeout(() => { node.hidden = true; }, 3500); }
  function online(value) { return value === true || value === 1 || value === 'true' || value === '1' ? true : value === false || value === 0 || value === 'false' || value === '0' ? false : null; }
  function spaceName(item) { const space = item && item.space; const id = assignedSpace(item); return names.get(id) || space && space.name || item && item.spaceName || id || t(8); }
  function countText(key) {
    const data = state[key]; const count = key === 'scenes' ? visibleItems(key).length : data.total;
    if (data.error && !data.loaded) return '—';
    if (!data.loaded) return data.busy?t(9):'—';
    return (count === null ? t(34) + ' ' + data.items.length : t(35) + ' ' + count) + ' ' + t(key === 'devices' ? 36 : key === 'scenes' ? 37 : 38);
  }
  function visibleItems(key) { const data=state[key],ids=selectedSpaceSets[spaceScope(key)];return data.items.filter(item=>(!ids.size || ids.has(assignedSpace(item))) && (key!=='scenes' || !data.query || String(item.name || '').toLocaleLowerCase().includes(data.query.toLocaleLowerCase()))); }
  function updateCounts() {
    const device = $('devices-count'); if (device) device.textContent = countText('devices');
    const smart = $('smart-count'); if (smart) smart.textContent = countText('scenes') + (locale() === 'en' ? ' · ' : '，') + countText('automations');
  }
  function commitQuery(key) {
    const entry = searches.get(key); clearTimeout(entry.timer); entry.clear.hidden = !entry.input.value;
    const query = entry.input.value.trim(); if (query === state[key].query) return;
    const data = state[key]; data.query = query;
    if (key === 'scenes') { renderKey(key); return; }
    data.revision++; data.items = []; data.total = null; data.loaded = false; data.pageNum = 0; data.hasMore = false; data.error = false;
    if (searchSession && !query) { data.queuedReset = false; data.busy = data.inFlight; renderKey(key); return; }
    void load(key);
  }
  function searchControl(key) {
    const toolbar = el('div','directory-search-toolbar'); const wrapper = el('div','directory-search'); wrapper.append(svg('search'));
    const input = el('input','directory-search-input'); input.id = key + '-search'; input.type = 'search'; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('enterkeyhint','search');
    const clear = iconButton('close', t(18), () => { input.value = ''; commitQuery(key); input.focus(); }, 'directory-search-clear'); clear.hidden = true;
    const close = iconButton('close', t(19), () => closeSearch(), 'directory-search-close'); close.hidden = true;
    const entry = { input, clear, close, toolbar, timer: null, composing: false }; searches.set(key, entry);
    input.addEventListener('focus', () => openSearch(key));
    function schedule() { clearTimeout(entry.timer); clear.hidden = !input.value; if (!entry.composing) { if (!input.value.trim()) commitQuery(key); else entry.timer = setTimeout(() => commitQuery(key), 300); } }
    input.addEventListener('input', schedule);
    input.addEventListener('compositionstart', () => { entry.composing = true; clearTimeout(entry.timer); });
    input.addEventListener('compositionend', () => { entry.composing = false; schedule(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && !entry.composing) { event.preventDefault(); commitQuery(key); } if (event.key === 'Escape') closeSearch(); });
    wrapper.append(input, clear); toolbar.append(wrapper, close);
    const ranges=el('div','directory-range-toolbar');entry.ranges=ranges;entry.space=button('',()=>openSpaceFilter(key),'directory-space');entry.space.setAttribute('aria-haspopup','dialog');ranges.append(entry.space);
    if (key === 'devices') { entry.filter = iconButton('filter', t(20), () => openFilter(), 'directory-filter'); entry.filter.setAttribute('aria-haspopup','dialog'); ranges.append(entry.filter); }
    const fragment=document.createDocumentFragment();fragment.append(toolbar,ranges);return fragment;
  }
  function updateSearchLabels(key) {
    const entry = searches.get(key); if (!entry) return;
    entry.input.placeholder = t(17); entry.input.setAttribute('aria-label', t(17) + ' ' + t(key === 'devices' ? 1 : key === 'scenes' ? 3 : 4));
    entry.clear.setAttribute('aria-label', t(18)); entry.close.setAttribute('aria-label', t(19));
    entry.space.textContent=spaceWarning?spaceFilter.text('retry'):spaceFilter.label(selectedSpaces(key),spaceIndex)+' ▾';entry.space.classList.toggle('is-active',selectedSpaces(key).length>0);entry.space.disabled=Boolean(searchSession) || !spaceKnown && !spaceWarning;entry.space.setAttribute('aria-label',spaceFilter.text('title')+' · '+spaceFilter.label(selectedSpaces(key),spaceIndex));
    if (entry.filter) { entry.filter.disabled = state.devices.busy || state.devices.inFlight; entry.filter.setAttribute('aria-label',t(20)); entry.filter.classList.toggle('is-active', filters.offline || Boolean(filters.type)); entry.filter.setAttribute('aria-pressed',String(filters.offline || Boolean(filters.type))); }
  }
  function clearPairingAttempt() {
    const attempt = pairingAttempt; pairingAttempt = null;
    if (attempt && attempt.dispose) attempt.dispose();
  }
  function finishPairingReturn(attempt) {
    if (pairingAttempt !== attempt || !attempt.accepted || !attempt.hidden || !attempt.returned) return;
    clearPairingAttempt();
    if (active === 'devices') void refreshActive('devices');
    else { if (global.StudioRuntime.invalidateCollections) global.StudioRuntime.invalidateCollections(['/devices','/spaces']); state.devices.loaded = false; spaceAttempted = false; }
  }
  async function openAddDevice(trigger) {
    if (trigger.disabled) return;
    clearPairingAttempt();
    const bridge = global.LifeBridge;
    if (!bridge || !bridge.capabilities().includes('openAddDevice') || typeof bridge.openAddDevice !== 'function') { notice(pairingText(1)); return; }
    const attempt = { accepted: false, hidden: false, returned: false, dispose: null }; pairingAttempt = attempt;
    trigger.disabled = true; trigger.setAttribute('aria-busy','true');
    if (typeof bridge.subscribePageVisibility === 'function') attempt.dispose = bridge.subscribePageVisibility(value => {
      if (pairingAttempt !== attempt) return;
      if (!value.visible) attempt.hidden = true;
      else if (attempt.hidden) { attempt.returned = true; finishPairingReturn(attempt); }
    });
    try { await bridge.openAddDevice(); if (pairingAttempt === attempt) { attempt.accepted = true; finishPairingReturn(attempt); if (!bridge.capabilities().includes('getCurrentPageVisibility')) clearPairingAttempt(); } }
    catch (_) { if (pairingAttempt === attempt) { clearPairingAttempt(); notice(pairingText(2)); } }
    finally { trigger.disabled = false; trigger.removeAttribute('aria-busy'); }
  }
  global.addEventListener('pagehide', clearPairingAttempt);
  function heading(title, countId) {
    const head = el('header','directory-heading'); const toolbar = el('div','directory-navigation');
    toolbar.append(iconButton('menu', t(41), () => $('mine-button').click(), 'directory-menu'));
    if (countId === 'devices-count' && config.enableDevicePairing === true) { const add = iconButton('add', pairingText(0), () => { void openAddDevice(add); }, 'directory-add-device'); toolbar.append(add); }
    head.append(toolbar, el('h2','',title)); const count = el('p','directory-count'); count.setAttribute('role','status'); count.setAttribute('aria-atomic','true'); count.id = countId; head.append(count); return head;
  }
  function ensureViews() {
    if (tabs.includes('devices') && !$('devices-count')) { const root = $('devices-content'); root.append(heading(t(1),'devices-count'), searchControl('devices'), el('div','directory-body')); }
    if (tabs.includes('automation') && !$('smart-count')) {
      const root = $('automation-content'); root.append(heading(t(2),'smart-count'));
      const segment = el('div','smart-segment'); segment.setAttribute('role','tablist'); segment.setAttribute('aria-label',t(2));
      ['scenes','automations'].forEach((key, index) => {
        const tab = button(t(index + 3), () => selectSmart(key), 'smart-segment-tab'); tab.id = 'smart-tab-' + key; tab.setAttribute('role','tab'); tab.setAttribute('aria-controls',key + '-directory');
        tab.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'scenes' : event.key === 'End' ? 'automations' : smartKey === 'scenes' ? 'automations' : 'scenes'; selectSmart(next); $('smart-tab-' + next).focus({preventScroll:true}); } }); segment.append(tab);
        const section = el('section','directory-group smart-directory'); section.id = key + '-directory'; section.setAttribute('role','tabpanel'); section.setAttribute('aria-labelledby',tab.id); section.append(searchControl(key), el('div','directory-body')); root.append(section);
      }); root.insertBefore(segment, $('scenes-directory'));
    }
    syncSmart(); updateCounts();
  }
  function syncSmart() { ['scenes','automations'].forEach(key => { const section = $(key + '-directory'); if (!section) return; section.hidden = key !== smartKey; const tab = $('smart-tab-' + key); tab.setAttribute('aria-selected',String(key === smartKey)); tab.tabIndex = key === smartKey ? 0 : -1; }); }
  function selectSmart(key) {
    if (key === smartKey || searchSession) return;
    global.StudioPullRefresh.cancel(); smartPositions[smartKey] = global.scrollY;
    const segment = document.querySelector('.smart-segment'); const top = segment.getBoundingClientRect().top + global.scrollY - (parseFloat(global.getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0);
    const sticky = global.scrollY >= top; smartKey = key; syncSmart();
    global.scrollTo(0, sticky ? Math.max(top, smartPositions[key]) : global.scrollY);if(!state[key].loaded && !state[key].busy)void load(key);
  }
  function body(key) { return key === 'devices' ? document.querySelector('#devices-content > .directory-body') : document.querySelector('#' + key + '-directory > .directory-body'); }
  function rootFor(key) { return $(key === 'devices' ? 'devices-content' : 'automation-content'); }
  function lockPage(position) { const style = document.body.style; const saved = {position:style.position,top:style.top,width:style.width,overflow:style.overflow}; style.position = 'fixed'; style.top = -position + 'px'; style.width = '100%'; style.overflow = 'hidden'; return saved; }
  function unlockPage(saved) { Object.keys(saved).forEach(key => { document.body.style[key] = saved[key]; }); }
  function openSearch(key) {
    if (searchSession) return;
    global.StudioPullRefresh.cancel(); const data = state[key]; const entry = searches.get(key);
    searchSession = { key, position: global.scrollY, snapshot: { items: data.items, total: data.total, pageNum: data.pageNum, hasMore: data.hasMore, loaded: data.loaded, error: data.error, query: data.query } };
    searchSession.bodyStyle = lockPage(searchSession.position);
    const root = rootFor(key); root.classList.add('is-directory-searching'); root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label', t(17));
    root.addEventListener('keydown',trapSearchFocus);
    root.addEventListener('touchmove',dismissSearchKeyboard,{passive:true});
    document.documentElement.classList.add('has-directory-search'); $('studio-tabbar').hidden = true;
    if (key !== 'scenes') { data.revision++; data.items = []; data.loaded = false; data.total = null; data.queuedReset = false; }
    data.query = ''; entry.input.value = ''; entry.clear.hidden = true; entry.close.hidden = false; if (entry.filter) entry.filter.hidden = true;
    sizeSearch(); renderKey(key);
  }
  function dismissSearchKeyboard() { if (searchSession) searches.get(searchSession.key).input.blur(); }
  function trapSearchFocus(event) { if (event.key !== 'Tab') return; const nodes = Array.from(event.currentTarget.querySelectorAll('button:not([disabled]),input')).filter(node => node.getClientRects().length && !node.hidden); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  function sizeSearch() { if (searchSession) { const root = rootFor(searchSession.key), height = (global.visualViewport ? global.visualViewport.height : global.innerHeight) + 'px'; root.style.height = height; root.style.setProperty('--directory-search-height',height); } }
  if (global.visualViewport) global.visualViewport.addEventListener('resize',sizeSearch);
  document.addEventListener('keydown', event => { if (searchSession && event.key === 'Escape') { event.preventDefault(); closeSearch(); } });
  function closeSearch(immediate = false) {
    if (!searchSession) return;
    if (!immediate && !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      if (searchSession.closing) return;
      searchSession.closing = true; rootFor(searchSession.key).classList.add('is-directory-search-leaving');
      searches.get(searchSession.key).input.blur();
      searchSession.closeTimer = setTimeout(() => closeSearch(true),140); return;
    }
    clearTimeout(searchSession.closeTimer);
    const saved = searchSession; const data = state[saved.key]; const entry = searches.get(saved.key); searchSession = null;
    clearTimeout(entry.timer); entry.composing = false; entry.input.blur(); data.revision++; data.queuedReset = data.inFlight && !saved.snapshot.loaded;
    Object.assign(data, saved.snapshot); data.busy = false; entry.input.value = data.query; entry.clear.hidden = !data.query; entry.close.hidden = true; if (entry.filter) entry.filter.hidden = false;
    const root = rootFor(saved.key); root.classList.remove('is-directory-searching','is-directory-search-leaving'); root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label'); root.style.height = ''; root.style.removeProperty('--directory-search-height'); root.removeEventListener('keydown',trapSearchFocus); root.removeEventListener('touchmove',dismissSearchKeyboard);
    document.documentElement.classList.remove('has-directory-search'); unlockPage(saved.bodyStyle); $('studio-tabbar').hidden = tabs.length === 1;
    renderKey(saved.key); global.scrollTo(0,saved.position); const title = root.querySelector('h2'); if (title) { title.tabIndex = -1; title.focus({preventScroll:true}); }
    if (!data.loaded && !data.inFlight) void load(saved.key);
  }
  function footer(container, key, items) {
    const data = state[key];
    if (searchSession && searchSession.key === key && !data.query) return;
    if (data.offline && !data.busy) container.append(el('p','directory-message',global.LifePhoneNetwork.unavailableText()));
    if (data.busy) container.append(el('p','directory-message',t(9)));
    else if (data.error) container.append(el('p','directory-message',t(10)),button(t(11), () => load(key,data.errorReset)));
    else if (data.loaded && !items.length) {
      const empty = el('div','directory-empty'); empty.append(svg(key === 'devices' ? 'search' : 'menu'), el('p','directory-message',t(data.query || selectedSpaces(key).length || key === 'devices' && (filters.offline || filters.type) ? 16 : key === 'devices' ? 13 : key === 'scenes' ? 14 : 15))); container.append(empty);
    }
    if (data.loaded && data.hasMore && !data.busy && !data.error) container.append(button(t(12), () => load(key,false)));
  }
  function deviceIcon(item) {
    const category = global.StudioRuntime.classifyDevice(item.deviceTypesList, '');
    const assets = { light:'device-light-on.svg',curtain:'device-curtain.svg',climate:'space-device-climate.svg',lock:'favorite-device-lock.svg',sensor:'favorite-device-presence.svg' };
    const holder = el('span','directory-icon category-' + category); holder.setAttribute('aria-hidden','true');
    if (assets[category]) { const img = el('img'); img.src = 'assets/' + assets[category]; img.alt = ''; holder.append(img); }
    else { holder.innerHTML = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="9" width="26" height="23" rx="7"/><path d="M13 25h14M15 16h.01M21 16h.01"/></svg>'; }
    return holder;
  }
  function renderDevices() {
    const container = body('devices'); if (!container) return; clearChildren(container); const data = state.devices; container.setAttribute('aria-busy',String(data.busy));
    updateSearchLabels('devices'); updateCounts();
    if (searchSession && !data.query) return;
    if (!runtime.canOpenDevice()) container.append(el('p','directory-message',t(27)));
    if (spaceWarning) container.append(el('p','directory-message',t(33)));
    const groups = new Map(); visibleItems('devices').forEach(item => { const id = assignedSpace(item); if (!groups.has(id)) groups.set(id,[]); groups.get(id).push(item); });
    // Stable API order, with unassigned always last; identical names remain separate IDs.
    const keys = Array.from(groups.keys()).filter(key => key !== ''); if (groups.has('')) keys.push('');
    keys.forEach(key => {
      const items = groups.get(key); const group = el('section','directory-group'); group.dataset.spaceId = key; group.append(el('h3','directory-group-title',spaceName(items[0])));
      const list = el('ul','directory-list'); const fragment = document.createDocumentFragment();
      items.forEach(item => {
        const li = el('li'); const row = button('',async () => {
          if (opening) return; opening = true; row.disabled = true;
          try { await runtime.openDevice(item); } catch { notice(runtime.canOpenDevice() ? t(28) : t(27)); }
          finally { opening = false; row.disabled = false; }
        },'directory-row device-plugin-row'); row.dataset.deviceId = String(item.deviceId);
        const isOnline = online(item.state); row.classList.toggle('is-offline', isOnline === false);
        const copy = el('span','directory-copy'); copy.append(el('strong','',item.deviceName || String(item.deviceId)));
        if (isOnline !== true) copy.append(el('span','directory-meta',t(isOnline === false ? 6 : 7)));
        row.append(deviceIcon(item), copy, svg('chevron'));
        if (isOnline === false) { const badge = el('img','directory-offline'); badge.src = 'assets/favorite-device-offline.svg'; badge.alt = ''; row.append(badge); }
        li.append(row); fragment.append(li);
      }); list.append(fragment); group.append(list); container.append(group);
    }); footer(container,'devices',visibleItems('devices'));
  }
  function updateSceneAction(control, item) {
    const action = sceneActions.get(global.StudioRuntime.sceneIdentity(item)); const phase = action && action.phase;
    clearChildren(control); control.setAttribute('aria-busy',String(phase === 'pending'));
    control.disabled = !global.StudioRuntime.canExecuteScene(item) || online(item.enabled) !== true || config.enableSceneExecution !== true || Boolean(phase);
    control.classList.toggle('is-failed',phase === 'failed'); control.classList.toggle('is-result',phase === 'success' || phase === 'failed');
    control.setAttribute('aria-label', (phase === 'success' ? t(31) : phase === 'failed' ? t(32) : t(30)) + ' · ' + String(item.name || item.id));
    if (phase === 'pending') { const img = el('img','directory-spinner'); img.src = 'assets/icon-loading.svg'; img.alt = ''; control.append(img); }
    else control.append(svg(phase === 'success' ? 'check' : phase === 'failed' ? 'close' : 'play'));
  }
  async function executeScene(item) {
    if (phoneOffline()) { notice(global.LifePhoneNetwork.errorText()); return; }
    const id = global.StudioRuntime.sceneIdentity(item);
    if (!global.StudioRuntime.canExecuteScene(item) || sceneActions.has(id) || online(item.enabled) !== true || config.enableSceneExecution !== true) return;
    const action = { phase: 'pending' }; sceneActions.set(id,action); patchScene(id,item);
    try { await global.StudioRuntime.executeScene(item); action.phase = 'success'; }
    catch { action.phase = 'failed'; notice(t(32)); }
    patchScene(id,item); action.timer = setTimeout(() => { sceneActions.delete(id); patchScene(id,item); },2000);
  }
  function patchScene(id,item) { const container = body('scenes'); if (container) container.querySelectorAll('.scene-execute').forEach(control => { if (control.dataset.sceneId === id) { updateSceneAction(control,item); const label = control.parentElement.querySelector('.directory-enabled-state'); if (label) { label.hidden = online(item.enabled) === true; label.textContent = t(online(item.enabled) === false ? 25 : 7); } } }); }
  function renderAutomation(onlyKey) {
    ['scenes','automations'].forEach(key => {
      if (onlyKey && onlyKey !== key) return;
      const container = body(key); if (!container) return; clearChildren(container); container.setAttribute('aria-busy',String(state[key].busy)); updateSearchLabels(key);
      if (searchSession && searchSession.key === key && !state[key].query) return;
      const items = visibleItems(key);const grouped=new Map();
      items.forEach(item => {
        const li = el('li','directory-row'); const copy = el('span','directory-copy'); const name = item.name; copy.append(el('strong','', name || String(key === 'scenes' ? item.id : item.automationId)));
        if (item.space && (item.space.spaceId || item.space.name)) copy.append(el('span','directory-meta',spaceName(item)));
        const known = online(item.enabled); if (key === 'scenes') { const label = el('span','directory-meta directory-enabled-state',t(known === false ? 25 : 7)); label.hidden = known === true; copy.append(label); } else if (known === null) copy.append(el('span','directory-meta',t(7)));
        li.append(copy);
        if (key === 'automations') {
          const toggle = button('', () => toggleAutomation(item,toggle), 'automation-switch'); toggle.dataset.automationId = String(item.automationId); toggle.setAttribute('role','switch'); toggle.setAttribute('aria-checked',String(known === true)); toggle.setAttribute('aria-label',String(name || item.automationId));
          toggle.disabled = known === null || !runtime.canWriteAutomation() || state.automations.busy || pendingAutomations.has(String(item.automationId)); toggle.setAttribute('aria-busy',String(pendingAutomations.has(String(item.automationId)))); li.append(toggle);
        } else {
          const run = button('', () => executeScene(item), 'scene-execute'); run.dataset.sceneId = global.StudioRuntime.sceneIdentity(item); updateSceneAction(run,item); li.append(run);
        }
        const id=assignedSpace(item);if(!grouped.has(id))grouped.set(id,{rows:[],example:item});grouped.get(id).rows.push(li);
      });
      const groupIds=[...grouped.keys()].filter(id=>id);if(grouped.has(''))groupIds.push('');
      for(const id of groupIds){const group=el('section','directory-group');group.dataset.spaceId=id;const example=grouped.get(id).example;group.append(el('h3','directory-group-title',spaceName(example)));const rows=el('ul','directory-list');for(const row of grouped.get(id).rows)rows.append(row);group.append(rows);container.append(group);}footer(container,key,items);
    }); updateCounts();
  }
  async function toggleAutomation(item,toggle) {
    if (phoneOffline()) { notice(global.LifePhoneNetwork.errorText()); return; }
    const id = String(item.automationId); if (pendingAutomations.has(id) || state.automations.busy || !runtime.canWriteAutomation()) return;
    const enabled = toggle.getAttribute('aria-checked') !== 'true'; pendingAutomations.add(id); toggle.disabled = true; toggle.setAttribute('aria-busy','true'); let changed = false;
    try { await runtime.setAutomationEnabled(id,enabled); item.enabled = enabled; if (searchSession && searchSession.key === 'automations') searchSession.snapshot.items.forEach(other => { if (String(other.automationId) === id) other.enabled = enabled; }); state.scenes.items.forEach(scene => { if (String(scene.automationId) === id) { scene.enabled = enabled; changed = true; } }); homeScenesDirty = true; if(active==='home'){homeScenesDirty=false;global.StudioHomeRefresh.refreshScenes();} }
    catch { notice(t(29)); }
    finally { pendingAutomations.delete(id); patchAutomation(id,item); if (changed) state.scenes.items.forEach(scene => { if (String(scene.automationId) === id) patchScene(global.StudioRuntime.sceneIdentity(scene),scene); }); if (!pendingAutomations.size && state.automations.queuedReset) { state.automations.queuedReset = false; void load('automations'); } }
  }
  function patchAutomation(id,item) { const container = body('automations'); if (!container) return; container.querySelectorAll('.automation-switch').forEach(node => { if (node.dataset.automationId !== id) return; node.setAttribute('aria-checked',String(online(item.enabled) === true)); node.setAttribute('aria-busy',String(pendingAutomations.has(id))); node.disabled = online(item.enabled) === null || !runtime.canWriteAutomation() || state.automations.busy || pendingAutomations.has(id); }); }
  function renderKey(key) { if (key === 'devices') renderDevices(); else renderAutomation(key); }
  function ensureSpaces(force=false) {
    if(spacesPromise || spaceAttempted && !force)return spacesPromise;spaceAttempted=true;
    const version=global.StudioRuntime.collectionVersion();const operation=runtime.spaces().then(tree=>{if(version!==global.StudioRuntime.collectionVersion())return;spaceIndex=spaceFilter.build(tree);names=spaceIndex.paths;spaceKnown=true;spaceWarning=false;
      for(const scope of ['devices','smart']){const before=spaceSelections[scope],next=spaceFilter.reconcile(before,spaceIndex);spaceSelections[scope]=next;selectedSpaceSets[scope]=new Set(next);if(before.slice().sort().join('|')!==next.slice().sort().join('|')){const key=scope==='devices'?'devices':'automations';if(state[key].loaded || state[key].inFlight)void load(key);}}
    }).catch(()=>{if(version===global.StudioRuntime.collectionVersion())spaceWarning=true;}).finally(()=>{if(spacesPromise===operation){spacesPromise=null;renderDevices();renderAutomation();}});spacesPromise=operation;return operation;
  }
  async function openSpaceFilter(key){
    if(spaceDialog || spaceOpening || filterDialog || searchSession)return;spaceOpening=true;const openingVersion=global.StudioRuntime.collectionVersion(),openingTab=active;global.StudioPullRefresh.cancel();
    try{if(!spaceKnown || spaceWarning){await ensureSpaces(true);if(!spaceKnown || spaceWarning)return;}if(openingVersion!==global.StudioRuntime.collectionVersion() || openingTab!==active)return;
    const scope=spaceScope(key),version=global.StudioRuntime.collectionVersion();
    spaceDialog=spaceFilter.open({index:spaceIndex,ids:spaceSelections[scope],role:config.role || '',trigger:searches.get(key).space,closed(){spaceDialog=null;},apply(ids){if(version!==global.StudioRuntime.collectionVersion())return;const before=spaceSelections[scope];if(before.slice().sort().join('|')===ids.slice().sort().join('|'))return;spaceSelections[scope]=ids;selectedSpaceSets[scope]=new Set(ids);if(scope==='devices'){positions.devices=0;state.devices.loaded=false;state.devices.total=null;state.devices.pageNum=0;state.devices.hasMore=false;void load('devices');}else{smartPositions.scenes=0;smartPositions.automations=0;renderAutomation('scenes');state.automations.loaded=false;state.automations.total=null;state.automations.pageNum=0;state.automations.hasMore=false;state.automations.revision++;if(state.automations.inFlight)state.automations.queuedReset=true;else if(smartKey==='automations')void load('automations');}global.scrollTo(0,0);}});
    }finally{spaceOpening=false;}
  }
  async function load(key, reset = true, force = false) {
    const data = state[key];
    if (data.inFlight || key === 'automations' && pendingAutomations.size) { if (reset) { data.revision++; data.queuedReset = true; data.busy = true; data.error = false; renderKey(key); } return; }
    if (phoneOffline() && !force) { data.offline = true; data.busy = false; renderKey(key); return; }
    const revision = ++data.revision; const query = data.query; const selectedFilters = Object.assign({},filters,{spaceIds:spaceFilter.compact(selectedSpaces(key),spaceIndex)}); data.inFlight = true; data.busy = true; data.error = false; data.offline = false; data.errorReset = reset; renderKey(key);
    ensureSpaces();
    try {
      const result = await runtime[key](reset ? 1 : data.pageNum + 1,query,selectedFilters); if (revision !== data.revision) return;
      const items = key === 'scenes' ? result : result.items;
      if (items.some(item => !item || !(key === 'devices' ? item.deviceId : key === 'scenes' ? global.StudioRuntime.sceneIdentity(item) : item.automationId))) throw new Error('Invalid Studio record identity');
      const identity = item => key === 'devices' ? String(item.deviceId) : key === 'scenes' ? global.StudioRuntime.sceneIdentity(item) : String(item.automationId);
      data.items = Array.from(new Map((reset ? [] : data.items).concat(items).map(item => [identity(item),item])).values());
      data.total = key === 'scenes' ? items.length : result.total; data.pageNum = result.pageNum || 1; data.hasMore = result.hasMore || false; data.loaded = true;
      if (key === 'devices') items.forEach(item => { if (Array.isArray(item.deviceTypesList)) item.deviceTypesList.forEach(type => { if (typeof type === 'string' && type) deviceTypes.add(type); }); });
    } catch { if (revision === data.revision) {data.offline=phoneOffline();data.error=!data.offline;if(global.StudioRuntime && global.StudioRuntime.invalidateCollections)global.StudioRuntime.invalidateCollections([key==='devices'?'/devices':key==='scenes'?'/scenes':'/automations']);} }
    finally {
      data.inFlight = false;
      if (data.queuedReset) { data.queuedReset = false; void load(key); }
      else { data.busy = false; renderKey(key); }
    }
  }
  function openFilter() {
    if (filterDialog || spaceDialog || searchSession || state.devices.busy) return;
    global.StudioPullRefresh.cancel(); const draft = Object.assign({},filters); const trigger = searches.get('devices').filter;
    const layer = el('div','directory-filter-layer'); const backdrop = el('div','directory-filter-backdrop'); const panel = el('section','directory-filter-panel'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-label',t(20)); panel.tabIndex = -1;
    const position = global.scrollY; const bodyStyle = lockPage(position);
    function close() { if (!filterDialog) return; layer.remove(); unlockPage(bodyStyle); filterDialog = null; document.removeEventListener('keydown',onKey); trigger.focus({preventScroll:true}); global.scrollTo(0,position); }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { const controls = Array.from(panel.querySelectorAll('button')); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    }
    function apply() { const changed = draft.offline !== filters.offline || draft.type !== filters.type; Object.assign(filters,draft); close(); if (changed) { const data = state.devices; data.revision++; data.items = []; data.pageNum = 0; data.total = null; data.hasMore = false; data.loaded = false; void load('devices'); } else updateSearchLabels('devices'); }
    function group(title,values,property) {
      const field = el('fieldset'); field.append(el('legend','',title)); const choices = el('div','directory-filter-choices'); choices.setAttribute('role','radiogroup'); choices.setAttribute('aria-label',title);
      values.forEach(value => { const node = button(value.label, () => { draft[property] = value.value; choices.querySelectorAll('button').forEach(other => { other.setAttribute('aria-checked',String(other === node)); }); },'directory-filter-option'); node.setAttribute('role','radio'); node.setAttribute('aria-checked',String(draft[property] === value.value)); node.dataset.filterValue = String(value.value); choices.append(node); }); choices.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; const nodes = Array.from(choices.querySelectorAll('button')); let index = nodes.indexOf(document.activeElement); if (index < 0) return; event.preventDefault(); index = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length; nodes[index].focus(); nodes[index].click(); }); field.append(choices); panel.append(field);
    }
    group(t(21),[{value:false,label:t(5)},{value:true,label:t(6)}],'offline');
    group(t(22),[{value:'',label:t(5)}].concat(Array.from(deviceTypes).map(type => ({value:type,label:typeLabel(type)}))),'type');
    if (state.devices.hasMore) panel.append(el('p','directory-filter-note',t(42)));
    const actions = el('div','directory-filter-actions'); actions.append(button(t(23), () => { draft.offline = false; draft.type = ''; apply(); },'directory-filter-reset'),button(t(24),apply,'directory-filter-apply')); panel.append(actions);
    backdrop.addEventListener('click',close); layer.append(backdrop,panel); document.body.append(layer); document.body.style.overflow = 'hidden'; filterDialog = { close }; document.addEventListener('keydown',onKey); panel.focus({preventScroll:true});
  }
  function selectTab(tab, focus = false) {
    if (!tabs.includes(tab) || active === tab) return;
    if (searchSession) closeSearch(true); if (filterDialog) filterDialog.close();if(spaceDialog)spaceDialog.close();
    if (active === 'home') { if(global.StudioHomeRefresh && typeof global.StudioHomeRefresh.suspend==='function')global.StudioHomeRefresh.suspend();if (global.CameraWebRTCRuntime) void global.CameraWebRTCRuntime.stopAll(); const close = document.querySelector('.capability-sheet-close'); if (close) close.click(); }
    positions[active] = global.scrollY; global.StudioPullRefresh.cancel(); active = tab;
    document.documentElement.style.setProperty('--studio-active-tab',String(tabs.indexOf(tab))); $('topbar').hidden = tab !== 'home';
    tabs.forEach(item => { $(item + '-panel').hidden = item !== tab; const node = $('tab-' + item); node.setAttribute('aria-selected',String(item === tab)); node.tabIndex = item === tab ? 0 : -1; });
    if (focus) $('tab-' + tab).focus({preventScroll:true}); global.scrollTo(0,positions[tab]);
    if (tab === 'home') {
      if(homeNeedsRefresh){homeNeedsRefresh=false;homeScenesDirty=false;void global.StudioHomeRefresh.refresh();}
      else {if(homeScenesDirty){homeScenesDirty=false;global.StudioHomeRefresh.refreshScenes();}global.StudioHomeRefresh.flushPending();}
    }
    if (tab === 'devices' && !state.devices.loaded && !state.devices.busy) void load('devices');
    if (tab === 'automation') ['scenes','automations'].forEach(key => { if (!state[key].loaded && !state[key].busy) void load(key); });
  }
  tabs.forEach((tab,index) => { const node = $('tab-' + tab); node.addEventListener('click',() => selectTab(tab)); node.addEventListener('keydown',event => { let next; if (event.key === 'ArrowRight') next = (index+1)%tabs.length; if (event.key === 'ArrowLeft') next = (index+tabs.length-1)%tabs.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length-1; if (next !== undefined) { event.preventDefault(); selectTab(tabs[next],true); } }); });
  let prefetchFlight=null;
  function prefetch(mayRun){
    if(prefetchFlight)return prefetchFlight;
    if(document.hidden || active!=='home' || phoneOffline() || !global.StudioRuntime.collectionReady() || pendingAutomations.size || Array.from(sceneActions.values()).some(item=>item.phase==='pending'))return Promise.resolve();
    const version=global.StudioRuntime.collectionVersion();
    const tasks=[];if(tabs.includes('devices'))tasks.push(()=>runtime.devices(1,'',Object.assign({},filters,{spaceIds:spaceFilter.compact(selectedSpaces('devices'),spaceIndex)})));if(tabs.includes('automation')){tasks.push(()=>runtime.scenes());tasks.push(()=>runtime.automations(1,'',{spaceIds:spaceFilter.compact(selectedSpaces('automations'),spaceIndex)}));}
    const operation=(async()=>{for(const task of tasks){if(document.hidden || active!=='home' || version!==global.StudioRuntime.collectionVersion() || typeof mayRun==='function' && !mayRun() || pendingAutomations.size || Array.from(sceneActions.values()).some(item=>item.phase==='pending'))break;try{await task();}catch(_){/* Foreground entry retains its normal error/retry path. */}}})().finally(()=>{if(prefetchFlight===operation)prefetchFlight=null;});prefetchFlight=operation;return operation;
  }
  function refreshActive(tab = active) {
    if (tab === 'home') return global.StudioHomeRefresh.refresh();
    spaceAttempted = false;
    if(global.StudioRuntime.invalidateCollections)global.StudioRuntime.invalidateCollections(tab==='devices'?['/devices','/spaces']:[smartKey==='scenes'?'/scenes':'/automations','/spaces']);
    return tab === 'devices' ? Promise.all([load('devices',true,true),ensureSpaces()]) : Promise.all([load(smartKey,true,true),ensureSpaces()]);
  }
  ['devices','automation'].forEach(tab => global.StudioPullRefresh.register(tab,{ refresh: () => refreshActive(tab), busy: () => Boolean(searchSession || filterDialog || spaceDialog) || Object.values(state).some(item => item.busy || item.inFlight) || pendingAutomations.size > 0 || Array.from(sceneActions.values()).some(item => item.phase === 'pending') }));
  function language() {
    if (filterDialog) filterDialog.close();if(spaceDialog)spaceDialog.close();ensureViews(); tabs.forEach(tab => $('tab-' + tab).querySelector('span').textContent = t(order.indexOf(tab))); $('studio-tabbar').setAttribute('aria-label',tabs.map(tab => t(order.indexOf(tab))).join(', '));
    document.querySelectorAll('.directory-add-device').forEach(node => node.setAttribute('aria-label',pairingText(0)));
    document.querySelectorAll('.directory-menu').forEach(node => node.setAttribute('aria-label',t(41)));
    if (searchSession) rootFor(searchSession.key).setAttribute('aria-label',t(17));
    const segment = document.querySelector('.smart-segment'); if (segment) segment.setAttribute('aria-label',t(2));
    if ($('devices-count')) $('devices-content').querySelector('h2').textContent = t(1);
    if ($('smart-count')) { $('automation-content').querySelector('h2').textContent = t(2); $('smart-tab-scenes').textContent = t(3); $('smart-tab-automations').textContent = t(4); }
    renderDevices(); renderAutomation();
  }
  if (global.LifeI18n && typeof global.LifeI18n.onChange === 'function') global.LifeI18n.onChange(language); language();
  global.addEventListener('aqara:native-context-ready',() => { renderDevices(); renderAutomation(); });
  if(global.LifePhoneNetwork)global.LifePhoneNetwork.onChange(() => { for(const key of ['devices','scenes','automations']){state[key].offline=phoneOffline();renderKey(key);} });
  global.addEventListener('aqara:collection-scope-changed',()=>{clearPairingAttempt();if(searchSession)closeSearch(true);if(filterDialog)filterDialog.close();if(spaceDialog)spaceDialog.close(false);spaceKnown=false;spaceIndex=spaceFilter.build([]);for(const scope of ['devices','smart']){spaceSelections[scope]=[];selectedSpaceSets[scope]=new Set();}deviceTypes.clear();prefetchFlight=null;spaceAttempted=false;spacesPromise=null;names=new Map();for(const key of ['devices','scenes','automations']){const data=state[key];data.revision++;data.items=[];data.loaded=false;data.total=null;data.pageNum=0;data.hasMore=false;data.queuedReset=data.inFlight;}renderDevices();renderAutomation();if(active==='devices')void load('devices');if(active==='automation'){void load('scenes');void load('automations');}});
  global.StudioTabs = Object.freeze({ active: () => active, refresh: refreshActive, prefetch, markHomeDirty: () => { homeNeedsRefresh = true; } });
})(window,document);
