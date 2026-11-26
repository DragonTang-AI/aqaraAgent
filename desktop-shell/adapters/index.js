'use strict';

/**
 * 适配层入口（可插拔）
 * ---------------------------------------------------------------
 * 目标：把「Aqara 空间/设备/场景」的统一能力抽象为固定接口：
 *   listSpaces() / listDevices() / listScenes()
 *   controlDevice(id, {command}) / executeScene(id)
 *
 * 未来可有两种实现：
 *   - openapi：直连 Aqara OpenAPI（本文件已提供骨架）
 *   - mcp    ：由 dsh 的 MCP 连接器承载（工具名 mcp__<server>__<tool>）
 * 上层只认接口，不关心底层形态。
 */
const { createOpenApiAdapter } = require('./aqara-openapi');

function createAdapter(cred) {
  if (!cred || !cred.baseUrl || !cred.token) return null;
  // 目前仅有 openapi 实现；mcp 形态后续在此分流（cred.kind === 'mcp'）。
  return createOpenApiAdapter(cred);
}

module.exports = { createAdapter };
