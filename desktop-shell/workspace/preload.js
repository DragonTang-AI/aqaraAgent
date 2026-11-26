// 空间工作台 preload：向页面暴露「读取主题 / 订阅主题 / 发指令给 Agent」的桥
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aqara', {
  getTheme: () => ipcRenderer.invoke('aqara:get-theme'),
  onTheme: (cb) => {
    ipcRenderer.on('aqara:theme', (_e, theme) => { try { cb(theme); } catch (_) {} });
  },
  // 把一段指令发到左栏 dsh 对话框（由主进程注入）
  send: (text) => ipcRenderer.send('aqara:send', String(text || '')),
  // Agent 执行完成后回调（主进程在「停止生成 → 发送消息」时触发）
  onActionDone: (cb) => { ipcRenderer.on('aqara:action-done', () => { try { cb(); } catch (_) {} }); },
  // 工作区数据（state.json）读取 + 订阅变化
  getState: () => ipcRenderer.invoke('aqara:get-state'),
  onState: (cb) => { ipcRenderer.on('aqara:state', (_e, s) => { try { cb(s); } catch (_) {} }); },
  // 多项目
  listProjects: () => ipcRenderer.invoke('aqara:list-projects'),
  switchProject: (name) => ipcRenderer.invoke('aqara:switch-project', name),
  newProject: (name) => ipcRenderer.invoke('aqara:new-project', name),
  // 读取本地 GLB 模型（返回 ArrayBuffer）
  loadModel: (name) => ipcRenderer.invoke('aqara:load-model', name),
  // 读取场景清单（灯光/窗帘/开关 34 通道）
  loadManifest: (name) => ipcRenderer.invoke('aqara:load-manifest', name),
  // 搭子 · 技能 · 连接器
  listPartners: () => ipcRenderer.invoke('aqara:list-partners'),
  createPartner: (p) => ipcRenderer.invoke('aqara:create-partner', p),
  ensurePartnerSkill: (id) => ipcRenderer.invoke('aqara:ensure-partner-skill', id),
  // 连接器（真实 MCP 配置）
  listConnectors: () => ipcRenderer.invoke('aqara:list-connectors'),
  openMcpConfig: () => ipcRenderer.invoke('aqara:open-mcp-config'),
  addConnector: (c) => ipcRenderer.invoke('aqara:add-connector', c),
  removeConnector: (id) => ipcRenderer.invoke('aqara:remove-connector', id),
  toggleConnector: (id) => ipcRenderer.invoke('aqara:toggle-connector', id),
  // 真·技能管理
  listSkills: () => ipcRenderer.invoke('aqara:list-skills'),
  createSkill: (s) => ipcRenderer.invoke('aqara:create-skill', s),
  importSkill: () => ipcRenderer.invoke('aqara:import-skill'),
  setSkillEnabled: (id, enabled) => ipcRenderer.invoke('aqara:set-skill-enabled', id, enabled),
  deleteSkill: (id, disabled) => ipcRenderer.invoke('aqara:delete-skill', id, disabled),
  openSkill: (p) => ipcRenderer.invoke('aqara:open-skill', p),
  revealSkillsDir: () => ipcRenderer.invoke('aqara:reveal-skills-dir'),
  // 左栏入口 → 激活指定标签页
  onActivateTab: (cb) => { ipcRenderer.on('aqara:activate-tab', (_e, t) => { try { cb(t); } catch (_) {} }); },
  // 预览区模式：normal(并排) / max(放大填充) / hidden(收起为窄条)
  setPanelMode: (m) => ipcRenderer.send('aqara:set-panel-mode', String(m || '')),
  onPanelMode: (cb) => { ipcRenderer.on('aqara:panel-mode', (_e, m) => { try { cb(m); } catch (_) {} }); },
});