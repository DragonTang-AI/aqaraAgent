'use strict';

/**
 * Aqara 空间智能桌面端 —— Electron 外壳（主进程）
 * ---------------------------------------------------------------
 * 布局：左「dsh 智能体对话」 + 右「Aqara 空间工作台（3D 数字孪生）」，两栏并排。
 * 能力：
 *   - 启动画面 → 拉起本地 dsh → 双栏窗口
 *   - 品牌注入（把 dsh UI 的 DeepSeek 品牌换成 Aqara）
 *   - persona 覆盖（dsh --patch）
 *   - 系统托盘 + 原生菜单（垂直行业入口）
 *
 * 关键约束（见 README.md）：
 *   - 必须用「真 Node」（/usr/local/bin/node），不能用 Electron 内核 node
 *   - dsh 必须用「源码模式」（tsx + apps/cli/src/bin.ts）
 * ---------------------------------------------------------------------------
 */

const { app, BrowserWindow, WebContentsView, dialog, shell, Tray, Menu, nativeImage, ipcMain, screen, safeStorage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

app.setName('Aqara 空间智能');

// ---------- 配置（可用环境变量覆盖）----------
const DSH_REPO = process.env.AQARA_DSH_REPO
  || path.resolve(__dirname, '../../deepseek-harness');
const REAL_NODE = process.env.AQARA_NODE || '/usr/local/bin/node';
const HOST = '127.0.0.1';
const WINDOW_TITLE = 'Aqara 空间智能';
const STARTUP_TIMEOUT_MS = 120_000;
const npmRegistry = process.env.AQARA_NPM_REGISTRY || 'https://registry.npmmirror.com';
const PANEL_MIN = 300, PANEL_MAX = 520, PANEL_RATIO = 0.30;
const SPLIT_W = 8; // 左右两栏之间的可拖拽分隔条宽度
const RAIL_W = 46; // 收起预览区后保留的窄条宽度（带「展开」入口）

const ICON_PNG = path.join(__dirname, 'build', 'icon.png');
const TRAY_ICON = path.join(__dirname, 'build', 'trayTemplate.png');
const SPLASH_HTML = path.join(__dirname, 'splash.html');
const BRAND_SCRIPT = path.join(__dirname, 'branding', 'aqara-brand.js');
const DSH_PRELOAD = path.join(__dirname, 'branding', 'dsh-preload.js');
const WORDMARK_PNG = path.join(__dirname, 'build', 'aqara-wordmark.png');
const MARK_PNG = path.join(__dirname, 'build', 'aqara-logo.png');
const PERSONA_YML = path.join(__dirname, 'branding', 'aqara-persona.yml');
const PANEL_HTML = path.join(__dirname, 'workspace', 'index.html');
const PANEL_PRELOAD = path.join(__dirname, 'workspace', 'preload.js');
const SPLITTER_HTML = path.join(__dirname, 'workspace', 'splitter.html');
const SPLITTER_PRELOAD = path.join(__dirname, 'workspace', 'splitter-preload.js');
// 多项目：每个项目 = projects/<name>/ 目录（= dsh 工作区），state.json 在项目目录内
const PROJECTS_ROOT = path.join(__dirname, 'projects');
const PARTNERS_FILE = path.join(__dirname, 'partners.json'); // 搭子 · 技能 · 连接器 数据
// dsh 技能目录（技能写在这里 → dsh 会实时发现并供 Agent 调用）
const DSH_HOME_DIR = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const SKILLS_DIR = path.join(DSH_HOME_DIR, 'skills');
const SKILLS_DISABLED_DIR = path.join(SKILLS_DIR, '.disabled');
// 连接器（MCP）注册表 + 写入 dsh 的真实 patch 配置
const CONNECTORS_FILE = path.join(__dirname, 'connectors.json');
const MCP_PATCH_FILE = path.join(DSH_HOME_DIR, 'profiles', 'web', 'cordis.patch.yml');
// 资料库（真实文件目录）
const LIB_IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.heic']);
const LIB_DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.json', '.csv']);
// 资料库按项目独立：<projectDir>/library
const LEGACY_LIBRARY_DIR = path.join(__dirname, 'library');
const libraryDir = (name) => path.join(projectDirOf(name), 'library');
function migrateLegacyLibrary() {  try {
    if (!fs.existsSync(LEGACY_LIBRARY_DIR)) return;
    const names = fs.readdirSync(LEGACY_LIBRARY_DIR).filter((n) => !n.startsWith('.'));
    if (!names.length) return;
    const dst = libraryDir();
    fs.mkdirSync(dst, { recursive: true });
    for (const n of names) {
      const s = path.join(LEGACY_LIBRARY_DIR, n);
      const d = path.join(dst, n);
      if (fs.existsSync(d)) continue;
      try { fs.renameSync(s, d); } catch (_) { try { fs.copyFileSync(s, d); } catch (_) {} }
    }
    console.log('[shell] 旧资料库已迁移到项目：', dst);
  } catch (_) {}
}

// 安装随应用内置的技能到 ~/.dsh/skills（不覆盖已有，避免覆盖用户修改）
function installBundledSkills() {
  try {
    const srcRoot = path.join(__dirname, 'skills');
    if (!fs.existsSync(srcRoot)) return;
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    for (const d of fs.readdirSync(srcRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const src = path.join(srcRoot, d.name);
      if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
      const dest = path.join(SKILLS_DIR, d.name);
      if (fs.existsSync(dest)) continue;
      fs.cpSync(src, dest, { recursive: true });
      console.log('[shell] 内置技能已安装 →', d.name);
    }
  } catch (e) { console.error('[shell] 安装内置技能失败:', e && e.message); }
}
// 凭据中心（系统加密存储）
const SECURE_DIR = path.join(__dirname, 'secure');
const CRED_FILE = path.join(SECURE_DIR, 'credentials.enc');
// Blender 连接器
const BLENDER_SUPPORT = path.join(os.homedir(), 'Library', 'Application Support', 'Blender');
const BLENDER_ADDON_SRC = path.join(__dirname, 'connectors', 'blender-addon');
const BLENDER_MCP_SCRIPT = path.join(__dirname, 'connectors', 'blender-mcp.js');
let currentProject = process.env.AQARA_PROJECT || '示例户型';
function projectDirOf(name) { return path.join(PROJECTS_ROOT, name || currentProject); }
function statePathOf(name) { return path.join(PROJECTS_ROOT, name || currentProject, 'state.json'); }

// ---------- 工作区数据（多项目 · state.json 驱动 + 实时监听）----------
function readState(name) {
  try { return JSON.parse(fs.readFileSync(statePathOf(name), 'utf8')); } catch (_) { return null; }
}
function listProjects() {
  try {
    return fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS_ROOT, d.name, 'state.json')))
      .map((d) => d.name);
  } catch (_) { return []; }
}
function defaultState(name) {
  return {
    project: { name: name, area: 0, updatedAt: new Date().toISOString().slice(0, 10) },
    rooms: [
      { name: '客厅', c: [0, 1], w: 6, d: 4 },
      { name: '主卧', c: [-1.5, -2.5], w: 3, d: 3 },
      { name: '厨房', c: [1.5, -2.5], w: 3, d: 3 },
    ],
    devices: [
      { name: '客厅主灯', room: '客厅', status: 'ON', pos: [0, 1.2, 1] },
      { name: '人体存在传感器', room: '主卧', status: 'OK', pos: [-1.5, 1.0, -2.5] },
    ],
    scenes: ['回家模式', '观影模式', '睡眠模式'],
    automations: [],
    files: [],
    board: { todo: [], doing: [], done: [] },
    tasks: [],
  };
}
function registerDshWorkspace(dir, title) {
  try {
    const p = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'storages', 'workspace.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Object.values(d.tables.workspaces).some((w) => w.path === dir)) return;
    const wid = require('node:crypto').randomUUID();
    const now = new Date().toISOString();
    d.tables.workspaces[wid] = { path: dir, title: title, sessionIds: [], createdAt: now, updatedAt: now };
    d.global.workspaceIds.push(wid);
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
  } catch (e) { console.error('[shell] 注册 dsh 工作区失败:', e && e.message); }
}
function switchDshWorkspace(title) {
  if (!dshView || dshView.webContents.isDestroyed()) return;
  const namesJson = JSON.stringify(['选择工作区', ...listProjects(), title]);
  const code = `(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const names = ${namesJson};
    const picker = [...document.querySelectorAll('button')].find(b => !b.disabled && names.includes((b.textContent||'').trim()));
    if (!picker) return 'no-picker';
    picker.click();
    await sleep(350);
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return 'no-menu';
    const item = [...menu.querySelectorAll('[role="menuitem"]')].find(x => (x.textContent||'').includes(${JSON.stringify(title)}));
    if (!item) { document.body.click(); return 'no-item'; }
    item.click();
    await sleep(250);
    return 'switched';
  })()`;
  dshView.webContents.executeJavaScript(code)
    .then((r) => console.log('[shell] dsh 工作区切换:', title, '→', r))
    .catch((e) => console.error('[shell] 切换工作区失败:', e && e.message));
}
function sendState(name) {
  const s = readState(name);
  if (s && panelView && !panelView.webContents.isDestroyed()) {
    panelView.webContents.send('aqara:state', s);
    return true;
  }
  return false;
}

