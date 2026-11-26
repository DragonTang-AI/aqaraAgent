# 照明库 × 经典 JSON_SCENE

蓝天白云与观影/回家**共用** `json.standard_scene` + 经典 `JSON_SCENE` 外壳。

## Studio 实测可运行形态（以官方手动「蓝天白云」为准）

照明库（有 `Lighting.PreviewEffect`）必须打成**一条** `device.batch`：

```json
{
  "type": "device.batch",
  "id": "action-1",
  "items": [
    {
      "deviceId": "<灯id>",
      "endpointId": 2,
      "functionCode": "Lighting",
      "traitCode": "PreviewEffect",
      "command": true,
      "args": [{ "fieldCode": "EffectData", "value": "<MCP原样>" }]
    }
  ]
}
```

硬约束：

- **禁止**拆成 `device.command.call` + `commandCode: PreviewEffect`
- **禁止**与 `LevelControl` / `ColorXY` / `ColorTemperature` 混写（官方可运行版只有 PreviewEffect）
- 有 PreviewEffect 时**不要**再写 `DisplayImage`（官方版没有；混写易 Invalid）
- 灯/帘可写点默认 **endpoint 2**（不是 1）
- 窗帘写 `WindowCovering.TargetPositionPercentage`，禁止 `CurrentPosition`
- 经典观影等非照明库：`device.trait.write` + `endpointIds` 跟能力（默认 2）+ **省略** `linkFrom`（禁止空数组）；`ColorTemperature` 用开尔文 K

参考样例：`测试结果输出/新场景设计/蓝天白云正确版本.json`。

- **`metadata.scope`：** 基础场景用 `[]`。禁止 `["房间名"]`（`-32602 expected object`）。有项必须是设备属性变量对象。

## 场景互斥（Studio 侧）

`create_scene` 完整请求样例与本仓库官方可运行 JSON（蓝天/观影）顶层只有 `name` + `config.{metadata,actions}`（或经典 `JSON_SCENE` 外壳），**未见** `exclusiveScenes` / `mutex` / `incompatibleScenes` 一类字段。

因此标准场景 Skill 用 catalog **`mutex_group` 软互斥**：写入 `metadata.description` 与对人 `logic_for_user`，**不要**往 Studio JSON 里塞未经验证的互斥字段。若中台/Studio MCP 后续暴露原生互斥参数，再改为硬字段并 bump。

交付以本地脚本产出的 `scene` 为准，直接交 `json.standard_scene`。不要再连外部能力做校验或试创建。
