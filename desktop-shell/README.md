# Aqara 空间智能 · 桌面端外壳（Electron）

> 基于 DeepSeek Harness（dsh）的**空间智能桌面端**：左侧品牌化智能体对话，右侧「Aqara 空间工作台」（3D 户型数字孪生）。
> 含品牌启动画面、应用图标、系统托盘与原生菜单。

---

## 它是怎么工作的

```
Electron 主进程 (main.js)
   │
   ├─ 0. 显示「启动画面」(splash.html)：黑底 + 立方体图标 + 加载动画
   │
   ├─ 1. spawn 真 Node 启动 dsh：
   │      /usr/local/bin/node --import tsx/esm apps/cli/src/bin.ts web --host 127.0.0.1 --port 0
   │      （--port 0 → 系统分配随机端口）
   │
   ├─ 2. 从 dsh stdout 解析实际地址： "dsh web: http://127.0.0.1:<port>"
   │
   ├─ 3. 后台创建 BrowserWindow（show:false）并 loadURL(该地址)
   │
   ├─ 4. 主窗口 ready-to-show → 关闭启动画面，显示主窗口
   │
   └─ 5. 应用退出 → 杀掉 dsh 进程组（detached + kill(-pid)）
```

窗口安全配置：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`。

---

## 界面构成

```
┌───────────────────────────────┬───────────────────────┐
│  左栏：dsh 智能体对话          │  右栏：多标签工作区     │
│  （品牌注入：Aqara logo /      │  · 数字孪生(3D)         │
│    标题 / 欢迎语；persona=Aqara）│  · 设备 / 场景 / 文件    │
│                               │  · 看板 / 浏览器 / 子任务 │
└───────────────────────────────┴───────────────────────┘
   两栏均为独立 WebContentsView；窗口尺寸变化时按比例重排
```

- **右栏「空间工作台」**（`workspace/index.html`）：**多标签工作区**（对标 ArkWork 右栏）——标签可切换 / 新建 / 关闭，含 **7 类**：数字孪生 / 设备 / 场景 / 文件 / 看板 / 浏览器 / 子任务。
- **3D 数字孪生（真实 GLB 场景 · 多模式）**：加载设计师真实户型 GLB（`workspace/models/home.glb`「长庭亲子之家」13×10m 精装）替换程序化场景；**3D 俯瞰 / 平面图 / 漫游** 三模式；**顶吊/半墙**、**点房间进入漫游**、**房间参数面板**（层高/光照 slider）、**家具/线框**、**昼夜**、点击设备开关；自动隐藏天花露出室内。GLB 经主进程 IPC 读取（`loadModel`），离线自包含。
- **主题跟随**：面板经 preload IPC 读取 dsh 的 `ui-theme.preference`，**实时跟随** dsh 深浅主题（CSS + 3D 视口配色一起变）。
- **工作区 ↔ 对话（已打通）**：右栏带 `data-send` 的元素（动作按钮 / 设备行 / 场景 chip / 文件行）点击后 → preload `aqara.send(text)` → 主进程 `ipcMain.on('aqara:send')` → 注入左栏 dsh 对话框（设置 `<textarea>` 值 + 触发 `input` + 点「发送消息」）→ 交给 Agent 执行。
- **动作回填**：点击后元素标记「执行中」（脉冲）；主进程轮询 dsh 主按钮（运行中 `aria=停止生成`，回空闲 `aria=发送消息`），完成即发 `aqara:action-done`，右栏把该动作标记「完成」（`is-done` 描边 + toast「✓ 执行完成」）。
- **数据驱动**：右栏完全由「项目目录」下的 `state.json` 渲染（户型/设备/场景/自动化/文件/看板/任务）；主进程**轮询**其 mtime（比 fs.watch 稳，能捕捉 Agent 的原子写/改名），变化即推给面板**重渲染**。
- **项目目录 = 工作区**：`projects/<项目>/state.json` 放在 dsh 的工作区内——因为 Agent 的沙箱是「Workspace Write」（只能写工作区内文件）。
- **Agent 产出回填（已打通）**：persona 告知 Agent 项目目录与 schema，Agent 直接读写 `state.json` → 轮询检测到变化 → 右栏**实时刷新**（"说一句 → Agent 产出 → 界面变化"的完整闭环）。
- **上下文打通**：右栏顶部有「上下文条」（📍 项目 · 选中项）；点击设备/场景/文件/动作时记录选中并高亮，发送给 Agent 的消息自动带前缀 `【工作区上下文】项目：…；当前选中：…`，Agent 不再"盲发"。
- **多项目**：顶部 ▦ 按钮可切换 / 新建项目；每个项目 = `projects/<name>/`（含 state.json）。切换时**右栏数据 + dsh 工作区一起切**（Agent 的 cwd 跟着切，保证能读写该项目）。
- **系统托盘**：立方体模板图标；右键菜单含「生成空间方案 / 打开数字孪生 / 全屋巡检」等垂直入口。
- **原生菜单**：macOS 菜单栏的「空间」菜单（同上入口，快捷键 ⌘N / ⌘T）。

### 运行流程图（更新）

```
Electron 主进程 (main.js)
   ├─ 0. 显示「启动画面」(splash.html：Aqara 字标 + 加载动画)
   ├─ 1. 建托盘 + 原生菜单
   ├─ 2. spawn 真 Node 启动 dsh：
   │      … bin.ts --patch branding/aqara-persona.yml --profile web --host 127.0.0.1 --port 0
   ├─ 3. 解析实际地址 "dsh web: http://127.0.0.1:<port>"
   ├─ 4. 建双栏窗口：左 dshView(dsh UI) + 右 panelView(workspace/index.html)
   ├─ 5. 左栏加载完成 → 关启动画面、显示窗口、注入品牌
   └─ 6. 退出 → 杀掉 dsh 进程组
