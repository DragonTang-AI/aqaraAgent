# 桌面端 Harness 工具函数清单（供 Web Builder 迁移适配）

- Harness：dsh `0.1.0-rc.5`
- 源码：`/Users/admin/Documents/Loomy Workspace/deepseek-harness`
- 桌面仓库：`/Users/admin/Documents/Loomy Workspace/Aqara空间智能桌面端-PoC`
- 取数方式：从各 `packages/**/tool-*/src` 的 `ctx.tools.register(defineTool({ name: '…' }))` 提取

## 一、标准预设当前装配的工具（function call 名）

| 包 | 函数名 | 说明 |
|---|---|---|
| tool-bash / tool-bash-persistent | `bash` | 执行 shell（沙箱：Workspace Write，限制在项目目录） |
| tool-pwsh | `pwsh` | Windows 下替代 bash |
| tool-fs | `read` `write` `edit` `read_image` `str_replace_editor` | 文件读写/编辑；图片读取 |
| tool-fs-search | `glob` `grep` | 文件查找 / 内容检索 |
| tool-jobs | `job_list` `job_output` `job_kill` | 长任务管理 |
| tool-skill | `skill` | 加载/调用技能（name 参数） |
| tool-goal | `create_goal` `get_goal` `update_goal` | 目标管理 |
| tool-subagent | `send_message` `interrupt_agent` `report` `list_agents` | 子 Agent（多 Agent 能力） |
| tool-workflow | `workflow` | 工作流 |
| tool-ralph | `ralph` | Ralph 循环 |
| tool-ask-user | `ask_user_question` | 向用户提问 |
| tool-todo | `todo_write` | 待办 |
| tool-web | `web_search` `web_fetch` | 联网检索/抓取 |

## 二、可装配但当前未默认挂载的工具包

| 包 | 函数名 |
|---|---|
| terminal | `terminal_open` `terminal_send` `terminal_read` `terminal_list` `terminal_signal` `terminal_close` |
| lsp | `lsp` |
| schedule | `schedule_create` `schedule_list` `schedule_delete` |
| session-query | `session_search` `session_trace` `session_event_read` `session_event_search` `session_event_trace` |
| extensions (cordis) | `cordis_run` `cordis_define` `cordis_undefine` `cordis_stop` `cordis_inspect_list` `cordis_inspect_query` `cordis_inspect_self` |

## 三、MCP 工具

- 命名规则：`mcp__<serverName>__<toolName>`
- 当前已接入：`blender` →
  - `mcp__blender__blender_status`
  - `mcp__blender__blender_scene`
  - `mcp__blender__blender_execute`

## 四、Skill 加载

- 扫描目录（热更新）：`~/.dsh/skills`、`<项目>/.dsh/skills`、`<项目>/.agents/skills`、`~/.agents/skills`
- 格式：`SKILL.md`，frontmatter 需 `name`（kebab-case）+ `description`；可带 `whenToUse`、`references/`、`scripts/`、`assets/`
- 桌面端内置技能：`desktop-shell/skills/*`（启动时安装到 `~/.dsh/skills`，不覆盖已有）

## 五、数据落点（Agent 写文件即驱动 UI）

- 项目目录：`desktop-shell/projects/<项目名>/`（= dsh 工作区/cwd）
- `state.json` 字段：`project / rooms / devices / scenes / automations / files / board / tasks`
- 项目上下文：`projects/<项目>/.aqara-context.md`（自动生成，Agent 可直接读）
- 资料库：`projects/<项目>/library/`；生成物：`projects/<项目>/library/generated/`
- 审计日志：`projects/<项目>/audit.log`

## 六、桌面端 IPC（切页 / 触发，供适配层调用）

- `aqara:send(text)` —— 向 Agent 发消息（会自动切回对话视图）
- `aqara:open-panel-tab(type)` —— 打开并进入对应模块页（twin / partners / library / devices / files ...）
- `aqara:adapter-call(method, params)` —— 调用 Aqara 适配层（listSpaces / listDevices / listScenes / controlDevice / executeScene）
- `aqara:get-context()` —— 读取项目上下文
- `aqara:list-skills` / `aqara:create-skill` / `aqara:import-skill`
- `aqara:list-connectors` / `aqara:add-connector` / `aqara:toggle-connector`

> 注：函数名由各包 `defineTool({ name })` 决定，随预设装配变化；以运行时装配为准。若需在运行时导出，可在 `packages/*/tool-*/src` 检索 `defineTool({ name:`。
