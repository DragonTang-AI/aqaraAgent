---
name: builder-standard-scene
whenToUse: "当用户需要标准场景（回家/会客/备餐/早安等）或按标准场景输出时。"
description: >-
  标准场景简化版（按图谱实际 Room/Zone）：动态空间 → 点名 → 精确召回设备 → json.standard_scene。
  触发：标准场景 / 按标准场景输出 / 按标准场景选空间… / catalog 场景名（回家会客备餐早安等）。
  只做基础灯控场景（开关/亮度/色温/窗帘），不做复杂服务商模板与照明库特效。
compatibility: 需已读取本方案户型（spatial_graph）。
metadata:
  version: "1.2.24"
  aqara_builder: "2.0"
---

# Builder Standard Scene（销售简化版）

## 何时用

用户要**标准场景**（含「按标准场景输出」「按标准场景选空间…」；兼容旧「选类」；或点名某一场景）。  
不要走 `builder-automation-generate` 普通 GEN。

## 原则

- **按空间召回该空间全部相关设备**（灯/帘/影音），不只「要用的那几盏」。  
  - 全开/全关/冷暖/亮度：空间内灯统一态。  
  - 氛围类（观影/晚安/起夜）：焦点灯开/调，同空间其余灯关（观影还关其它空间灯）。  
  - 离开/离家：灯+帘+影音尽量全覆盖。  
- 场景库另有：浪漫晚餐、品鉴、冥想、Party欢聚、回房/回屋、沐浴、洗漱、如厕、客厅阅读。没有对应房间或没有灯 → `UNMET`，建议补设备，禁止硬编。自适应照明、灯随人动、水浸报警先不做。
- **软互斥**：catalog `mutex_group` 声明「有我没他」；写进 `logic_for_user` / `metadata.description`。  
  Studio `create_scene` 当前文档与样例**未见**原生互斥字段——**禁止臆造**会炸 Studio 的 exclusive* 字段；中台日后若补字段再接硬互斥。
- 只做基础场景（开灯/关灯/亮度/冷暖光/关帘等）。
- 产物必须 Studio 可运行：endpoint 有能力快照跟快照，否则默认 **2**；窗帘 `TargetPositionPercentage`；**省略** `linkFrom`（禁止 `linkFrom: []`）；`ColorTemperature` 用开尔文 K；值用 bool/number。
- **聊天正文不能代替** `json.standard_scene`。`OK`/`DEGRADED` 后同回合必须 `artifact_tool`；效果说明可与 artifact 同发，禁止只贴 `logic_for_user`/「已生成」就停。artifact 成功后立刻 0 字、0 工具。

## 语种

只看用户自己打的自由输入。一种语言全场统一：有汉字 → 全文中文；英文自由输入 → 全文英文。禁止中英并排，禁止中文回合出现 `More` / `Pick a space` / `I'll check`。芯片 `send`、工具回包不改变语种。英文会话里工具失败后仍英文，并继续跑 `match_and_build_scene.py`。互斥说明里的其他场景不算已交付。`send` 仍照抄脚本。英文会话把中文 `logic_for_user` 改写成英文。英文常用：全屋 Whole home，更多 More，回家 Arriving home，离家 Leaving，会客 Guests，观影 Movie，灯光全开 All on，灯光全关 All off，冷光 Cool，暖光 Warm，早安 Good morning，晚安 Good night，起夜 Night light，阅读 Reading，白天 Day，晚上 Night，浪漫晚餐 Romantic dinner，品鉴 Tasting，冥想 Meditation，Party欢聚 Party，回房 Back to the room，沐浴 Bath，洗漱 Wash up，如厕 Restroom。房间：客厅 Living room，卧室 Bedroom，卫生间 Bathroom，庭院 Courtyard，玄关 Entry。中文会话芯片用「更多」，场景 JSON 的中文 `name` 不要改；英文会话交脚本英文 `name`。

## 两级引导（空间必须来自本方案图谱）

有图谱后，**禁止**一次甩出全部场景。同一回合只发 **1 次** `json.question`（每页最多 4 枚芯片）。

### A. 未点名（只说标准场景）

先运行脚本 `op=list_spaces`，传本方案完整 `spatial_graph`、`page`、`page_size=3`。  
chips **只能**来自返回的 `spaces`，禁止写死玄关/客厅/餐厅，禁止凭 catalog 补图谱不存在的空间：
- Room 与 Zone 都可出现；Zone 用父路径消歧，如「康养区 / 阅读区」。
- 只显示至少有可控灯的空间；空 Zone 不显示。
- 每页最多 3 个真实空间；`has_more=true` 才加第 4 枚「更多」。
- 「全屋」是脚本生成的唯一虚拟空间，稳定放在最后。
- 中文回合 `label=display_name`。英文回合 `label` 用英文（见上表），`send` 必须照抄脚本返回，不能自己缩短路径。

