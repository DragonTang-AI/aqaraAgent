'use strict';

/**
 * Aqara Studio 适配器（本地直连模式）
 * ---------------------------------------------------------------
 * 目标：桌面端直连局域网 Studio（http://<IP>:8088），实现
 *   登录 / 设备列表 / 设备状态订阅 / 控制设备 / 执行场景。
 *
 * 已确认的接口（来自 Web Builder 文档）：
 *   POST /open/api/v1/auth/login/pubkey      获取 RSA 公钥 + keyId
 *   POST /open/api/v1/auth/login             提交 account + RSA(password) + keyId → token
 *   GET  /open/api/v1/devices                设备列表
 *   GET  /open/api/v1/devices/definitions    功能点定义
 *   POST /open/api/v1/devices/command/execute 控制设备（命令）
 *   POST /open/api/v1/devices/trait/execute   控制设备（trait 写入）
 *   GET  /open/api/v1/spaces                 空间
 *   POST /open/api/v1/scenes/execute         执行场景
 *   WS   ws://<IP>:8088/open/ws              AuthRequest + SubscribeAll → 状态推送
 *
 * 业务请求头（本地模式）：
 *   Authorization: Bearer <token>、ClientId、Device-Unique-Id、Time、Nonce、Lang
 *
 * 注意：公钥编码/填充方式、command/execute 的确切字段以 Studio OpenAPI 为准；
 * 本文件对 RSA 填充做了 PKCS1 → OAEP 的兜底尝试。
 */

const crypto = require('node:crypto');

function toPublicPem(pub) {
  const s = String(pub || '').trim();
  if (!s) throw new Error('缺少 Studio 公钥');
  if (s.includes('BEGIN')) return s;
  const b64 = s.replace(/\s+/g, '');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return '-----BEGIN PUBLIC KEY-----\n' + lines + '\n-----END PUBLIC KEY-----';
}

