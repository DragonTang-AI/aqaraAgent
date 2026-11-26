'use strict';

/**
 * Aqara OpenAPI 适配器（骨架实现）
 * ---------------------------------------------------------------
 * 约定：baseUrl + Bearer token，路径可通过凭据里的 paths 覆盖。
 * 待 Aqara 侧给出真实鉴权方式与端点后，只需调整这里的 headers/paths，
 * 上层（adapter-call / 工作台 UI）无需改动。
 */
function createOpenApiAdapter(cred) {
  const base = String(cred.baseUrl || '').replace(/\/+$/, '');
  const paths = cred.paths || {};
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (cred.token || '') };
  if (cred.appKey) headers['X-App-Key'] = cred.appKey;
  if (cred.orgId) headers['X-Org-Id'] = cred.orgId;

  const call = async (httpMethod, apiPath, body) => {
    const res = await fetch(base + apiPath, {
      method: httpMethod,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) throw new Error('HTTP ' + res.status + (data && data.message ? (': ' + data.message) : ''));
    return data;
  };

  return {
    kind: 'openapi',
    listSpaces: () => call('GET', paths.spaces || '/spaces'),
    listDevices: () => call('GET', paths.devices || '/devices'),
    listScenes: () => call('GET', paths.scenes || '/scenes'),
    controlDevice: (id, p) => call('POST', (paths.control || '/devices/{id}/control').replace('{id}', encodeURIComponent(id)), (p && p.command) || {}),
    executeScene: (id) => call('POST', (paths.sceneRun || '/scenes/{id}/run').replace('{id}', encodeURIComponent(id)), {}),
  };
}

module.exports = { createOpenApiAdapter };
