#!/usr/bin/env node
'use strict';

/**
 * Aqara Blender MCP 桥（stdio）
 * ---------------------------------------------------------------
 * dsh 的 MCP 客户端通过 stdio 与本脚本通信；本脚本再把调用转发到
 * Blender 插件内的本地 HTTP 服务（127.0.0.1:9887）。
 * 这样 Agent 就能通过 mcp__blender__* 工具读取场景 / 执行脚本。
 */

const BASE = process.env.AQARA_BLENDER_BRIDGE || 'http://127.0.0.1:9887';

const TOOLS = [
  {
    name: 'blender_status',
    description: '检查 Blender 是否已连接（桥接服务是否在运行），返回 Blender 版本。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'blender_scene',
    description: '获取当前 Blender 场景概要（对象数量、对象列表、相机等）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'blender_execute',
    description: '在 Blender 主线程执行一段 Python(bpy) 代码。约定：若代码给变量 result 赋值，则返回其字符串。',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: '要执行的 bpy Python 代码' } },
      required: ['code'],
      additionalProperties: false,
    },
  },
];

async function httpJson(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function callTool(name, args) {
  if (name === 'blender_status') return httpJson('GET', '/ping');
  if (name === 'blender_scene') return httpJson('GET', '/scene');
  if (name === 'blender_execute') return httpJson('POST', '/exec', { code: String((args && args.code) || '') });
  throw new Error('unknown tool: ' + name);
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handle(msg) {
  const id = msg.id;
  const method = msg.method;
  // 通知类消息（无 id）不需要回复
  if (id === undefined || id === null) return;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aqara-blender', version: '1.0.0' },
    } });
    return;
  }
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: TOOLS } }); return; }
  if (method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    try {
      const data = await callTool(name, args);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'Blender 桥接不可用：' + (e && e.message) + '（请确认 Blender 已打开且插件已启用）' }] } });
    }
    return;
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg = null;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    Promise.resolve(handle(msg)).catch(() => {});
  }
});
process.stdin.on('end', () => process.exit(0));