```

---

## 运行

```sh
cd "/Users/admin/Documents/Loomy Workspace/Aqara空间智能桌面端-PoC/desktop-shell"
npm start
```

启动流程：**启动画面（约 20–40s，等 dsh 起来）→ 主窗口**。

---

## 品牌资产

| 资产 | 文件 | 说明 |
|------|------|------|
| **品牌 Logo（官方）** | `build/aqara-logo.png` | Aqara 官方字标图标 1024×1024（824 圆角方居中 + 白字标，透明四角，符合 macOS 规范） |
| App 图标 PNG | `build/icon.png` | = 官方 logo，dev 模式用于 Dock（`app.dock.setIcon`）与窗口 |
| App 图标 ICNS | `build/icon.icns` | macOS 打包用（`iconutil` 生成） |
| 启动画面字标 | `build/aqara-wordmark.png` | 从 logo 裁出的透明底白字标（746×267） |
| 启动画面 | `splash.html` | 黑底 + Aqara 字标 + 「空间智能」+ 加载指示 |
| 占位图标（旧） | `build/icon.svg` | 早期自制「立方体」图标，仅作参考 |

> 换图标：把设计师给的 1024×1024 图标覆盖 `build/icon.png` → 重跑 `sips`+`iconutil` 出 icns（见下方命令）。
> 交付规格见 `docs/ICON-SPEC.md`。

---

## 品牌定制（把 dsh 的 DeepSeek 品牌换成 Aqara）

dsh Web UI 里的品牌（左上 logo、标题、欢迎语、系统提示）**硬编码在它的 bundle 里**，没有现成配置项。
本项目在**壳层做品牌覆盖**，不改 dsh 源码，保持「薄壳」：

| 覆盖项 | 机制 | 文件 |
|--------|------|------|
| 左上角 logo（DeepSeek 鲸鱼 wordmark → Aqara 字标） | 注入：替换 brand 按钮内的 `<svg>` | `branding/aqara-brand.js` |
| 窗口/页面标题（DeepSeek Harness → Aqara 空间智能） | 注入：替换 `document.title` | 同上 |
| 欢迎页标题（探索未至之境 → 让空间自己思考）+ 徽标（预览版 → 内测版） | 注入：替换文本 | 同上 |
| hero 前的 DeepSeek 鲸鱼图标 | 注入：隐藏 `[class*="fishHitbox"]` | 同上 |
| 系统提示 / 开场白（"我是 DeepSeek Harness 的编码助手" → Aqara 助手） | dsh `--patch` 覆盖 `system-prompt.persona` | `branding/aqara-persona.yml` |

工作原理：主进程 `main.js` 在窗口加载后，用 `webContents.executeJavaScript` 注入 `aqara-brand.js`
（字标以 base64 内嵌，无需外部资源）；注入脚本自带 `MutationObserver`，适配 SPA 重渲染。
dsh 启动参数为 `--patch branding/aqara-persona.yml --profile web`。

> ⚠️ 这是「壳层覆盖」：若 dsh 前端结构大改（类名/文案），需同步更新 `aqara-brand.js`。
> 更彻底的方案是在 dsh 仓库内做「品牌 bundle」（如 ArkWork 的 `dsh-experimental-brand-lovspark`），属后续演进。
> 效果图见 `build/preview-brand-final.png`。

---

## 关键约束（务必遵守）

| 约束 | 原因 |
|------|------|
| 用**真 Node**（`/usr/local/bin/node`）跑 dsh | Loomy 的 node 是 Electron 内核，加载原生模块（`koffi.node`）会因 macOS 签名 Team ID 不一致而 `dlopen` 失败 |
| 用 dsh **源码模式**（tsx + `apps/cli/src/bin.ts`） | `lib` 构建产物模式插件解析会失败 |
| dsh 用 `--port 0` | 避免端口冲突，实际端口从 stdout 解析 |

---

## 可配置项（环境变量）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AQARA_DSH_REPO` | `../../deepseek-harness` | dsh 源码位置 |
| `AQARA_NODE` | `/usr/local/bin/node` | 真 Node 路径 |
| `AQARA_NPM_REGISTRY` | `https://registry.npmmirror.com` | 传给 dsh 子进程的 npm 源 |

---

## 文件

