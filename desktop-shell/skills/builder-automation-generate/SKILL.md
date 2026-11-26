---
name: builder-automation-generate
whenToUse: "当用户确认方案后要生成可解析的联动/自动化（非标准场景）时。"
description: >-
  用户确认方案表后生成可解析联动/场景。成功链路：读金样 → validate OK → artifact_tool；禁止确认后直接连打 artifact。禁 time.cron。灯光秀用 delay+多步变色金样，禁止 Hue。标准场景不归本 Skill，走 builder-standard-scene → json.standard_scene。
compatibility: 金样+validate；勿 ls；门闩失败勿拼假设备。
metadata:
  version: "1.5.89"
  aqara_builder: "2.0"
---

# Builder Automation Generate

标准场景（观影 / 回家 / 蓝天白云 / 按标准场景输出）**不要**用本 Skill，改走 `builder-standard-scene`。

## 稳定性红线

1. 交给编排的根对象须可解析；交付前必须：

```bash
python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-automation-generate/scripts/validate_automation_instance.py' 2>/dev/null | head -1)" - <<'EOF'
{"instance":{...根对象...},"probe":{"byDevice":{...本轮 byDevice...}},"loads":[]}
EOF
```

只贴 `byDevice`，禁止贴 probe 全文（会截断再重试）。`loads` 必填：摘要里 `poweredBy` 的空壳灯和家电逐条抄入并标 `shell: true`，没有就 `[]`。缺 byDevice、缺 loads、写了负载本身、或 endpoint 不是这台自己的 probe endpoint → FAIL。输出第一行不是 `OK` 禁止 artifact。FAIL 只改一次再 validate，仍不是 `OK` 就停，禁止把没通过的 JSON 交出去。禁止 write_file / python 检查 / 再 probe。artifact 只交根对象。整轮 probe 1 次、金样每种 1 次。  
无人持续照 `motion-light` 金样：scope 只放人体 Occupancy，`type` 只能是 `device.property`。`for` 只许 `"30sec"` 这种时长字符串。禁止 `for` 写成 `data.ref`，禁止把 `HoldTime` 放进 scope。`HoldTime` 是传感器自己的保持时间，不是联动要等多久。  
2. **不要再读本 SKILL.md**；禁止 `ls`/`glob`/`pwd`、读 `scripts/*.py` / `device_templates`、`write_file` 抄脚本、`python3 -c` 重写校验。execute 看不见 `write_file` 的 `/tmp`。`/skills/` 只给 `read_file` 金样。  
3. 对人只打家里话进度，且只打用户语种那一句（中文：准备 / 核对设备 / 「方案在生成，马上好…」；英文：`Preparing the plan you confirmed…` / `Checking what these devices can do…` / `Almost ready…`。英文用户禁止打「正在…」。禁止说右侧、左侧、面板），禁止 k/M、禁止说来源/库/模板/工具失败。**禁止**把 probe 字段念给用户（`endpointId` / `functionCode` / `traitCode` / `matt.` / `OnOff` / `ButtonEvent` / `SinglePress` /「probe 结果」）。落卡后交付必须带一句逻辑：`已生成：{名}。{谁触发、会怎样}。`（英文 `Ready: {name}. …`），写入 `metadata.description`；禁止只报名。表已发出后用户回 `1`/`确认` = 立刻生成，禁止再出表。**纯招呼（你好/hello）禁止出方案表、禁止按回家+起夜+报警三连开场**；先问好 + 快捷 `json.question`。设计按这套房现有设备最多 3 条，跟用户原话挑，禁止每轮同一套模板。用户点名灯光秀/派对/氛围/变色：**稳优先**。只把本轮 probe `writes` 里确有 `ColorXY`/`ColorRGB`/`LightingDynamicSceneMode` 的灯放进秀，最多 2 盏。空壳 / `lumi.models.*` / 没有颜色写点的灯一律不放。没有彩光写点就不要交彩光 JSON。不要被回家/起夜挤掉。其余按回家亮灯 / 报警提醒 / 起夜微光 / 人来开灯 / 离家全关。名称带房间，有设备才写，禁止虚构。房间字取 Room `properties.name` / 摘要 `inventory.roomName`（如 Bedroom2），**禁止**图节点 `id`（`Room:zone_room_*`）。盘点只许 1 次 `extract_space_summary.py`，用 `inventory` 对房间；禁止翻 `conversation_history`。方案名写卧室则人感和灯必须是卧室的。起夜微光有 `CurrentLevel` 就写约 20。门锁解锁算回家。  
4. 只要 JSON 里会出现 `deviceId` **必须** `probe_traits.py`（第一次 execute 用 find + stdin `-`，禁止相对 `scripts/`、禁止 `/skills/`）。JSON 带会话 `country_code`，非 CN 查模板自动 `lang: en`。能力以本轮 `usable.events` / `usable.writes` 为准，禁止只认 Occupancy/OnOff。JSON/`bind` 的 `deviceId` 取摘要里的完整节点 id（`Device:item_xxx`），禁止去掉 `Device:`，禁止改用 `lumi.` 实例号，**禁止** `cube`/`light`/`switch` 这种角色词（云端 2026 Undefined variable）。功能区 `Zone` 不是房间。`HomeAppliance` 不能当控制目标。`poweredBy` 的空壳灯和家电不能当目标。开灯写供电开关，endpoint 用开关自己的 probe，同一路只写一次；开关没有亮度就不要编 `CurrentLevel`。禁止把 `sourceEndpointId` 抄到灯的 `deviceId` 上。`select.value` 必须等于某条 `scope.name`。凡 `*Event`（开关/魔方/旋钮/振动…）的 `is` 必须抄该设备本轮 probe `enums[].value`，禁止抄 key；enums 空则不做这条。**写点只许来自本轮 `byDevice[deviceId].writes`**（Hue / OnTransitionTime / ColorMode / 任何未出现的点都算编造，云端 2026 Property not found）。颜色没有就不写炫彩。`model` 用库型号，`product` 必填 inventory.name/probeAs。`lumi.models.*` 空壳先查品名。用户说灯带/灯泡=kind=light，禁止问全名、禁止对人说查不到。失败回落本地 templates。禁止照抄金样能力字段。对人跟用户语种，不跟国区。

