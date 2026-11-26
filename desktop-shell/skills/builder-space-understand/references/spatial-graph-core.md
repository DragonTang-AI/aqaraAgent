# 空间语义图谱 — 推理核心（V2 精简）

完整规范见知识库 `空间图谱及模型说明/空间语义图谱格式说明文档_V2.md`。

## 根结构

- `nodes[]`：`id`, `nodeType`, `properties`
- `edges[]`：`source`, `target`, `edgeType`, `properties`

## 关键 nodeType

`Space` / `Floor` / `Room` / `Door` / `Window` / `Device` / `Furniture` / `Outside`

## 关键边

| edgeType | 用途 |
|----------|------|
| belongsTo | 楼层→空间、房间→楼层、设备→房间 |
| connects | 门窗连通房间/室外 |
| isAdjacentTo | 房间邻接（可含 viaDoor） |
| isInstalledOn | 设备/门窗安装宿主 |
| isNear / 方位边 | 相对位置，可选 |

## Room 字段

- 节点 `id`：如 `Room:zone_room_3_imported` → **只**作对内定位（摘要 `roomId` / `nodeId`）
- `properties.name`：展示名（如 `Bedroom2` / 客厅）→ 自动化方案名、对人说话、推荐表房间列 **必须用这个**
- 禁止把 Room 的 `id` 写进方案名 / 聊天表

## Device 字段

- 节点 `id`：如 `Device:item_xxx`。自动化 JSON 的 `deviceId` **必须原样使用**，禁止去掉 `Device:`。
- `properties.deviceId`：Studio 实例号（`lumi.xxx`）。文档里的外部设备身份仍叫这个字段，但不能代替节点 `id` 写进联动。
- 设备可能先 `belongsTo` 到 `Zone`，`Zone` 再属于 `Room`。房间名用最终的 Room，功能区不是房间。
- `CornerWindow` 算窗。`HomeAppliance` 是非智能家电，不进设备清单。
- `powers`：墙开给灯具或家电供电。摘要在开关上写 `powers`，在负载上写 `poweredBy`。空壳灯（`lumi.models.*`）和家电不能当控制目标。开灯写开关自己的 endpoint（`sourceEndpointId`），同一路只写一次。禁止把这条路数抄到灯的设备 id 上。开关没有亮度点就不要编亮度。
- 编译结果可能包在 `graph` 里，节点仍在 `graph.nodes`。
- `properties.resourceId`：V2 是库型号；V3 可能是 `studio:lumi.xxx` 或资源库短名，这时型号看 `properties.model`。
- `properties.model`：V3 常见 `lumi.models.*` 空壳，probe 还要带产品名。
- `properties.name`：展示名
- `properties.deviceTypesList`：可选
- V3 图谱 `meta.version` 为 `3.x`。房间 `properties.area` 已是㎡。家电没有设备 id。

## 质量问题

测试数据可能出现大量 Device **无** `belongsTo` Room——必须记入 `orphan_devices`，不可假装已归属。
