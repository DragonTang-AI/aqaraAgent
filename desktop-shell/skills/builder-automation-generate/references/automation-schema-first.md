# Automation schema-first（默认生成子集）

权威边界：`assets/schemas/automation-instance-v0.schema.json`。字段细节冲突时 **schema 优先**。

## 根形状

```json
{
  "metadata": { "name": "", "description": "", "scope": [] },
  "automations": [ { "name": "", "starters": [], "condition": {}, "actions": [] } ]
}
```

可选 `capability_gaps`。

## 默认允许

| 角色 | 类型 |
|------|------|
| starters | `property.event`, `time.schedule` |
| conditions | `property.state`, `and`, `time.between` |
| actions | `device.trait.write`, `delay` |

## 硬规则

1. `property.event.source` **必须** `data.ref`（`from: "/metadata/scope"`, `select.by: "name"`），设备定义放在 `metadata.scope`
2. `time.schedule.at` / `time.between`：`HH:MM` 24 小时制
3. `device.trait.write`：`functionCode` + `traitCode` + `value` + `targets[{deviceId, endpointIds[]}]`
4. 禁止默认生成：`operator`、`fieldCode`、内联 starter `device.property`、`or`/`not`、`device.command.call`
5. 时长：`5sec` / `5min` / `1hour` 等

## deviceId

使用图谱 Device 节点完整 `id`（如 `Device:item_xxx`），与金样中的逻辑 id 不同——以当前 graph 为准。

## 枚举 value

写枚举 trait 时，优先使用模板 `parameter.supportedValues[].value`（字符串数字如 `"0"`），不要写口语 `"cool"` / `"silent"`（除非模板 key/value 本身如此）。

凡 `*Event`（按键/魔方/旋钮/振动/手拉）的 `is` **必须是该设备本轮 value**，禁止抄 key。无 value 时可用同 trait `spec.tags` 数字；都没有就不要编。禁止把一台设备的数字套到另一台。

## 自检失败即重写

若草稿里出现 `scenes`、`trigger`、`command`、`params`、`device_id`、`cron`（无 `at`）——整份作废，按金样重写。详见 `forbidden-output-shapes.md`。
