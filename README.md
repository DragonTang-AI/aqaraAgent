# Aqara 空间智能桌面端 · PoC 运行说明

> 目标：先把 DeepSeek Harness（dsh）桌面端的「能跑 → 能看 → 能配模型」这条链路跑通。
> 底座：本地源码 `deepseek-harness/`（v0.1.0-rc.5）。

---

## 一、当前状态（已跑通）

| 项 | 状态 |
|----|------|
| dsh 源码 | ✅ 已构建（`apps/cli/lib` 有产物） |
| pnpm | ✅ 已装（v11.7.0，装到 `~/.npm-global`） |
| dsh Web UI | ✅ **已启动**，`http://127.0.0.1:3080`（HTTP 200） |
| 界面渲染 | ✅ 正常（见 `dsh-web-ui.jpeg`） |
| 模型配置 | ✅ `deepseek-official` / `deepseek-v4-flash` / `reasoningEffort: high` |

---

## 二、启动方式

### 一键脚本（推荐）

```sh
sh "/Users/admin/Documents/Loomy Workspace/Aqara空间智能桌面端-PoC/run-dsh-web.sh" 3080
```

然后浏览器打开 <http://127.0.0.1:3080>。

### 手动命令

```sh
export PATH="/usr/local/bin:$HOME/.npm-global/bin:$PATH"
export npm_config_registry="https://registry.npmmirror.com"
cd "/Users/admin/Documents/Loomy Workspace/deepseek-harness"
node --import tsx/esm apps/cli/src/bin.ts web --host 127.0.0.1 --port 3080
```

---

## 三、踩过的两个坑（重要）

### 坑 1：Node 内核 —— 必须用「真 Node」

Loomy 环境里 `PATH` 上的 `node` 其实是 **Electron 内嵌 Node**
（`process.versions.electron` 有值，如 40.x）。用它加载 dsh 的原生模块会报：

```
dlopen(.../koffi.node): code signature ... different Team IDs
ERR_DLOPEN_FAILED
```

→ **修复**：改用标准 Node.js `/usr/local/bin/node`（v24.14.0，非 Electron）。

> 排查方法：`node -e "console.log(process.versions.electron || 'real node')"`

### 坑 2：运行模式 —— 用「源码模式」而非 lib 产物

- `node apps/cli/lib/bin.js web` → ❌ 插件解析失败（`Cannot find package '@deepseek-ai/cordis-plugin-timer'`）
- `node --import tsx/esm apps/cli/src/bin.ts web` → ✅ 正常

→ **修复**：统一用 `tsx` 跑 `apps/cli/src/bin.ts`（等价于官方 `pnpm dsh web`）。

---

## 四、目录与文件

```
Aqara空间智能桌面端-PoC/
├── README.md            # 本文档
├── run-dsh-web.sh       # 一键启动脚本
└── dsh-web-ui.jpeg      # 界面验证截图
```

相关：
- dsh 源码：`deepseek-harness/`
- 品牌 bundle 骨架：`deepseek-harness/packages/experimental/aqara-desktop/`

---

## 五、下一步

1. **配置模型 / 测试对话**：在界面里新开会话、选工作区、发消息验证。
   - 模型配置在 `~/.dsh/settings.yaml` 的 `agent-default-model`。
   - 换模型 / 填 key：界面左下角「设置」。
2. **做桌面端外壳**：Electron 壳 + 加载 `http://127.0.0.1:<port>`（详见 `deepseek-harness/packages/experimental/aqara-desktop/docs/desktop-shell.md`）。