## 何时不产出

仅网关 / 缺关键设备 / 意图过虚 → 不拼实例。  
有人开+无人关同份 = 1 方案。  
**ASK 回合**（出表+反问）：恰好 1 次 `json.question`，工具一返回本回合死亡。正文禁止再写 `1. 确认…` 编号。自己写的「1. 确认」不是用户已确认。禁止接着读金样 / probe / 生成 / `json.automation` / 「正在按确认的方案准备」。用户要「反问框 / 选项」必须再走 ASK。**HELLO 回合**只问好+快捷项，禁止出表。本 Skill 不调 artifact、不要读本文件。

编排：`artifact_tool(name="json.automation", content="<根对象JSON字符串>")`。  
`name` 恒为 `json.automation`。  
用户确认后走 **金样 → probe（有设备就跑）→ validate OK → artifact**（图一）。禁止确认后第一条就 artifact（图二：tool 完成但右侧空）。用户说「没有生成」必须再 validate + 再调 artifact，禁止只口头已交付。Skill 不调 artifact。

## GEN 成功链路（中台 SP 截断时以本节为准）

SP 可能被中台字数截断；**确认后生成**按本节执行，勿依赖 SP 后半段。

1. `read_file` 金样：`/skills/.../builder-automation-generate/assets/examples/`（见下表；每种意图整轮 1 次）。execute 禁止 `/skills/`。  
2. 有 `deviceId` → **1 次** `probe_traits.py`（find 行 + stdin `-`）。`product` 必填。  
3. 组根对象：`deviceId`=`Device:item_xxx`；`metadata.name`=表方案名；`description`≤30 字家里话。  
   - `*Event` 的 `is` 必须抄本轮 `enums[].value`（多是 `"0"`/`"1"`），禁抄 `SinglePress` 等 key；enums 空则不做。  
   - 灯光秀：只纳入本轮 `writes` 确有 `ColorXY`/`ColorRGB`/`LightingDynamicSceneMode` 的灯，最多 2 盏；色温 Mired（370/250/153）；禁 Hue；步间 `delay` 1～3sec。细则见 `references/light-sequence-playbook.md`。  
4. validate（上节 bash）：`probe` **只带 `byDevice`**；`loads` 抄摘要每条 `poweredBy` 空壳并 `shell:true`，没有则 `[]`。首行非 `OK` 禁 artifact；FAIL 只改 1 次再验。  
5. `artifact_tool(name="json.automation", content="<根对象>")`。交付：`已生成：{名}。{谁触发、会怎样}。`  
6. 整轮 `json.automation`≤3、同名 1 次。禁 write_file `/tmp`、禁贴 probe 全文、禁跳过 validate。

## 金样

| 意图 | `assets/examples/` |
|------|-------------------|
| 彩虹 / 变色 / 派对 | `light-show-rainbow.automation-instance.json` |
| 多灯追逐 | `light-show-chase.automation-instance.json` |
| 呼吸 | `light-show-breathe.automation-instance.json` |
| 闪烁 | `light-show-flicker.automation-instance.json` |
| 观影暖暗 | `light-show-cinema.automation-instance.json` |
| 冷暖潮汐 | `light-show-warm-cool.automation-instance.json` |
| 灯带内置动态 | `light-show-dynamic-mode.automation-instance.json` |
| 人感 / 灯随人动 | `motion-light.automation-instance.json` |
| 定时 | `schedule-light.automation-instance.json` |
| 其它 | `stand.automation-instance.json` |

灯光秀：开灯后必须还有多步写入 + `{type:delay,for:"1sec"}`。色板与降级见 [references/light-sequence-playbook.md](references/light-sequence-playbook.md)。禁止 Hue；色温只写 Mired。

✅ 定时 `{ "type":"time.schedule", "at":"22:00" }`  
❌ `time.cron`  
灯随人动：两条 automation；scope 只人感 Occupancy；无人那条 `"is": false`、`"for": "30sec"`；灯 `targets`。

starter 白名单：`manual` | `time.schedule` | `time.between` | `property.event`  
action 白名单：`device.trait.write` | `delay`

## 根对象

```json
{ "metadata": { "name": "", "description": "", "scope": [] }, "capability_gaps": [], "automations": [] }
```

## 反例

[references/forbidden-output-shapes.md](references/forbidden-output-shapes.md)
