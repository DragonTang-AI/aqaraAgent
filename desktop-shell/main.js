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

const { app, BrowserWindow, WebContentsView, dialog, shell, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const WORDMARK_PNG = path.join(__dirname, 'build', 'aqara-wordmark.png');
const MARK_PNG = path.join(__dirname, 'build', 'aqara-logo.png');
const PERSONA_YML = path.join(__dirname, 'branding', 'aqara-persona.yml');
const PANEL_HTML = path.join(__dirname, 'workspace', 'index.html');
const PANEL_PRELOAD = path.join(__dirname, 'workspace', 'preload.js');
const SPLITTER_HTML = path.join(__dirname, 'workspace', 'splitter.html');
const SPLITTER_PRELOAD = path.join(__dirname, 'workspace', 'splitter-preload.js');
// 多项目：每个项目 = projects/<name>/ 目录（= dsh 工作区），state.json 在项目目录内
const PROJECTS_ROOT = path.join(__dirname, 'projects');
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

  // 轮询当前项目 state.json 的 mtime（比 fs.watch 稳：Agent 的原子写/改名也能捕捉）
  let lastMtime = -1;
  try { lastMtime = fs.statSync(statePathOf()).mtimeMs; } catch (_) {}
  setInterval(() => {
    let mtime = 0;
    try { mtime = fs.statSync(statePathOf()).mtimeMs; } catch (_) { return; }
    if (mtime === lastMtime) return;
    lastMtime = mtime;
    if (sendState()) {
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
      // 左栏品牌配色随主题切换（白字标 ↔ 黑字标 / 图标反相）
      if (dshView && !dshView.webContents.isDestroyed()) {
        dshView.webContents
          .executeJavaScript('window.__aqaraApplyLogoTheme && window.__aqaraApplyLogoTheme()')
          .catch(() => {});
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
let panelMode = 'normal'; // 预览区模式：normal(并排) / max(放大填充) / hidden(收起为窄条)
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

// 切换预览区模式（normal / max / hidden），并通知右栏更新图标与布局
function setPanelMode(m) {
  if (['normal', 'max', 'hidden'].indexOf(m) < 0) return;
  panelMode = m;
  layout();
  if (panelView && !panelView.webContents.isDestroyed()) {
    panelView.webContents.send('aqara:panel-mode', panelMode);
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
  dshView = new WebContentsView({ webPreferences: wp });
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

  injectBranding(dshView.webContents);

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
  wireAgentBridge();
  ipcMain.on('aqara:split-start', startSplit);
  ipcMain.on('aqara:split-end', endSplit);
  ipcMain.on('aqara:set-panel-mode', (_e, m) => setPanelMode(m));
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
