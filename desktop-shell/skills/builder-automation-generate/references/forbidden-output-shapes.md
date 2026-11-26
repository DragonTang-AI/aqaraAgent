# 禁止输出形状（曾在中台实测翻车）

以下形状 **一律禁止** 作为 `automation_instance_v0` 的 `payload`：

## 1. 自创 scenes + trigger + command DSL

```json
{
  "scenes": [{ "trigger": "manual", "actions": [{ "command": "set_mode", "params": {} }] }],
  "automations": [{ "trigger": { "type": "schedule", "cron": "0 23 * * *" } }]
}
```

错误点：无 `metadata`；用 `scenes`/`trigger`/`command`/`params`/`device_id`；用 cron 替代 `time.schedule.at`。

## 2. 正确对照

| 意图 | 正确写法 |
|------|----------|
| 一键场景 | `automations[].starters: [{ "type":"manual", "name":"…" }]` |
| 每天 23:00 | `starters: [{ "type":"time.schedule", "at":"23:00" }]` |
| 写设备 | `actions: [{ "type":"device.trait.write", "functionCode", "traitCode", "targets", "value" }]` |
| 一天两次定时 | **拆成两条** automation（各一个 `at`），不要用 cron 列表 |
| 动作间延时 | `actions` 中独立一项 `{ "type":"delay", "for":"30sec" }` |
| 事件持续 | `property.event` 上 `"for":"30sec"` |

## 1b. 自创 time.cron（2026-08-17 实测解析失败）

❌

```json
{ "type": "time.cron", "cron": "0 22 * * *" }
```

✅ 照抄 `assets/examples/schedule-light.automation-instance.json`：

```json
{ "type": "time.schedule", "at": "22:00" }
```

禁止一切 cron 表达式与 `time.cron` / `schedule` / `timer` 伪类型。

## 3. 能力不足时

查 `device_templates/{model}.json`：

- 无对应可写 trait → **不要编造 command**，写入 `capability_gaps` 并跳过该动作
- `writable: false` 且角色不含 `action` → 不可写；传感器可用 `starter`/`condition` 角色进 scope

## 4. artifact_tool（仅 name + content）

```text
artifact_tool(name="json.automation", content="{...根对象JSON...}")
```

- `name` **只能**是 `"json.automation"`  
- `content` 是根对象 `{metadata, automations[, capability_gaps]}` 的 JSON 字符串  
- `content` **本身**必须能通过 schema-first 校验  

❌ `name` 写成方案名（如 `"回家一键亮灯"`）  
❌ 旧签名：`artifact_type` / `payload` / `mode` / `artifact_id`

## 5. 自创 starter.data 简写（实测解析失败）

❌

```json
{ "type": "property.event", "data": { "ref": "FP2-左区", "value": true } }
```

✅

```json
{
  "type": "property.event",
  "source": {
    "type": "data.ref",
    "from": "/metadata/scope",
    "select": { "by": "name", "value": "fp2LeftOcc" }
  },
  "is": true
}
```

## 6. 自创延时字段（实测解析失败）

❌ action 内数字 delay：`{ "type":"device.trait.write", ..., "delay": 30 }`  
❌ 臆造 condition：`"conditions": [{ "type":"time.delay", "duration": 30 }]`  

✅ 无人持续 30 秒再触发：starter 上 `"for": "30sec"`  
✅ 先关灯再等 30 秒做下一动作：actions 里插入 `{ "type":"delay", "for":"30sec" }`  
❌ 把 `for` 写成 `data.ref`，或把传感器的 `HoldTime` 放进 scope。`HoldTime` 不是联动时长。scope 的 `type` 只能是 `device.property`。

## 7. scope / 大小写翻车

❌ `scope: ["Device:xxx"]` 字符串数组  
❌ `scope.name` 含中文或连字符：`FP2-客厅左区-有人`  
❌ `traitCode: "onOff"` / `"occupancy"` / `"currentLevel"`（camelCase）  
❌ scope 用 `device`/`property`/`function`/`type:"boolean"`/`room`（2026-08-14 实测解析失败）

```json
{
  "device": "matt.xxx",
  "property": "OccupancySensing",
  "function": "Occupancy",
  "type": "boolean",
  "name": "livingRoomOcc",
  "room": "客厅"
}
```

✅ 仅定时/一键 → `scope: []`（灯仍要 probe 再写 actions）  
✅ 事件源六字段齐；`functionCode`/`traitCode`/`endpointId` 必须来自本轮 `probe_traits`，禁止照抄任何金样数字：

```json
{
  "name": "livingRoomOcc",
  "type": "device.property",
  "deviceId": "matt.xxx",
  "endpointId": 2,
  "functionCode": "OccupancySensing",
  "traitCode": "Occupancy"
}
```

✅ `OnOff` / `Occupancy` / `CurrentLevel`（与模板一致）

## 9. 自创 device.control + set[]（实测解析失败）

❌

```json
{
  "type": "device.control",
  "target": {
    "type": "data.ref",
    "from": "/metadata/scope",
    "select": { "by": "name", "value": "livingRoomLight" }
  },
  "set": [
    { "trait": "OnOff", "function": "OnOff", "value": true },
    { "trait": "LevelControl", "function": "CurrentLevel", "value": 80 }
  ]
}
```

错误点：无 `device.control`/`set`/`target`；灯未进 scope 却用 data.ref；`trait`/`function` 不是 `traitCode`/`functionCode`。

✅ 每条写动作一条 `device.trait.write`：

