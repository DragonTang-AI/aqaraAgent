(function (global) {
  'use strict';
  const config = global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {};
  async function request(path, method, params = {}, data) {
    if (method !== 'GET' && global.LifePhoneNetwork && global.LifePhoneNetwork.isOffline()) throw new Error(global.LifePhoneNetwork.errorText());
    const bridge = global.LifeBridge;
    if (!bridge || !bridge.supports('nativeHttpRequest')) throw new Error('Life native request bridge is unavailable');
    const response = await bridge.nativeHttpRequest({ url: `${String(config.apiPath || '/open/api/v1').replace(/\/$/, '')}${path}`, method, params, ...(data === undefined ? {} : { data }), headers: { source: 'studio' }, modeType: config.requestMode || 'sdkMode' });
    if (!response || typeof response !== 'object' || Number(response.code) !== 0) throw new Error(response && response.message || 'Invalid Studio response');
    return response.data;
  }
  function get(path, params) { return global.StudioRuntime && global.StudioRuntime.readCollection ? global.StudioRuntime.readCollection(path,params) : request(path, 'GET', params); }
  function canWriteAutomation() { const bridge = global.LifeBridge; return Boolean(config.enableAutomationWrites === true && bridge && bridge.supports('nativeHttpRequest')); }
  async function setAutomationEnabled(automationId, enabled) {
    if (!canWriteAutomation()) throw new Error('Automation writes are disabled');
    if (typeof automationId !== 'string' || !automationId.trim() || typeof enabled !== 'boolean') throw new Error('Invalid automation status input');
    const data = await request('/automations/status', 'POST', {}, { automationIds: [automationId], enabled });
    if (!data || !Array.isArray(data.successIds) || !data.successIds.includes(automationId) || (Array.isArray(data.failedItems) && data.failedItems.some(item => String(item.automationId) === automationId))) throw new Error('Automation status update failed');
    if(global.StudioRuntime && global.StudioRuntime.invalidateCollections)global.StudioRuntime.invalidateCollections(['/automations','/scenes']);
    return enabled;
  }
  function page(value, pageNum) {
    if (!value || !Array.isArray(value.data)) throw new Error('Invalid Studio page');
    const rawTotal = value.totalCount == null ? NaN : Number(value.totalCount);
    const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : null;
    return { items: value.data, pageNum, total, hasMore: total !== null ? pageNum * 200 < total : value.data.length === 200 };
  }
  async function devices(pageNum = 1, keyword = '', filters = {}) {
    const params = { pageNum, pageSize: 200, includeSpace: true };
    if (keyword) params.deviceName = keyword;
    if (filters.offline === true) params.state = false;
    if (typeof filters.type === 'string' && filters.type) { params.deviceTypesList = filters.type; params.deviceTypesMatchMode = 'or'; }
    if(Array.isArray(filters.spaceIds) && filters.spaceIds.length){params.spaceIds=filters.spaceIds.join(',');params.needChildren=true;}
    return page(await get('/devices', params), pageNum);
  }
  async function automations(pageNum = 1, keyword = '', filters = {}) { return page(await get('/automations', { pageNum, pageSize: 200, includeSpace: true, orderBy: 'createTime asc', ...(keyword ? { automationName: keyword } : {}),...(Array.isArray(filters.spaceIds) && filters.spaceIds.length?{spaceIds:filters.spaceIds.join(','),needChildren:true}:{}) }), pageNum); }
  async function scenes() { if(!global.StudioRuntime || !global.StudioRuntime.listScenes)throw new Error('Studio scene runtime is unavailable'); return global.StudioRuntime.listScenes(); }
  async function spaces() { const data = await get('/spaces'); if (!Array.isArray(data)) throw new Error('Invalid Studio space list'); return data; }
  function spaceNames(tree) {
    const result = new Map();
    function walk(items, parent = '') { for (const item of items || []) { const name = String(item.name || ''); const path = [parent, name].filter(Boolean).join(' / '); if (item.spaceId) result.set(String(item.spaceId), path); if (Array.isArray(item.children)) walk(item.children, path); } }
    walk(tree); return result;
  }
  function canOpenDevice() { const bridge = global.LifeBridge; return Boolean(bridge && bridge.supports('openDevicePlugin'));  }
  async function openDevice(device) {
    if (!device || !device.deviceId) throw new Error('Missing deviceId');
    if (!canOpenDevice()) throw new Error('Device plugin navigation is unavailable');
    const response = await global.LifeBridge.invoke('openDevicePlugin', { deviceId: String(device.deviceId), deviceName: String(device.deviceName || '') });
    if (!response || Number(response.code) !== 0 || !response.data || response.data.accepted !== true) throw new Error('Device plugin navigation was not accepted');
    return response.data;
  }
  global.StudioTabsRuntime = Object.freeze({ devices, automations, scenes, spaces, spaceNames, canOpenDevice, openDevice, canWriteAutomation, setAutomationEnabled });
})(window);