function startStateSync() {
  ipcMain.handle('aqara:get-state', () => readState());
  ipcMain.handle('aqara:list-projects', () => ({ current: currentProject, projects: listProjects() }));
  ipcMain.handle('aqara:switch-project', (_e, name) => {
    if (!fs.existsSync(statePathOf(name))) return { ok: false, reason: 'not-found' };
    currentProject = name;
    lastMtime = -1;
    sendState(name);
    switchDshWorkspace(name);
    touchContext();
    console.log('[shell] 切换项目 →', name);
    return { ok: true, current: name };
  });
  ipcMain.handle('aqara:new-project', (_e, name) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, reason: 'empty' };
    if (fs.existsSync(statePathOf(n))) return { ok: false, reason: 'exists' };
    fs.mkdirSync(projectDirOf(n), { recursive: true });
    fs.writeFileSync(statePathOf(n), JSON.stringify(defaultState(n), null, 2));
    registerDshWorkspace(projectDirOf(n), n);
    try { buildProjectContext(n); } catch (_) {}
    console.log('[shell] 新建项目 →', n);
    return { ok: true, projects: listProjects() };
  });
  // 读取本地 GLB（返回 Buffer，渲染进程转 ArrayBuffer 给 GLTFLoader.parse）
  ipcMain.handle('aqara:load-model', (_e, name) => {
    try {
      const p = path.join(__dirname, 'workspace', 'models', path.basename(String(name || '')));
      return fs.readFileSync(p);
    } catch (_) { return null; }
  });
  // 读取场景清单 JSON（34 个灯光/窗帘/开关通道）
  ipcMain.handle('aqara:load-manifest', (_e, name) => {
    try {
      const p = path.join(__dirname, 'workspace', 'models', path.basename(String(name || '')));
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) { return null; }
  });

  // 搭子 · 技能 · 连接器：读取 / 新增搭子
  const readPartners = () => {
    try { return JSON.parse(fs.readFileSync(PARTNERS_FILE, 'utf8')); }
    catch (_) { return { partners: [], skills: [], connectors: [] }; }
  };
  ipcMain.handle('aqara:list-partners', () => readPartners());
  // 把「搭子」落成真实技能（写入 ~/.dsh/skills，dsh 实时发现 → Agent 真能加载）
  function ensurePartnerSkillFile(p) {
    const id = String(p.id || '').trim() || ('p-' + Date.now().toString(36));
    const slug = 'aqara-partner-' + id.replace(/[^a-zA-Z0-9_-]/g, '-');
    const dir = path.join(SKILLS_DIR, slug);
    const file = path.join(dir, 'SKILL.md');
    if (fs.existsSync(file)) return { skillId: slug, path: file, created: false };
    fs.mkdirSync(dir, { recursive: true });
    const name = p.name || id;
    const desc = String(p.intro || name).replace(/\n/g, ' ').trim();
    const when = ('当用户需要「' + name + '」相关的工作时').replace(/\n/g, ' ');
    const tags = Array.isArray(p.tags) && p.tags.length ? ('## 关注点\n- ' + p.tags.join('\n- ')) : '';
    const body = ['# ' + name, '', String(p.intro || '').trim(), '', '## 工作方式', '', String(p.prompt || ('按「' + name + '」的职责完成用户任务。')).trim(), '', tags, ''].join('\n');
    const fm = ['---', 'name: ' + slug, 'description: ' + desc, 'whenToUse: ' + when, '---', '', body].join('\n');
    fs.writeFileSync(file, fm);
    return { skillId: slug, path: file, created: true };
  }

  ipcMain.handle('aqara:create-partner', (_e, p) => {
    try {
      const d = readPartners();
      const name = String((p && p.name) || '').trim() || '未命名搭子';
      const partner = {
        id: 'p-' + Date.now().toString(36),
        name,
        mark: String((p && p.mark) || '').trim() || name.slice(0, 1),
        official: false,
        category: String((p && p.category) || '').trim() || '自定义',
        intro: String((p && p.intro) || '').trim(),
        tags: Array.isArray(p && p.tags) ? p.tags : [],
        prompt: String((p && p.prompt) || '').trim(),
      };
      d.partners = d.partners || [];
      d.partners.push(partner);
      fs.writeFileSync(PARTNERS_FILE, JSON.stringify(d, null, 2));
      // 同时落成真实技能，让 Agent 真的具备该搭子能力
      const sk = ensurePartnerSkillFile(partner);
      console.log('[shell] 新建搭子 →', name, '（技能', sk.skillId, '）');
      return { ok: true, data: d, skill: sk };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });

  // 启用搭子前，确保其技能已落到磁盘（幂等）
  ipcMain.handle('aqara:ensure-partner-skill', (_e, id) => {
    try {
      const d = readPartners();
      const p = (d.partners || []).find((x) => x.id === id);
      if (!p) return { ok: false, reason: '搭子不存在' };
      const sk = ensurePartnerSkillFile(p);
      console.log('[shell] 搭子技能就绪 →', sk.skillId);
      return { ok: true, skillId: sk.skillId, path: sk.path, created: sk.created };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });

  // 连接器（MCP）：真实写 dsh 的 patch 配置（cordis.patch.yml），dsh 会热加载
  const MCP_MARK_START = '# >>> aqara-mcp (auto-generated; do not edit inside)';
  const MCP_MARK_END = '# <<< aqara-mcp';
  const readConnectors = () => {
    try { const d = JSON.parse(fs.readFileSync(CONNECTORS_FILE, 'utf8')); return Array.isArray(d) ? d : (d.connectors || []); }
    catch (_) { return []; }
  };
  const writeConnectors = (list) => { fs.writeFileSync(CONNECTORS_FILE, JSON.stringify(list, null, 2)); };
  const buildMcpSection = (list) => {
    if (!list.length) return '';
    const blocks = list.map((c) => {
      const L = [];
      L.push('- insert:');
      L.push('    - id: mcp-' + c.serverName);
      L.push("      name: '@deepseek-ai/dsh-mcp-client'");
      L.push('      config:');
      L.push('        serverName: ' + c.serverName);
      if (c.transport === 'http') {
        L.push('        transport: streamable-http');
        L.push('        url: ' + JSON.stringify(c.url || ''));
      } else {
        L.push('        transport: stdio');
        L.push('        command: ' + JSON.stringify(c.command || ''));
        if (Array.isArray(c.args) && c.args.length) L.push('        args: [' + c.args.map((a) => JSON.stringify(String(a))).join(', ') + ']');
      }
      L.push('        failOnStartupError: false');
      return L.join('\n');
    });
    return [MCP_MARK_START, ...blocks, MCP_MARK_END].join('\n');
  };
  const applyMcpPatch = (list) => {
    let txt = '';
    try { txt = fs.readFileSync(MCP_PATCH_FILE, 'utf8'); } catch (_) {}
    const rest = txt.replace(/# >>> aqara-mcp[\s\S]*?# <<< aqara-mcp\n?/g, '');
    const meaningful = rest.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join('\n');
    const baseEmpty = (meaningful === '' || meaningful === '[]');
    const section = buildMcpSection(list);
    let out;
    if (baseEmpty) {
      out = (section ? ('# dsh profile patch（Aqara 连接器自动管理）\n' + section + '\n') : '[]\n');
    } else {
      out = rest.replace(/\n+$/, '') + '\n' + (section ? (section + '\n') : '');
    }
    fs.mkdirSync(path.dirname(MCP_PATCH_FILE), { recursive: true });
    fs.writeFileSync(MCP_PATCH_FILE, out);
    return out;
  };

  ipcMain.handle('aqara:list-connectors', () => {
    const list = readConnectors();
    return { ok: true, servers: list, configPath: MCP_PATCH_FILE, exists: fs.existsSync(MCP_PATCH_FILE), patch: (() => { try { return fs.readFileSync(MCP_PATCH_FILE, 'utf8'); } catch (_) { return ''; } })() };
  });
  ipcMain.handle('aqara:add-connector', (_e, c) => {
    try {
      const list = readConnectors();
      const serverName = String((c && c.serverName) || '').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32);
      if (!serverName) return { ok: false, reason: '请填写连接器标识（英文/数字）' };
      if (list.some((x) => x.serverName === serverName)) return { ok: false, reason: '同名连接器已存在' };
      const transport = (c && c.transport === 'http') ? 'http' : 'stdio';
      const rec = {
        id: 'cn-' + Date.now().toString(36),
        serverName,
        name: String((c && c.name) || serverName).trim(),
        transport,
        command: String((c && c.command) || '').trim(),
        args: Array.isArray(c && c.args) ? c.args : (String((c && c.args) || '').trim() ? String(c.args).trim().split(/\s+/) : []),
        url: String((c && c.url) || '').trim(),
        enabled: true,
      };
      if (transport === 'stdio' && !rec.command) return { ok: false, reason: 'stdio 连接器需要 command' };
      if (transport === 'http' && !rec.url) return { ok: false, reason: 'http 连接器需要 url' };
      list.push(rec);
      writeConnectors(list);
      applyMcpPatch(list.filter((x) => x.enabled));
      touchContext();
      console.log('[shell] 新增连接器 →', serverName, '(' + transport + ')');
      return { ok: true, servers: list, patchPath: MCP_PATCH_FILE };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:remove-connector', (_e, id) => {
    try {
      let list = readConnectors();
      list = list.filter((x) => x.id !== id);
      writeConnectors(list);
      applyMcpPatch(list.filter((x) => x.enabled));
      touchContext();
      console.log('[shell] 删除连接器 →', id);
      return { ok: true, servers: list };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:toggle-connector', (_e, id) => {
    try {
      const list = readConnectors();
      const x = list.find((v) => v.id === id);
      if (!x) return { ok: false, reason: '未找到连接器' };
      x.enabled = !x.enabled;
      writeConnectors(list);
      applyMcpPatch(list.filter((v) => v.enabled));
      touchContext();
      console.log('[shell] 连接器', x.enabled ? '启用' : '停用', '→', x.serverName);
      return { ok: true, servers: list };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:open-mcp-config', () => {
    try {
      fs.mkdirSync(path.dirname(MCP_PATCH_FILE), { recursive: true });
      if (!fs.existsSync(MCP_PATCH_FILE)) fs.writeFileSync(MCP_PATCH_FILE, '[]\n');
      shell.openPath(MCP_PATCH_FILE);
    } catch (_) {}
    return { ok: true, path: MCP_PATCH_FILE };
  });
  // ---------- 项目上下文总线（生成给 Agent 读取的清单）----------
  const contextFilePath = (name) => path.join(projectDirOf(name), '.aqara-context.md');
  function buildProjectContext(name) {
    const nm = name || currentProject;
    const st = readState(nm) || {};
    let libFiles = [];
    try { libFiles = fs.readdirSync(libraryDir(nm)).filter((n) => !n.startsWith('.')); } catch (_) {}
    const skills = scanSkills().filter((s) => !s.disabled).map((s) => s.id);
    const conns = readConnectors().filter((c) => c.enabled).map((c) => c.serverName);
    let model = null;
    try {
      const mp = path.join(__dirname, 'workspace', 'models', 'home.manifest.json');
      if (fs.existsSync(mp)) { const m = JSON.parse(fs.readFileSync(mp, 'utf8')); model = { file: 'home.glb', controls: (m.controls || []).length }; }
    } catch (_) {}
    const proj = st.project || { name: nm };
    const rooms = (st.rooms || []).length, devices = (st.devices || []).length, scenes = (st.scenes || []).length;
    const md = [
      '# Aqara 项目上下文（自动生成，供 Agent 读取）', '',
      '- 项目：' + (proj.name || nm),
      '- 更新：' + new Date().toISOString(),
      '- 房间数：' + rooms + ' ｜ 设备数：' + devices + ' ｜ 场景数：' + scenes,
      model ? ('- 数字孪生：' + model.file + '（可控通道 ' + model.controls + '）') : '- 数字孪生：（无）', '',
      '## 资料库（本项目）',
      libFiles.length ? libFiles.map((n) => '- library/' + n).join('\n') : '- （空）', '',
      '## 已启用技能',
      skills.length ? skills.map((s) => '- ' + s).join('\n') : '- （无）', '',
      '## 连接器（MCP）',
      conns.length ? conns.map((c) => '- ' + c).join('\n') : '- （无）', '',
      '## 使用说明',
      'Agent 可直接读取本文件了解当前项目的全部资料与可用能力；资料库文件位于 library/ 目录，可直接读取。', '',
    ].join('\n');
    try { fs.writeFileSync(contextFilePath(nm), md); } catch (_) {}
    return { project: proj.name || nm, rooms, devices, scenes, library: libFiles, skills, connectors: conns, model, path: contextFilePath(nm) };
  }
  const touchContext = () => { try { buildProjectContext(); } catch (_) {} };
  ipcMain.handle('aqara:get-context', (_e, name) => { try { return Object.assign({ ok: true }, buildProjectContext(name)); } catch (e) { return { ok: false, reason: e && e.message }; } });

  // ---------- 凭据中心（系统加密存储）+ 适配层调用（含写操作确认/审计）----------
  const credAvailable = () => { try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; } };
  const readCred = () => {
    try {
      if (!fs.existsSync(CRED_FILE)) return null;
      const b64 = fs.readFileSync(CRED_FILE, 'utf8').trim();
      if (!b64 || !credAvailable()) return null;
      return JSON.parse(safeStorage.decryptString(Buffer.from(b64, 'base64')));
    } catch (_) { return null; }
  };
  const writeCred = (obj) => {
    if (!credAvailable()) throw new Error('系统加密不可用，无法保存凭据');
    fs.mkdirSync(SECURE_DIR, { recursive: true });
    fs.writeFileSync(CRED_FILE, safeStorage.encryptString(JSON.stringify(obj)).toString('base64'), 'utf8');
  };
  const maskVal = (s) => { const v = String(s || ''); return v ? (v.length <= 4 ? '••••' : (v.slice(0, 2) + '••••' + v.slice(-2))) : ''; };
  const credSummary = () => {
    const c = readCred();
    return {
      available: credAvailable(),
      configured: !!(c && c.baseUrl && c.token),
      kind: c ? (c.kind || 'openapi') : 'openapi',
      baseUrl: c ? (c.baseUrl || '') : '',
      region: c ? (c.region || '') : '',
      orgId: c ? (c.orgId || '') : '',
      appKeyMasked: maskVal(c && c.appKey),
      tokenMasked: maskVal(c && c.token),
    };
  };
  ipcMain.handle('aqara:cred-status', () => ({ ok: true, ...credSummary() }));
  ipcMain.handle('aqara:save-credentials', (_e, c) => {
    try {
      const prev = readCred() || {};
      const next = {
        kind: String((c && c.kind) || prev.kind || 'openapi'),
        baseUrl: (String((c && c.baseUrl) || '').trim() || prev.baseUrl || ''),
        region: (String((c && c.region) || '').trim() || prev.region || ''),
        orgId: (String((c && c.orgId) || '').trim() || prev.orgId || ''),
        appKey: String((c && c.appKey) || prev.appKey || '').trim(),
        token: String((c && c.token) || prev.token || '').trim(),
        paths: (c && c.paths) || prev.paths || {},
      };
      if (!next.baseUrl || !next.token) return { ok: false, reason: 'baseUrl 与 token 必填' };
      writeCred(next);
      console.log('[shell] 凭据已加密保存');
      return { ok: true, ...credSummary() };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:clear-credentials', () => { try { fs.rmSync(CRED_FILE, { force: true }); return { ok: true }; } catch (e) { return { ok: false, reason: e && e.message }; } });

  const auditLog = (entry) => {
    try { fs.appendFileSync(path.join(projectDirOf(), 'audit.log'), JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + '\n'); } catch (_) {}
  };
  const WRITE_METHODS = new Set(['controlDevice', 'executeScene']);
  ipcMain.handle('aqara:adapter-call', async (_e, method, params) => {
    try {
      const cred = readCred();
      const { createAdapter } = require(path.join(__dirname, 'adapters', 'index.js'));
      const adapter = createAdapter(cred);
      if (!adapter) return { ok: false, reason: 'not_configured', message: '未配置 Aqara 接入凭据' };
      if (typeof adapter[method] !== 'function') return { ok: false, reason: 'bad_method' };
      if (WRITE_METHODS.has(method) && !(params && params.confirm)) {
        return { ok: false, reason: 'need_confirm', message: '该操作会改动真实设备，请确认后执行', method, params };
      }
      const data = await adapter[method](params && params.id, params);
      if (WRITE_METHODS.has(method)) auditLog({ method, params, ok: true });
      return { ok: true, data };
    } catch (e) {
      if (WRITE_METHODS.has(method)) auditLog({ method, params, ok: false, error: e && e.message });
      return { ok: false, reason: 'error', message: e && e.message };
    }
  });

  // ---------- Blender 连接器：检测 / 安装 / 状态 / 打开 ----------
  const detectBlender = () => {
    const apps = ['/Applications/Blender.app', path.join(os.homedir(), 'Applications', 'Blender.app')];
    const appPath = apps.find((p) => fs.existsSync(p)) || null;
    let versions = [];
    try {
      versions = fs.readdirSync(BLENDER_SUPPORT, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d+\.\d+/.test(d.name)).map((d) => d.name)
        .sort((a, b) => (parseFloat(b) || 0) - (parseFloat(a) || 0));
    } catch (_) {}
    const version = versions[0] || '';
    const addonsDir = version ? path.join(BLENDER_SUPPORT, version, 'scripts', 'addons') : '';
    const addonInstalled = addonsDir ? fs.existsSync(path.join(addonsDir, 'aqara_mcp_bridge', '__init__.py')) : false;
    return { installed: !!appPath, appPath, version, versions, addonsDir, addonInstalled };
  };
  ipcMain.handle('aqara:blender-status', async () => {
    const d = detectBlender();
    let bridge = false, bridgeVersion = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const r = await fetch('http://127.0.0.1:9887/ping', { signal: ctrl.signal });
      clearTimeout(t);
      const j = await r.json();
      bridge = !!(j && j.ok);
      bridgeVersion = (j && j.blender) || '';
    } catch (_) {}
    return Object.assign({ ok: true, bridge, bridgeVersion }, d);
  });
  ipcMain.handle('aqara:blender-install', () => {
    try {
      const d = detectBlender();
      if (!d.appPath) return { ok: false, reason: '未检测到 Blender，请确认已安装到「应用程序」' };
      if (!d.addonsDir) return { ok: false, reason: '未找到 Blender 用户目录，请先打开一次 Blender 以生成配置' };
      fs.mkdirSync(d.addonsDir, { recursive: true });
      const dest = path.join(d.addonsDir, 'aqara_mcp_bridge');
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(BLENDER_ADDON_SRC, dest, { recursive: true });
      const list = readConnectors();
      if (!list.some((x) => x.serverName === 'blender')) {
        list.push({ id: 'cn-' + Date.now().toString(36), serverName: 'blender', name: 'Blender', transport: 'stdio', command: REAL_NODE, args: [BLENDER_MCP_SCRIPT], url: '', enabled: true });
        writeConnectors(list);
        applyMcpPatch(list.filter((x) => x.enabled));
        touchContext();
      }
      console.log('[shell] Blender 插件已安装 →', dest);
      return { ok: true, dest, connector: 'blender' };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:blender-open', () => {
    try { const d = detectBlender(); if (d.appPath) shell.openPath(d.appPath); return { ok: !!d.appPath }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });

  // 启动时按注册表同步一次 patch（保持磁盘与 UI 一致）
  try { applyMcpPatch(readConnectors().filter((x) => x.enabled)); } catch (_) {}
  // 首次生成项目上下文
  try { buildProjectContext(); } catch (_) {}

  // ---------- 资料库（真实文件）----------
  const walkLibrary = () => {
    const out = [];
    const walk = (dir, rel) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        const r = rel ? (rel + '/' + e.name) : e.name;
        if (e.isDirectory()) { walk(abs, r); continue; }
        let st = null; try { st = fs.statSync(abs); } catch (_) {}
        const ext = path.extname(e.name).toLowerCase();
        out.push({
          name: e.name,
          rel: r,
          size: st ? st.size : 0,
          mtime: st ? st.mtimeMs : 0,
          date: st ? new Date(st.mtime).toISOString().slice(0, 10) : '',
          kind: LIB_IMG_EXT.has(ext) ? 'image' : (LIB_DOC_EXT.has(ext) ? 'doc' : 'other'),
          ext: ext.replace('.', ''),
          isGenerated: r.startsWith('generated/'),
        });
      }
    };
    walk(libraryDir(), '');
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  };
  const libAbs = (rel) => path.join(libraryDir(), String(rel || '').replace(/\.\.(\/|\\)/g, ''));

  // 语义向量检索（本地：中文按字/双字切分 + TF-IDF 加权 + 余弦相似度）
  const VEC_DIM = 1024;
  let vecIndex = null;
  const vecTokenizer = (s) => {
    const out = [];
    const lower = String(s || '').toLowerCase();
    const words = lower.match(/[a-z0-9_]+/g) || [];
    for (const w of words) out.push('w:' + w);
    const cjk = lower.replace(/[^\u4e00-\u9fa5]+/g, ' ');
    for (const seg of cjk.split(/\s+/)) {
      for (let i = 0; i < seg.length; i++) {
        out.push('c:' + seg[i]);
        if (i + 1 < seg.length) out.push('b:' + seg.slice(i, i + 2));
      }
    }
    return out;
  };
  const vecHash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % VEC_DIM; };
  const vecChunk = (text, size = 420, overlap = 80) => {
    const out = [];
    const t = String(text || '').replace(/\r/g, '');
    for (let i = 0; i < t.length; i += (size - overlap)) {
      out.push({ offset: i, text: t.slice(i, i + size) });
      if (i + size >= t.length) break;
    }
    return out;
  };
  const vecOf = (text, idf) => {
    const v = new Float32Array(VEC_DIM);
    const tf = new Map();
    for (const t of vecTokenizer(text)) { const h = vecHash(t); tf.set(h, (tf.get(h) || 0) + 1); }
    for (const [h, n] of tf) v[h] += (1 + Math.log(n)) * (idf ? idf[h] : 1);
    let norm = 0; for (let i = 0; i < VEC_DIM; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < VEC_DIM; i++) v[i] /= norm;
    return v;
  };
  const buildVecIndex = () => {
    const files = walkLibrary();
    const chunks = [];
    for (const f of files) {
      if (!LIB_TEXT_EXT.has('.' + f.ext)) continue;
      let text = ''; try { text = fs.readFileSync(libAbs(f.rel), 'utf8'); } catch (_) {}
      if (!text) continue;
      for (const c of vecChunk(text)) chunks.push({ rel: f.rel, name: f.name, offset: c.offset, text: c.text });
    }
    const df = new Float32Array(VEC_DIM);
    for (const c of chunks) {
      const seen = new Set();
      for (const t of vecTokenizer(c.text)) { const h = vecHash(t); if (!seen.has(h)) { seen.add(h); df[h] += 1; } }
    }
    const N = Math.max(1, chunks.length);
    const idf = new Float32Array(VEC_DIM);
    for (let i = 0; i < VEC_DIM; i++) idf[i] = Math.log((N + 1) / (df[i] + 1)) + 1;
    for (const c of chunks) c.vec = vecOf(c.text, idf);
    vecIndex = { dim: VEC_DIM, idf, chunks };
    return { chunks: chunks.length, files: new Set(chunks.map((c) => c.rel)).size };
  };
  const semanticSearch = (q, k = 8) => {
    if (!vecIndex || !vecIndex.chunks.length) buildVecIndex();
    if (!vecIndex || !vecIndex.chunks.length) return [];
    const qv = vecOf(q, vecIndex.idf);
    const scored = vecIndex.chunks.map((c) => { let s = 0; for (let i = 0; i < VEC_DIM; i++) s += qv[i] * c.vec[i]; return { c, s }; });
    scored.sort((a, b) => b.s - a.s);
    return scored.filter((x) => x.s > 0.01).slice(0, k).map(({ c, s }) => ({
      rel: c.rel, name: c.name, score: Math.round(s * 1000) / 1000,
      snippet: c.text.slice(0, 200).replace(/\s+/g, ' ').trim(), offset: c.offset,
    }));
  };
  let libIndex = null;
  const LIB_TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yml', '.yaml', '.html', '.htm', '.xml', '.js', '.ts', '.css', '.py']);
  const buildLibraryIndex = () => {
    const files = walkLibrary();
    libIndex = {
      builtAt: Date.now(),
      files: files.map((f) => {
        let text = '';
        if (LIB_TEXT_EXT.has('.' + f.ext)) { try { text = fs.readFileSync(libAbs(f.rel), 'utf8').slice(0, 20000); } catch (_) {} }
        return { rel: f.rel, name: f.name, ext: f.ext, kind: f.kind, date: f.date, text };
      }),
    };
    return libIndex;
  };
  const searchLibrary = (q) => {
    const k = String(q || '').trim().toLowerCase();
    if (!k) return [];
    if (!libIndex) buildLibraryIndex();
    const out = [];
    for (const f of libIndex.files) {
      const inName = f.name.toLowerCase().includes(k);
      let snippet = '', hit = 0;
      if (f.text) {
        const low = f.text.toLowerCase();
        const i = low.indexOf(k);
        if (i >= 0) { hit = 1; const s = Math.max(0, i - 30); snippet = f.text.slice(s, Math.min(f.text.length, i + k.length + 80)).replace(/\s+/g, ' ').trim(); }
      }
      if (inName || hit) out.push({ rel: f.rel, name: f.name, ext: f.ext, kind: f.kind, date: f.date, score: (inName ? 2 : 0) + hit, snippet });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 50);
  };

  ipcMain.handle('aqara:list-library', () => {
    try { fs.mkdirSync(libraryDir(), { recursive: true }); } catch (_) {}
    const files = walkLibrary();
    return {
      ok: true,
      dir: libraryDir(),
      files,
      uploads: files.filter((f) => !f.isGenerated).length,
      generated: files.filter((f) => f.isGenerated).length,
    };
  });
  // 知识检索：重建索引 / 内容检索
  ipcMain.handle('aqara:library-reindex', () => {
    try { const i = buildLibraryIndex(); return { ok: true, count: i.files.length, indexed: i.files.filter((f) => f.text).length }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:library-search', (_e, q) => {
    try { return { ok: true, results: searchLibrary(q) }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });
  // 语义向量检索
  ipcMain.handle('aqara:library-vec-index', () => {
    try { const i = buildVecIndex(); return { ok: true, chunks: i.chunks, files: i.files }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:library-semantic-search', (_e, q) => {
    try { return { ok: true, results: semanticSearch(q) }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:import-library', async () => {
    try {
      const r = await dialog.showOpenDialog({ title: '上传到资料库', properties: ['openFile', 'multiSelections'] });
      if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
      fs.mkdirSync(libraryDir(), { recursive: true });      for (const src of r.filePaths) {
        let name = path.basename(src);
        let dest = path.join(libraryDir(), name);
        if (fs.existsSync(dest)) {
          const base = name.replace(/\.[^.]+$/, '');
          const ext = path.extname(name);
          name = base + '-' + Date.now().toString(36) + ext;
          dest = path.join(libraryDir(), name);
        }
        fs.copyFileSync(src, dest);
      }
      console.log('[shell] 资料库导入', r.filePaths.length, '个文件');
      libIndex = null; vecIndex = null; touchContext();
      return { ok: true, files: walkLibrary() };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:library-thumb', (_e, rel) => {
    try {
      const abs = libAbs(rel);
      const img = nativeImage.createFromPath(abs);
      if (img.isEmpty()) return null;
      const size = img.getSize();
      const w = Math.min(480, size.width || 480);
      const small = img.resize({ width: w });
      return small.toDataURL();
    } catch (_) { return null; }
  });
  ipcMain.handle('aqara:open-library-item', (_e, rel) => { try { shell.openPath(libAbs(rel)); } catch (_) {} return { ok: true }; });
  ipcMain.handle('aqara:reveal-library', () => { try { fs.mkdirSync(libraryDir(), { recursive: true }); shell.openPath(libraryDir()); } catch (_) {} return { ok: true, dir: libraryDir() }; });
  ipcMain.handle('aqara:delete-library-item', (_e, rel) => {
    try { fs.rmSync(libAbs(rel), { recursive: true, force: true }); libIndex = null; vecIndex = null; touchContext(); return { ok: true, files: walkLibrary() }; }
    catch (e) { return { ok: false, reason: e && e.message }; }
  });
  // 把选中的资料库文件复制进当前项目工作区（Agent 可读）→ 返回工作区相对路径
  ipcMain.handle('aqara:library-to-chat', (_e, rels) => {
    try {
      const dstDir = path.join(projectDirOf(), 'library');
      fs.mkdirSync(dstDir, { recursive: true });
      const copied = [];
      for (const rel of (Array.isArray(rels) ? rels : [])) {
        const src = libAbs(rel);
        if (!fs.existsSync(src)) continue;
        const name = path.basename(src);
        fs.copyFileSync(src, path.join(dstDir, name));
        copied.push('library/' + name);
      }
      return { ok: true, copied };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });

  // 数字孪生：加载资料库生成的 GLB（library/generated）
  const generatedDir = () => path.join(libraryDir(), 'generated');
  ipcMain.handle('aqara:list-generated', () => {
    try {
      const dir = generatedDir();
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.glb')) : [];
      return { ok: true, files, dir };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:load-generated', (_e, name) => {
    try { return fs.readFileSync(path.join(generatedDir(), path.basename(String(name || '')))); }
    catch (_) { return null; }
  });

  // ---------- 扫码上传：临时 HTTP 服务 + 二维码（手机扫码上传到资料库）----------
  let qrServer = null, qrToken = '', qrUrl = '';
  const lanIp = () => {
    const ifs = os.networkInterfaces();
    for (const k of Object.keys(ifs)) for (const a of (ifs[k] || [])) if (a && a.family === 'IPv4' && !a.internal) return a.address;
    return '127.0.0.1';
  };
  const qrSvg = (text) => {
    const QRCode = require(path.join(__dirname, 'vendor', 'qrcode', 'index.js'));
    const ECL = require(path.join(__dirname, 'vendor', 'qrcode', 'QRErrorCorrectLevel.js'));
    const q = new QRCode(-1, ECL.M);
    q.addData(text); q.make();
    const n = q.getModuleCount(), quiet = 4, scale = 6, size = (n + quiet * 2) * scale;
    let rects = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) rects += '<rect x="' + ((c + quiet) * scale) + '" y="' + ((r + quiet) * scale) + '" width="' + scale + '" height="' + scale + '"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/><g fill="#000">' + rects + '</g></svg>';
  };
  const UPLOAD_PAGE = (token) => `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上传到 Aqara 资料库</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#f5f5f5;color:#111;padding:24px}
.card{background:#fff;border-radius:16px;padding:22px;max-width:520px;margin:0 auto;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 6px}.hint{font-size:13px;color:#777;margin:0 0 18px}
input[type=file]{width:100%;padding:14px;border:1.5px dashed #ccc;border-radius:12px;background:#fafafa;font-size:13px;box-sizing:border-box}
button{margin-top:14px;width:100%;padding:13px;border:none;border-radius:12px;background:#111;color:#fff;font-size:15px;font-weight:700}
.sel{margin-top:12px;font-size:12px;color:#666;word-break:break-all}</style></head>
<body><div class="card"><h1>上传到 Aqara 资料库</h1><p class="hint">选择照片或文件，上传后会出现在桌面端「资料库」。</p>
<form method="post" enctype="multipart/form-data" action="/u/${token}/upload">
<input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.ppt,.pptx,.xls,.xlsx" onchange="document.getElementById('sel').textContent=this.files.length+' 个文件已选择'">
<button type="submit">上传</button></form><div class="sel" id="sel"></div></div></body></html>`;
  const parseMultipart = (buf, boundary) => {
    const out = [];
    const delim = Buffer.from('--' + boundary);
    let start = buf.indexOf(delim);
    while (start !== -1) {
      const after = start + delim.length;
      if (buf[after] === 0x2d && buf[after + 1] === 0x2d) break;
      const partStart = after + 2;
      const next = buf.indexOf(delim, partStart);
      if (next === -1) break;
      let part = buf.slice(partStart, next);
      if (part.length >= 2 && part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) part = part.slice(0, part.length - 2);
      const he = part.indexOf('\r\n\r\n');
      if (he !== -1) {
        const head = part.slice(0, he).toString('utf8');
        const body = part.slice(he + 4);
        const fn = /filename="([^"]*)"/.exec(head);
        if (fn && fn[1]) out.push({ name: path.basename(decodeURIComponent(fn[1])), data: body });
      }
      start = next;
    }
    return out;
  };
  const stopQrServer = () => { try { if (qrServer) qrServer.close(); } catch (_) {} qrServer = null; };
  ipcMain.handle('aqara:qr-start', async () => {
    stopQrServer();
    qrToken = Math.random().toString(36).slice(2, 10);
    return await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const p = u.pathname;
        const base = '/u/' + qrToken;
        if (req.method === 'GET' && p === base) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(UPLOAD_PAGE(qrToken)); return;
        }
        if (req.method === 'POST' && p === base + '/upload') {
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              const buf = Buffer.concat(chunks);
              const m = /boundary=(.+)$/.exec(req.headers['content-type'] || '');
              const boundary = m ? m[1].replace(/^"|"$/g, '') : '';
              const files = boundary ? parseMultipart(buf, boundary) : [];
              fs.mkdirSync(libraryDir(), { recursive: true });
              const saved = [];
              for (const f of files) {
                let name = f.name || ('upload-' + Date.now() + '.bin');
                let dest = path.join(libraryDir(), name);
                if (fs.existsSync(dest)) { const b = name.replace(/\.[^.]+$/, ''), ext = path.extname(name); name = b + '-' + Date.now().toString(36) + ext; dest = path.join(libraryDir(), name); }
                fs.writeFileSync(dest, f.data); saved.push(name);
              }
              console.log('[shell] 扫码上传', saved.length, '个文件');
              if (panelView && !panelView.webContents.isDestroyed()) panelView.webContents.send('aqara:library-uploaded', { files: saved });
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,sans-serif;padding:36px;text-align:center"><div style="font-size:44px">✅</div><h2>上传成功</h2><p style="color:#666">' + saved.length + ' 个文件已加入资料库</p><p style="color:#999;font-size:12px">可直接关闭此页</p></body>');
            } catch (e) { res.writeHead(500); res.end('upload failed'); }
          });
          return;
        }
        res.writeHead(404); res.end('not found');
      });
      server.on('error', () => resolve({ ok: false, reason: '无法启动上传服务' }));
      server.listen(0, '0.0.0.0', () => {
        qrServer = server;
        const port = server.address().port;
        qrUrl = 'http://' + lanIp() + ':' + port + '/u/' + qrToken;
        resolve({ ok: true, url: qrUrl, svg: qrSvg(qrUrl), ip: lanIp(), port });
      });
    });
  });
  ipcMain.handle('aqara:qr-stop', () => { stopQrServer(); return { ok: true }; });

  // ---------- 真·技能管理（读写 ~/.dsh/skills，dsh 实时发现）----------
  const parseFrontmatter = (text) => {
    const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return {};
    const data = {};
    m[1].split('\n').forEach((line) => {
      const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (mm) data[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, '');
    });
    return data;
  };
  const readSkillAt = (file, id, disabled) => {
    let data = {};
    try { data = parseFrontmatter(fs.readFileSync(file, 'utf8')); } catch (_) {}
    return {
      id,
      name: data.name || id,
      description: data.description || '',
      whenToUse: data.whenToUse || '',
      path: file,
      disabled: !!disabled,
      modelDisabled: String(data['disable-model-invocation']) === 'true',
      updatedAt: (() => { try { return fs.statSync(file).mtime.toISOString().slice(0, 10); } catch (_) { return ''; } })(),
    };
  };
  const scanSkills = () => {
    const out = [];
    const scan = (dir, disabled) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        if (e.isDirectory()) {
          const f = path.join(dir, e.name, 'SKILL.md');
          if (fs.existsSync(f)) out.push(readSkillAt(f, e.name, disabled));
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
          out.push(readSkillAt(path.join(dir, e.name), e.name.replace(/\.md$/i, ''), disabled));
        }
      }
    };
    scan(SKILLS_DIR, false);
    scan(SKILLS_DISABLED_DIR, true);
    out.sort((a, b) => (a.disabled - b.disabled) || a.name.localeCompare(b.name));
    return out;
  };
  const skillPathOf = (id, disabled) => path.join(disabled ? SKILLS_DISABLED_DIR : SKILLS_DIR, String(id));

  ipcMain.handle('aqara:list-skills', () => scanSkills());
  ipcMain.handle('aqara:reveal-skills-dir', () => { try { fs.mkdirSync(SKILLS_DIR, { recursive: true }); shell.openPath(SKILLS_DIR); } catch (_) {} return { ok: true, dir: SKILLS_DIR }; });
  ipcMain.handle('aqara:open-skill', (_e, p) => { try { shell.showItemInFolder(String(p)); } catch (_) {} return { ok: true }; });
  ipcMain.handle('aqara:reveal-skill', (_e, id, disabled) => { try { shell.showItemInFolder(skillPathOf(id, disabled)); } catch (_) {} return { ok: true }; });
  ipcMain.handle('aqara:create-skill', (_e, s) => {
    try {
      const raw = String((s && s.name) || '').trim();
      if (!raw) return { ok: false, reason: '请填写技能名称' };
      const slug = raw.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || ('skill-' + Date.now());
      const dir = path.join(SKILLS_DIR, slug);
      if (fs.existsSync(dir)) return { ok: false, reason: '同名技能已存在：' + slug };
      fs.mkdirSync(dir, { recursive: true });
      const desc = String((s && s.description) || raw).replace(/\n/g, ' ').trim();
      const when = String((s && s.whenToUse) || '').replace(/\n/g, ' ').trim();
      const body = String((s && s.body) || '').trim() || ('# ' + raw + '\n\n## 何时使用\n- \n\n## 步骤\n1. \n');
      const fm = ['---', 'name: ' + slug, 'description: ' + desc, when ? ('whenToUse: ' + when) : null, '---', '', body, ''].filter((x) => x !== null).join('\n');
      fs.writeFileSync(path.join(dir, 'SKILL.md'), fm);
      touchContext();
      console.log('[shell] 新建技能 →', slug);
      return { ok: true, skills: scanSkills(), id: slug };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:import-skill', async () => {
    try {
      const r = await dialog.showOpenDialog({
        title: '选择技能文件夹（需包含 SKILL.md）', properties: ['openDirectory'],
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      const src = r.filePaths[0];
      if (!fs.existsSync(path.join(src, 'SKILL.md'))) return { ok: false, reason: '该文件夹没有 SKILL.md' };
      const name = path.basename(src);
      const dest = path.join(SKILLS_DIR, name);
      if (fs.existsSync(dest)) return { ok: false, reason: '同名技能已存在：' + name };
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      touchContext();
      console.log('[shell] 导入技能 →', name);
      return { ok: true, skills: scanSkills(), id: name };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:set-skill-enabled', (_e, id, enabled) => {
    try {
      const from = skillPathOf(id, !enabled);
      const to = skillPathOf(id, enabled ? false : true);
      if (!fs.existsSync(from)) return { ok: false, reason: '未找到技能' };
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);
      touchContext();
      console.log('[shell] 技能' + (enabled ? '启用' : '停用') + ' →', id);
      return { ok: true, skills: scanSkills() };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });
  ipcMain.handle('aqara:delete-skill', (_e, id, disabled) => {
    try {
      const p = skillPathOf(id, disabled);
      if (!fs.existsSync(p)) return { ok: false, reason: '未找到技能' };
      fs.rmSync(p, { recursive: true, force: true });
      touchContext();
      console.log('[shell] 删除技能 →', id);
      return { ok: true, skills: scanSkills() };
    } catch (e) { return { ok: false, reason: e && e.message }; }
  });

  // 轮询当前项目 state.json 的 mtime（比 fs.watch 稳：Agent 的原子写/改名也能捕捉）
  let lastMtime = -1;
  try { lastMtime = fs.statSync(statePathOf()).mtimeMs; } catch (_) {}
  setInterval(() => {
    let mtime = 0;
    try { mtime = fs.statSync(statePathOf()).mtimeMs; } catch (_) { return; }
    if (mtime === lastMtime) return;
    lastMtime = mtime;
    if (sendState()) {
      touchContext();
      console.log('[shell] 工作区数据已更新 → 通知右栏重渲染');
      if (process.env.AQARA_CAPTURE) {
        panelView.webContents.capturePage().then((img) => {
          fs.writeFileSync(path.join(process.env.AQARA_CAPTURE, 'capture-panel-state.png'), img.toPNG());
          console.log('[shell] 数据更新截图已保存');
        }).catch(() => {});
      }
    }
  }, 1200);
}

// ---------- 主题：读取 / 同步 dsh 设置（ui-theme.preference）----------
function dshSettingsPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'settings.yaml');
}
let currentTheme = 'dark';
function readTheme() {
  try {
    const txt = fs.readFileSync(dshSettingsPath(), 'utf8');
    const m = txt.match(/preference:\s*(dark|light)/i);
    return m ? m[1].toLowerCase() : 'dark';
  } catch (_) { return 'dark'; }
}
function startThemeSync() {
  currentTheme = readTheme();
  ipcMain.handle('aqara:get-theme', () => currentTheme);
  setInterval(() => {
    const t = readTheme();
    if (t !== currentTheme) {
      currentTheme = t;
      console.log('[shell] 主题已同步 →', t);
      if (panelView && !panelView.webContents.isDestroyed()) {
        panelView.webContents.send('aqara:theme', t);
      }
      if (splitterView && !splitterView.webContents.isDestroyed()) {
        splitterView.webContents.send('aqara:theme', t);
      }
    }
  }, 1500);
}

let dshProc = null;
let splash = null;
let win = null;
let dshView = null;
let panelView = null;
let splitterView = null;
let panelW = 0; // 右栏实际宽度（可拖拽调整，0 表示用默认比例）
let panelMode = 'normal'; // 预览区模式：normal(并排) / max(放大填充) / hidden(收起为窄条) / module(模块页占满主区)
let moduleSidebarW = 56; // 模块页模式下，dsh 侧栏宽度（运行时测量）
let tray = null;
let quitting = false;

// ---------- 启动画面 ----------
function createSplash() {
  splash = new BrowserWindow({
    width: 480, height: 320, frame: false, resizable: false, movable: true,
    show: true, center: true, alwaysOnTop: true, skipTaskbar: true, roundedCorners: true,
    backgroundColor: '#0b0b0b', icon: ICON_PNG,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(SPLASH_HTML);
  splash.on('closed', () => { splash = null; });
  console.log('[shell] 启动画面已显示');
}

function setSplashStatus(text) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents
      .executeJavaScript(`(()=>{const e=document.getElementById('status');if(e)e.textContent=${JSON.stringify(text)};})()`)
      .catch(() => {});
  }
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
}

// ---------- 品牌注入 ----------
function injectBranding(wc) {
  try {
    const script = fs.readFileSync(BRAND_SCRIPT, 'utf8');
    const logo = 'data:image/png;base64,' + fs.readFileSync(WORDMARK_PNG).toString('base64');
    const mark = 'data:image/png;base64,' + fs.readFileSync(MARK_PNG).toString('base64');
    const code = script
      .replaceAll('__LOGO_DATA_URL__', logo)
      .replaceAll('__MARK_DATA_URL__', mark);
    const run = () => {
      wc.executeJavaScript(code)
        .then(() => console.log('[shell] 品牌注入已应用'))
        .catch((e) => console.error('[shell] 品牌注入失败:', e && e.message));
    };
    wc.on('did-finish-load', run);
    run();
    console.log('[shell] 品牌注入已就绪');
  } catch (e) {
    console.error('[shell] 品牌注入脚本读取失败:', e && e.message);
  }
}

// ---------- 启动 dsh 子进程 ----------
function startDsh() {
  return new Promise((resolve, reject) => {
    const args = ['--import', 'tsx/esm', 'apps/cli/src/bin.ts'];
    if (fs.existsSync(PERSONA_YML)) args.push('--patch', PERSONA_YML);
    args.push('--profile', 'web', '--host', HOST, '--port', '0');

    dshProc = spawn(REAL_NODE, args, {
      cwd: DSH_REPO,
      env: { ...process.env, npm_config_registry: npmRegistry },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let acc = '';
    const timer = setTimeout(
      () => reject(new Error(`dsh 启动超时（${STARTUP_TIMEOUT_MS / 1000}s）`)),
      STARTUP_TIMEOUT_MS,
    );

    const onOut = (chunk) => {
      const s = chunk.toString();
      acc += s;
      process.stdout.write('[dsh] ' + s);
      const m = acc.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        setSplashStatus('正在打开工作台…');
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    };
    dshProc.stdout.on('data', onOut);
    dshProc.stderr.on('data', (c) => process.stderr.write('[dsh] ' + c.toString()));

    dshProc.on('error', (e) => { clearTimeout(timer); reject(e); });
    dshProc.on('exit', (code, signal) => {
      if (quitting) return;
      if (code !== 0 && code !== null) {
        dialog.showErrorBox('dsh 进程退出',
          `DeepSeek Harness 进程意外退出（code=${code}, signal=${signal}）。`);
      }
    });
  });
}

function stopDsh() {
  if (!dshProc || dshProc.killed || dshProc.pid === undefined) return;
  try { process.kill(-dshProc.pid, 'SIGTERM'); }
  catch (_) { try { dshProc.kill('SIGTERM'); } catch (_) {} }
  dshProc = null;
}

// ---------- 双栏布局（中间带可拖拽分隔条；支持预览区放大/收起）----------
function layout() {
  if (!win || win.isDestroyed() || !dshView || !panelView || !splitterView) return;
  const [w, h] = win.getContentSize();
  const setVis = (v, b) => { try { v.setVisible(b); } catch (_) {} };

  // 放大填充：预览区独占整窗，左栏与分隔条隐藏
  if (panelMode === 'max') {
    setVis(dshView, false); setVis(splitterView, false); setVis(panelView, true);
    panelView.setBounds({ x: 0, y: 0, width: w, height: h });
    return;
  }
  // 模块页：保留 dsh 左栏，模块占满主区（覆盖对话区）
  if (panelMode === 'module') {
    setVis(dshView, true); setVis(splitterView, false); setVis(panelView, true);
    const x = Math.max(0, Math.min(moduleSidebarW, w - 420));
    dshView.setBounds({ x: 0, y: 0, width: w, height: h });
    panelView.setBounds({ x, y: 0, width: w - x, height: h });
    return;
  }
  setVis(dshView, true); setVis(panelView, true);

  if (!panelW) panelW = Math.round(w * PANEL_RATIO);
  panelW = Math.max(PANEL_MIN, Math.min(w - 560, panelW));

  // 收起：左栏占满，仅保留右缘一条窄条（窄条内提供「展开」）
  if (panelMode === 'hidden') {
    setVis(splitterView, false);
    const dshW = Math.max(360, w - RAIL_W);
    dshView.setBounds({ x: 0, y: 0, width: dshW, height: h });
    panelView.setBounds({ x: dshW, y: 0, width: RAIL_W, height: h });
    return;
  }

  // 并排（默认）
  setVis(splitterView, true);
  const dshW = Math.max(360, w - panelW - SPLIT_W);
  dshView.setBounds({ x: 0, y: 0, width: dshW, height: h });
  splitterView.setBounds({ x: dshW, y: 0, width: SPLIT_W, height: h });
  panelView.setBounds({ x: dshW + SPLIT_W, y: 0, width: w - dshW - SPLIT_W, height: h });
}

// 读取 dsh 侧栏实际宽度（模块页要对齐到侧栏右侧）
async function measureSidebar() {
  if (!dshView || dshView.webContents.isDestroyed()) return;
  try {
    const w = await dshView.webContents.executeJavaScript(
      "(()=>{const e=document.querySelector('[class*=\"sidebarCol\"]');return e?Math.round(e.getBoundingClientRect().width):0;})()",
    );
    if (w && Math.abs(w - moduleSidebarW) > 1) {
      moduleSidebarW = w;
      if (panelMode === 'module') layout();
    }
  } catch (_) {}
}

// 切换预览区模式（normal / max / hidden / module），并通知右栏更新图标与布局
let moduleTimer = null;
function setPanelMode(m) {
  if (['normal', 'max', 'hidden', 'module'].indexOf(m) < 0) return;
  panelMode = m;
  layout();
  if (panelView && !panelView.webContents.isDestroyed()) {
    panelView.webContents.send('aqara:panel-mode', panelMode);
  }
  if (m === 'module') {
    measureSidebar();
    if (!moduleTimer) moduleTimer = setInterval(measureSidebar, 800);
  } else if (moduleTimer) {
    clearInterval(moduleTimer); moduleTimer = null;
  }
  console.log('[shell] 预览区模式 →', panelMode);
}

// ---------- 拖拽分隔条：主进程按光标位置实时重排 ----------
let splitTimer = null;
function startSplit() {
  if (panelMode !== 'normal') setPanelMode('normal'); // 从收起/放大状态拖动即恢复并排
  if (splitTimer || !win || win.isDestroyed()) return;
  splitTimer = setInterval(() => {
    try {
      const pt = screen.getCursorScreenPoint();
      const cb = win.getContentBounds();
      const relX = pt.x - cb.x;
      panelW = Math.max(PANEL_MIN, Math.min(cb.width - 560, cb.width - relX - SPLIT_W));
      layout();
    } catch (_) {}
  }, 16);
}
function endSplit() {
  if (splitTimer) { clearInterval(splitTimer); splitTimer = null; }
  console.log('[shell] 分栏宽度已调整 → 右栏', panelW, 'px');
}

// ---------- 主窗口 ----------
async function createWindow(url) {
  win = new BrowserWindow({
    width: 1600, height: 950, minWidth: 1120, minHeight: 700,
    title: WINDOW_TITLE, backgroundColor: '#0b0b0b', icon: ICON_PNG,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL('about:blank'); // 底层 webContents（被两个视图覆盖）

  const wp = { contextIsolation: true, nodeIntegration: false, sandbox: true };
  dshView = new WebContentsView({ webPreferences: { ...wp, preload: DSH_PRELOAD } });
  splitterView = new WebContentsView({ webPreferences: { ...wp, preload: SPLITTER_PRELOAD } });
  panelView = new WebContentsView({ webPreferences: { ...wp, preload: PANEL_PRELOAD } });
  win.contentView.addChildView(dshView);
  win.contentView.addChildView(splitterView);
  win.contentView.addChildView(panelView);
  layout();

  splitterView.webContents.loadFile(SPLITTER_HTML);
  splitterView.webContents.on('did-finish-load', () => {
    if (!splitterView.webContents.isDestroyed()) splitterView.webContents.send('aqara:theme', currentTheme);
  });

  // 右栏：Aqara 空间工作台（3D 数字孪生）
  // 右栏：Aqara 空间工作台（多标签）
  panelView.webContents.loadFile(
    PANEL_HTML,
    process.env.AQARA_AUTOTEST_SEND ? { query: { autotest: '1' } } : undefined,
  );
  panelView.webContents.on('did-finish-load', () => {
    if (!panelView.webContents.isDestroyed()) {
      panelView.webContents.send('aqara:panel-mode', panelMode);
      panelView.webContents.send('aqara:theme', currentTheme);
    }
  });
  // 左栏：dsh 智能体 UI
  dshView.webContents.loadURL(url);

  dshView.webContents.on('did-finish-load', () => {
    if (quitting) return;
    closeSplash();
    if (!win.isVisible()) win.show();
    maybeCapture();
  });

  if (!process.env.AQARA_NO_BRAND)   injectBranding(dshView.webContents);

  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  console.log('[shell] 窗口已加载:', url);
}

// ---------- （可选）验收截图：AQARA_CAPTURE=<目录> ----------
async function maybeCapture() {
  const dir = process.env.AQARA_CAPTURE;
  if (!dir) return;
  try {
    await new Promise((r) => setTimeout(r, 4000));
    const targets = [['dsh', dshView], ['panel', panelView]];
    for (const [name, v] of targets) {
      if (!v || v.webContents.isDestroyed()) continue;
      const img = await v.webContents.capturePage();
      fs.writeFileSync(path.join(dir, `capture-${name}.png`), img.toPNG());
      console.log('[shell] 截图已保存:', name);
    }
  } catch (e) { console.error('[shell] 截图失败:', e && e.message); }
}

// ---------- 工作区 → 对话：把右栏指令注入左栏 dsh 对话框并提交 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let watching = false;

// 轮询 dsh 主按钮：运行中 aria=「停止生成」，空闲=「发送消息」
async function waitForCompletion() {
  if (!dshView || dshView.webContents.isDestroyed() || watching) return;
  watching = true;
  const getAria = "(() => { const p=[...document.querySelectorAll('button')].find(b=>/primary/i.test(String(b.className||''))); return p?(p.getAttribute('aria-label')||''):''; })()";
  const aria = () => dshView.webContents.executeJavaScript(getAria).catch(() => '');
  try {
    let sawBusy = false;
    for (let i = 0; i < 50; i++) {          // 先等进入运行中（≤15s）
      const a = await aria();
      if (a && a.indexOf('停止') >= 0) { sawBusy = true; break; }
      await sleep(300);
    }
    for (let i = 0; i < 600; i++) {         // 再等回到空闲（≤180s）
      const a = await aria();
      if (a && a.indexOf('发送') >= 0) break;
      await sleep(300);
    }
    console.log('[shell] Agent 执行完成（sawBusy=' + sawBusy + '）→ 通知右栏回填');
    if (panelView && !panelView.webContents.isDestroyed()) {
      panelView.webContents.send('aqara:action-done');
      if (process.env.AQARA_CAPTURE) {
        try {
          const img = await panelView.webContents.capturePage();
          fs.writeFileSync(path.join(process.env.AQARA_CAPTURE, 'capture-panel-done.png'), img.toPNG());
          console.log('[shell] 回填后截图已保存');
        } catch (_) {}
      }
    }
  } finally {
    watching = false;
  }
}

function wireAgentBridge() {
  ipcMain.on('aqara:send', (_e, text) => {
    const t = String(text || '').trim();
    // 任何向 Agent 自动发送的动作，先切回对话视图，避免用户不知道发生了什么
    if (panelMode !== 'normal') setPanelMode('normal');
    if (!t || !dshView || dshView.webContents.isDestroyed()) return;
    const code = `(() => {
      try {
        const TEXT = ${JSON.stringify(t)};
        const ta = document.querySelector('textarea');
        if (!ta) return 'no-textarea';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, TEXT);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        setTimeout(() => {
          const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('发送'));
          if (b && !b.disabled) b.click();
        }, 80);
        return 'ok';
      } catch (e) { return 'err:' + e.message; }
    })()`;
    dshView.webContents.executeJavaScript(code)
      .then((r) => {
        console.log('[shell] 指令已发送到 Agent:', t.slice(0, 40), '→', r);
        if (r === 'ok') waitForCompletion();
      })
      .catch((e) => console.error('[shell] 发送失败:', e && e.message));
  });
}

// ---------- 系统托盘 ----------
function createTray() {
  try {
    let img = nativeImage.createFromPath(TRAY_ICON);
    if (img.isEmpty()) {
      img = nativeImage.createFromPath(ICON_PNG).resize({ width: 18, height: 18 });
    } else {
      img.setTemplateImage(true);
    }
    tray = new Tray(img);
    tray.setToolTip('Aqara 空间智能');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => { if (win) { win.show(); win.focus(); } } },
      { type: 'separator' },
      { label: '生成空间方案', click: () => { if (win) win.show(); } },
      { label: '打开数字孪生', click: () => { if (win) win.show(); } },
      { label: '全屋巡检', click: () => { if (win) win.show(); } },
      { type: 'separator' },
      { label: '退出 Aqara 空间智能', click: () => { quitting = true; app.quit(); } },
    ]));
    console.log('[shell] 系统托盘已创建');
  } catch (e) {
    console.error('[shell] 托盘创建失败:', e && e.message);
  }
}

// ---------- 原生菜单 ----------
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) template.push({ role: 'appMenu' });
  template.push({
    label: '空间',
    submenu: [
      { label: '生成空间方案', accelerator: 'CmdOrCtrl+N', click: () => { if (win) win.show(); } },
      { label: '打开数字孪生', accelerator: 'CmdOrCtrl+T', click: () => { if (win) win.show(); } },
      { type: 'separator' },
      { label: '全屋巡检', click: () => { if (win) win.show(); } },
      { label: '智能建议', click: () => { if (win) win.show(); } },
    ],
  });
  template.push({ role: 'editMenu' });
  template.push({ role: 'viewMenu' });
  template.push({ role: 'windowMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- 应用生命周期 ----------
app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(ICON_PNG); } catch (_) {}
  }
  buildAppMenu();
  createTray();
  startThemeSync();
  startStateSync();
  migrateLegacyLibrary();
  installBundledSkills();
  wireAgentBridge();
  ipcMain.on('aqara:split-start', startSplit);
  ipcMain.on('aqara:split-end', endSplit);
  ipcMain.on('aqara:set-panel-mode', (_e, m) => setPanelMode(m));
  // 左栏注入的入口 → 进入「模块页」模式并打开对应标签
  ipcMain.on('aqara:open-panel-tab', (_e, tab) => {
    setPanelMode('module');
    if (panelView && !panelView.webContents.isDestroyed()) {
      panelView.webContents.send('aqara:activate-tab', String(tab || ''));
    }
  });
  createSplash();
  setSplashStatus('正在启动空间智能引擎…');

  try {
    const url = await startDsh();
    await createWindow(url);
  } catch (err) {
    closeSplash();
    dialog.showErrorBox('启动失败', String(err && err.message ? err.message : err));
    quitting = true;
    stopDsh();
    app.quit();
  }
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => stopDsh());
app.on('window-all-closed', () => { stopDsh(); app.quit(); });
process.on('exit', stopDsh);
process.on('SIGINT', () => { stopDsh(); process.exit(0); });
process.on('SIGTERM', () => { stopDsh(); process.exit(0); });