```
desktop-shell/
├── package.json         # electron 依赖 + npm start
├── main.js              # 主进程：启动画面 + dsh 子进程 + 主窗口 + 品牌注入 + 生命周期
├── splash.html          # 品牌启动画面
├── workspace/           # 右栏「多标签工作区」
│   ├── index.html       # 标签管理 + 3D 数字孪生 + 各标签内容 + 主题适配
│   ├── preload.js       # 重要：getTheme/onTheme/send/onActionDone/getState/onState 桥
│   └── lib/three.min.js
├── projects/            # 项目目录（= dsh 工作区，Agent 可读写）
│   └── 示例户型/
│       └── state.json   # 工作区唯一数据源
├── branding/
│   ├── aqara-brand.js   # 品牌注入脚本（logo/标题/欢迎语/隐藏鲸鱼图标）
│   └── aqara-persona.yml# persona 覆盖层（dsh --patch）
├── build/
│   ├── aqara-logo.png   # Aqara 官方字标图标（1024）
│   ├── aqara-wordmark.png # 透明底字标（启动画面/注入用）
│   ├── icon.png         # App 图标（=官方 logo）
│   ├── icon.icns        # macOS 打包图标
│   ├── icon.iconset/    # icns 中间产物
│   ├── icon.svg         # 早期自制图标（参考）
│   ├── trayTemplate*.png # 系统托盘图标（macOS 模板图）
│   └── preview-*.png    # 预览图（启动画面 / 品牌化 / 双栏效果）
├── docs/
│   └── ICON-SPEC.md     # 给设计师的图标交付规格
├── .gitignore
└── README.md
```

---

## 已验证

- ✅ 启动画面正常显示（日志 `[shell] 启动画面已显示`）
- ✅ 系统托盘 + 原生菜单创建成功（`[shell] 系统托盘已创建`）
- ✅ dsh 子进程随机端口启动（`dsh web: http://127.0.0.1:…`）
- ✅ 双栏窗口加载成功（左 dsh / 右空间工作台），Dock 图标为 Aqara 字标
- ✅ 品牌注入生效（`[shell] 品牌注入已应用`）：左上 logo、标题、欢迎语已换为 Aqara
- ✅ 右栏**多标签工作区**（7 标签，可切换 / 新建 / 关闭；见 `build/preview-ws-*.png`）
- ✅ **3D 数字孪生升级**：实体材质 + 家具 + 光照阴影；3D / 平面图 / 漫游三模式 + 昼夜 + 设备开关（见 `build/preview-3d-view.png` / `preview-mode-plan.png` / `preview-mode-walk2.png`）
- ✅ **顶吊/半墙切换**、**点房间进入漫游**（点 3D 里的房间地板 → 选中该房间并进入漫游）、**房间参数面板**（面积/尺寸/层高/光照）实测通过（见 `build/preview-3d-v6.png` / `preview-3d-enter-room.png`）
- ✅ **真实 GLB 场景接入**：加载设计师「长庭亲子之家」户型 GLB（13×10m 精装），3D / 平面图 / 漫游三模式均正常渲染（见 `build/preview-glb-*.png`）
- ✅ **主题跟随 dsh**：深/浅两版实测通过；实时切换同步（日志 `[shell] 主题已同步 → …`）
- ✅ **工作区 ↔ 对话打通**：自检指令注入成功（日志 `[shell] 指令已发送到 Agent: … → ok`），并在 dsh 侧生成新会话（"自检确认回复"）
- ✅ **动作回填**：点击动作 → Agent 执行 → 完成自动回填（日志 `[shell] Agent 执行完成（sawBusy=true）`；见 `build/preview-backfill.png`）
- ✅ **数据驱动 + 实时更新**：运行中修改 `state.json` → 右栏自动重渲染（日志 `[shell] 工作区数据已更新 → 通知右栏重渲染`）
- ✅ **Agent 产出回填闭环（实测）**：Agent 在项目目录（=工作区）读写 `state.json` 新增设备 → 轮询捕捉 → 右栏实时刷新（日志 `工作区数据已更新`；见 `build/preview-agent-write.png`）
- ✅ **上下文打通（实测）**：点击设备/场景即记录选中，发送消息自动带 `【工作区上下文】项目…；当前选中…`（示例见 `build/preview-context.png`）
- ✅ **多项目切换（实测）**：切换项目 → 右栏数据 + dsh 工作区同步切换（日志 `切换项目 → …` / `dsh 工作区切换: … → switched`；见 `build/preview-multi-project.png`）
- ✅ persona 覆盖生效（`--patch` dump-config 校验通过）
- ✅ 应用退出时清理 dsh 子进程

## 下一步（TODO）

- [ ] 打包成 `.app` / `.dmg`（electron-builder，使用 `build/icon.icns`）
- [ ] 启动画面的进度反馈（把 dsh 启动阶段回传到 splash）
- [ ] 工作区里各标签接真实数据（Studio 运行时 / 户型 / 设备）
- [ ] 品牌从「壳层注入」演进为 dsh 仓库内的「品牌 bundle」（更彻底、随上游升级）