```json
{
  "type": "device.trait.write",
  "functionCode": "Output",
  "traitCode": "OnOff",
  "targets": [{ "deviceId": "light001", "endpointIds": [1] }],
  "value": true
}
```

亮度再写一条 `LevelControl` + `CurrentLevel`（1–100）。动作目标用 `targets[].deviceId`，**不要**用 scope data.ref 指灯（灯通常不必进 scope）。

## 11. 主控 Event 写了 key 名（Studio 下拉空、真机不触发）

这是**一类问题**，不是某台无线开关：凡 `*Event`（`ButtonEvent` / `CubeEvent` / `RotationEvent` / `VibrationEvent` / `ManualPullEvent`…），Studio 下拉吃设备库 `supportedValues[].value`，不是 key。远程接口常只给 key、省略 value。

❌ `"is": "SinglePress"` / `"Push"` / `"Shake"` / `"TapTwice"` / `"Rotate"` / `"单击"`  
→ 编辑器「等于 **空**」，不执行。开关、魔方、旋钮同一病。

✅ 只抄**该设备本轮** probe `scopes[].is` 或 `usable.events[].enums[].value`  
❌ 把开关单击=`"0"` 套到魔方/旋钮（魔方 `Rotate`=`"6"`，旋钮 `Rotate`=`"0"`）  
❌ `enumMissing` 还自己编一个动作

`deviceId` 用空间设备的 `id` 或 `deviceId`（取 `id` 即可）。item_* 不是这类空下拉的原因。

## 12. 写了设备上没有的点（2026-09-03 部署失败 code 2026）

这是**一类问题**。云端：`Property not found: {functionCode}.{traitCode} (device, endpoint)`。  
Hue 只是第一次撞上的例子；`OnTransitionTime` / `ColorMode` / `Saturation` / 任何 probe 里没有的点都会同样炸。

❌ 凭印象写 `ColorControl.Hue`、为「1 秒过渡」写 `OnTransitionTime`、抄金样里另一台灯的能力  
→ 右侧能落卡，**部署同步失败**。

✅ 每一个写点 / 每一个 Event 都在本轮 `byDevice[这台].writes` / `events` 里  
✅ validate stdin 必须 `{instance, probe}`，probe 是这一轮 probe_traits 原文  
❌ 只禁 Hue 却继续编其它点  
❌ artifact 里带着 `probe` 字段

## 13. 角色词当变量（2026-09-03 部署失败 code 2026）

云端：`Undefined variable reference: cube`（`light` / `switch` / `motion` 同病）。

SCRIPT_JSON 把未声明的短名字当变量。这是**一类问题**：

❌ `deviceId: "cube"` / `"light"` / `"switch"`（必须是空间 `id`）  
❌ `select.value: "cube"` 但 `scope` 空，或 scope.name 是 `cubePress`  
❌ `source.from: "cube"`（只能是 `/metadata/scope`）

✅ scope.name 用 `trig` / `cubePress` / `btnEvent`，select.value **逐字相同**  
✅ deviceId 用完整节点 id `Device:item_*`。禁止去掉前缀写成 `item_*`，禁止用 `properties.deviceId` 的 `lumi.` 实例号代替。

## 14. 把开关路数写到灯上（空壳负载）

❌ 射灯 / 家电带 `poweredBy`，动作却写这盏灯的 `OnOff` + `CurrentLevel`，`endpointIds` 用开关的 `sourceEndpointId`  
❌ 同一路开关上的三盏灯拆成三次写灯  
❌ validate 不带 `loads`，或 `loads: []` 把已知空壳负载藏起来

✅ 只写供电开关的 `Device:item_*`，endpoint 用这只开关 probe 上的那一路。同一路一条 `Output.OnOff`。开关没有 `CurrentLevel` / 颜色就不写亮度。灯自己有写点且没有 `poweredBy`，才写灯，endpoint 用灯自己的。

## 10. 灯随人动写成 if/then/else（2026-08-14 实测解析失败）

❌ 一条 automation 里两个 starter（有人+无人）+ `actions:[{ "type":"condition", "if":..., "then":[device.control...], "else":[...] }]`  
❌ scope 用 `propertyId`；`functionCode`/`traitCode` 对调成 Occupancy / OccupancySensing  
❌ 把灯放进 scope 再用 data.ref 控制  

✅ 照抄 `assets/examples/motion-light.automation-instance.json`：  
`automations` 拆「有人开灯」「无人关灯」两条；各用 `device.trait.write`；scope 只留人感。

## 8. 多方案耦合 / 表与右侧不一致（实测）

❌ 一次 artifact 同时放「回家」+「离家」两个 `manual`  
❌ 同一份里混装 `manual` 场景 + `property.event` 联动（如「剧场联动与一键场景」）  
❌ 聊天表写「客厅观影模式」，`metadata.name` 却叫别的  
❌ 方案名用图节点 `id`（`Room:zone_room_3_imported起夜微光`）；必须用 `properties.name`（`Bedroom2 night light` / 「次卧起夜微光」）  
❌ 先写满表 3 行并说「已添加 3 条」，实际只成功 append 2 次（常见：人感那条形状翻车被丢）  
❌ 表 3 行只 `artifact_tool` 1～2 次  

✅ **先**逐条 append 成功，**再**出总表；最终表行数 = 成功次数  
✅ `metadata.name` 与表方案名逐字相同  
✅ 一场景一份、一联动一份；同一条联动内的有人亮+无人灭可同份（表上只占 1 行）——**但是**要用 `automations[]` 两条，不是 if/else  
✅ 用户要 3 条但第 2 条失败 → 表只留成功的，并说明未落库的那条