中文正文和 title：「先选一个空间。」英文正文和 title：`Pick a space.`

### B. 已选空间（`按标准场景选空间…`）

运行脚本 `op=list_scenes`，把上一张空间项的 `node_id` 作为 `target_node_id`；若只有用户 send，则把完整路径作为 `target_selector`。禁止只凭「阅读区」猜父房间。

正文列出返回的场景名，再出芯片：  
- 中文 `label` 照抄脚本。英文回合 `label` 用英文名。`send` 必须照抄脚本返回（禁止编造，禁止改成英文）。
- 本页 ≤3 个场景；有下一页则第 4 枚。中文「更多」，英文 `More`。  
- 未知功能区仅提供「灯光全开 / 灯光全关」；阅读区仅提供「阅读 / 离开」。
- send 带完整空间路径，例如 `按标准场景输出康养区 / 阅读区·阅读`，防止同名 Zone 串房。

中文 title：`要做哪个？` 英文 title：`Which scene?`

### C. 已点名

不要再问。立刻匹配交付。

## builder-ontology-mcp 观察旁路

正常用户生成标准场景时 **0 次调用**，不得在 matcher 前同步等待。观察采样应由中台在 Agent 外异步执行；只有研发明确要求诊断召回、且本轮不交付场景时才可单独调用。  
Ontology 结果不得改变设备选择、动作、状态、文案或 artifact，也不是 endpoint / trait 能力真值。禁止落卡后补调观察工具。

## 匹配交付

```bash
python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-standard-scene/scripts/match_and_build_scene.py' 2>/dev/null | head -1)" - <<'EOF'
{"op":"build","scene":"<完整send>","target_node_id":"<上一张返回的精确 Room/Zone id>","spatial_graph":{...},"lang":"en"}
EOF
```

英文会话 stdin **必须**带 `"lang":"en"`。脚本会把 `scene.name` / `metadata.name` / `logic_for_user` 改成英文（如 `Living room · Movie`）。artifact **原样交**，禁止改回中文。

- 选 Zone：只控制直接属于该 Zone 的设备，禁止扩大到父 Room。
- Zone 命中离家/全屋/观影等跨空间模板时，也不得重选全屋设备或关闭 Zone 外设备；不具备局部语义则 `UNMET`。
- 选 Room：包含直接属于 Room 及其子 Zone 的设备。
- 未知目标、歧义路径、空 Zone → `UNMET`，禁止回退全屋。
- 一律经典 `JSON_SCENE`。生成结果已可部署。**本回合第一个工具必须是** `match_and_build_scene.py`，禁止先调其它工具。  
- 动作设备 ID 必须逐字保留脚本输出的 Studio `controlId`；禁止模型改写成 `Device:` 图节点 ID。
- 脚本侧能力门闩（不臆造中台字段）：① 按图谱 `kinds` 软裁；② 若 stdin 带 `device_capabilities` / `capability_snapshot`，或图谱 `properties.writableTraits` 有值，则对该设备硬裁不可写 trait；③ 单场景动作预算默认 96（超限优先 OnOff/窗帘）；④ 只按品名启发式修端点（落地灯/射灯/台灯→`[3,4]`，灯带→`[2]`），并丢掉畸形 `lumi.` id。禁止臆造 upsert 幂等字段。
- `OK`/`DEGRADED` → **立刻**交 `json.standard_scene`（content=scene 根对象）。观影、浪漫晚餐、回房、晚安、沐浴、白天**都要交**，不只有 Movie。禁止只写 `is ready` / `is built` / `Tap it once`。没有 `artifact saved` 就不算交付。浪漫晚餐没有餐厅 → `UNMET`，禁止编客厅版。Back home 按回房 build。artifact 成功后禁止再输出。  
- `UNMET` → 禁止 artifact，读 recommend。

## 红线

- 产物名恒为 `json.standard_scene`。  
- **`metadata.scope`：基础场景必须 `[]`。** 禁止 `["康养区"]` 等房间名字符串（Studio `-32602 expected object`）；有项必须是设备属性变量对象。  
- 芯片禁止改名、禁止编造；有下一页必须出「更多」。  
- 灯写点：灯带默认 **2**；落地灯/射灯/台灯等启发式 **`[3,4]`**。  
- 名称带「帘」但是 **Switch** 的，只写 `OnOff`（演示箱窗帘）。禁止 `TargetPositionPercentage`。网关、音箱不写开关。灯名含「电视」仍是灯，不要当成电视。  
- 不要再读本 SKILL.md；不要 `ls`/`glob`（catalog 可 `read_file`）。不要先调脚本以外的工具。