function rsaEncrypt(pub, plain) {
  const pem = toPublicPem(pub);
  const data = Buffer.from(String(plain), 'utf8');
  const attempts = [
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
  ];
  let lastErr = null;
  for (const opt of attempts) {
    try { return crypto.publicEncrypt(opt, data).toString('base64'); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('RSA 加密失败');
}

function createStudioAdapter(cfg) {
  const base = String((cfg && cfg.baseUrl) || '').replace(/\/+$/, '');
  const wsBase = base.replace(/^http/i, 'ws');
  // 支持两种凭据：① 直接给 token（免登录）② 账号+密码（RSA 登录换取 token）
  let session = (cfg && cfg.token) ? { token: cfg.token, clientId: (cfg.clientId || 'aqara-desktop'), deviceUniqueId: (cfg.deviceUniqueId || 'aqara-desktop') } : null;
  let ws = null;
  const listeners = new Set();

  const jfetch = async (path, init) => {
    const res = await fetch(base + path, init);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (!res.ok) throw new Error('HTTP ' + res.status + (body && body.message ? (': ' + body.message) : ''));
    return body;
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Lang': (cfg && cfg.lang) || 'zh',
    'Authorization': 'Bearer ' + (session ? session.token : ''),
    'ClientId': session ? (session.clientId || '') : '',
    'Device-Unique-Id': session ? (session.deviceUniqueId || '') : '',
    'Time': String(Date.now()),
    'Nonce': crypto.randomBytes(8).toString('hex'),
  });

  const unwrap = (body) => (body && typeof body === 'object' && 'data' in body ? body.data : body);

  async function login() {
    if (session && session.token) return { ok: true, token: true }; // 已用 token 直连
    if (!cfg || !cfg.account || !cfg.password) throw new Error('缺少 Studio 凭据（token 或账号+密码）');
    const pkBody = await jfetch('/open/api/v1/auth/login/pubkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const pk = unwrap(pkBody) || {};
    const publicKey = pk.publicKey || pk.pubKey || pk.key;
    const keyId = pk.keyId || pk.id;
    const encrypted = rsaEncrypt(publicKey, cfg.password);
    const loginBody = await jfetch('/open/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: cfg.account, password: encrypted, keyId }),
    });
    const d = unwrap(loginBody) || {};
    session = {
      token: d.accessToken || d.token,
      clientId: d.clientId,
      deviceUniqueId: d.deviceUniqueId,
      hostId: d.hostId,
      expiresIn: d.expiresIn,
    };
    if (!session.token) throw new Error('登录成功但未返回访问令牌');
    return { ok: true, hostId: session.hostId, expiresIn: session.expiresIn };
  }

  const needSession = () => { if (!session) throw new Error('未登录 Studio'); };

  async function listSpaces() { needSession(); return unwrap(await jfetch('/open/api/v1/spaces', { headers: authHeaders() })); }
  async function listDevices() {
    needSession();
    const b = unwrap(await jfetch('/open/api/v1/devices', { headers: authHeaders() }));
    if (Array.isArray(b)) return b;
    if (b && Array.isArray(b.data)) return b.data;   // GetDeviceInfoResponse: data.data[]
    return (b && (b.list || b.items || b.records)) || [];
  }
  async function listDeviceDefinitions() { needSession(); return unwrap(await jfetch('/open/api/v1/devices/definitions', { headers: authHeaders() })); }
  async function executeScene(sceneId) { needSession(); return unwrap(await jfetch('/open/api/v1/scenes/execute', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ sceneId }) })); }

  /** 取设备功能点定义（endpointId/functionCode/traitCode|commandCode） */
  async function getDeviceDefinitions(deviceIds) {
    needSession();
    const ids = Array.isArray(deviceIds) ? deviceIds.join(',') : String(deviceIds || '');
    const b = unwrap(await jfetch('/open/api/v1/devices/definitions?deviceIds=' + encodeURIComponent(ids), { headers: authHeaders() }));
    return Array.isArray(b) ? b : (b && (b.data || b.list)) || [];
  }

  /**
   * 控制设备（实测可用：trait/execute）
   * spec: { endpointId, functionCode, traitCode, value }  → 走 trait/execute
   *       或 { endpointId, functionCode, commandCode, args? } → 走 command/execute
   * 返回 { ok, failures }；failures 为空数组表示全部成功。
   */
  async function controlDevice(deviceId, spec) {
    needSession();
    const s = spec || {};
    const item = Object.assign({ deviceId }, (s.command && typeof s.command === 'object') ? s.command : s);
    const isTrait = item.traitCode !== undefined;
    const path = isTrait ? '/open/api/v1/devices/trait/execute' : '/open/api/v1/devices/command/execute';
    const body = { data: [item] };
    const res = unwrap(await jfetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }));
    const failures = Array.isArray(res) ? res : [];
    return { ok: failures.length === 0, failures, via: isTrait ? 'trait' : 'command' };
  }

  /** 订阅指定功能点（items: [{deviceId, endpointId, functionCode, traitCodes:[]}]，单批≤20） */
  async function subscribeTraits(items) {
    needSession();
    return unwrap(await jfetch('/open/api/v1/__noop', { headers: authHeaders() }).catch(() => null)) || null;
  }

  // 实时状态：WS 订阅（AuthRequest → SubscribeAll → TraitValueUpdate / objectEvent）
  function connectWs(onEvent) {
    if (!session) throw new Error('未登录 Studio');
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    const url = wsBase + '/open/ws';
    const sock = new WebSocket(url);
    ws = sock;
    const send = (type, data) => { try { sock.send(JSON.stringify({ type, version: 'v1', msgId: crypto.randomUUID(), data })); } catch (_) {} };
    let ping = null;
    sock.addEventListener('open', () => {
      send('AuthRequest', { authType: 'token', token: session.token, clientId: session.clientId, deviceUniqueId: session.deviceUniqueId });
      send('SubscribeAllRequest', null);
      ping = setInterval(() => send('ping', null), 25000);
    });
    sock.addEventListener('message', (ev) => {
      let msg = null; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      const t = msg && msg.type;
      if (t === 'TraitValueUpdate' || t === 'objectEvent') { listeners.forEach((cb) => { try { cb(msg); } catch (_) {} }); if (onEvent) { try { onEvent(msg); } catch (_) {} } }
      if (t === 'pong' || t === 'AuthResponse' || t === 'SubscribeAllResponse') { listeners.forEach((cb) => { try { cb(msg); } catch (_) {} }); }
    });
    sock.addEventListener('close', () => { if (ping) clearInterval(ping); ping = null; });
    sock.addEventListener('error', () => {});
    return sock;
  }

  function close() { try { if (ws) ws.close(); } catch (_) {} ws = null; }

  return {
    kind: 'studio',
    login,
    listSpaces,
    listDevices,
    listDeviceDefinitions,
    controlDevice,
    getDeviceDefinitions,
    subscribeTraits,
    executeScene,
    connectWs,
    onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    close,
    get session() { return session; },
  };
}

module.exports = { createStudioAdapter };
