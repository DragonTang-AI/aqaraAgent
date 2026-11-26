# recommendation_v1 — 前端统一 Schema（完成旗帜）

`artifact_tool` 的 `payload` **必须**等于前端 `content` 所读形状（见仓库根目录 `设备推荐统一 Schema.md`）。  
勿再产出 `rooms[].items[]` / `summary` / `gatewayPlan` 旧形状。

## 调用形态

```json
{
  "artifact_type": "recommendation_v1",
  "payload": {
    "hasRecommendedDevices": true,
    "totalRooms": 2,
    "totalDevices": 5,
    "recommendations": [
      {
        "roomId": "r1",
        "roomName": "客厅",
        "area": 25.5,
        "deviceTypes": [{ "type": "MotionSensor", "count": 1 }]
      }
    ],
    "devices": [
      {
        "seq": 1,
        "roomId": "r1",
        "roomName": "客厅",
        "deviceType": "MotionSensor",
        "spuId": "spu.AS038",
        "productName": "人体传感器 P1",
        "model": "lumi.motion.ac02",
        "protocols": ["zigbee"],
        "needsGateway": true,
        "qty": 1
      }
    ]
  }
}
```

## 前端判读（勿改字段名）

| 路径 | 用途 |
|------|------|
| `content.hasRecommendedDevices` | 主旗帜：`true` = 有推荐 |
| `content.devices[]` | 设备列表视图（`spuId` / `qty`） |
| `content.recommendations[]` | 房间卡片（`deviceTypes` 数量） |

## 组装规则

1. `devices`：扁平列表，`seq` 从 1 连续编号；所有 `roomId + roomName` 必须精确匹配 model 真实 Room。网关放第一条并锚定玄关/入户优先、其次客厅、否则第一个 Room；禁止 `whole_home` /「全屋」
2. `recommendations`：每个 model 房间一条；`deviceTypes` 由该房间 `devices` 按 `deviceType` 聚合
3. `totalRooms` = `recommendations.length`；`totalDevices` = `devices` 条数之和（含网关）
4. `hasRecommendedDevices` = `devices.length >= 1`
5. 字段从 `default-picks.json` 直接拷贝：`deviceType` / `spuId` / `productName` / `model` / `protocols` / `needsGateway` / `qty` / `rationale`
6. `area`：有空间摘要则用 `area_m2`，否则 `0`
7. `rationale`：推荐理由（给人话表用；前端可忽略，但 payload 必须带）

## 禁止

- `rooms` / `items` / `placement_ref` / `summary` / `gatewayPlan` / `schemaVersion`
- `skuId` / `displayName` / `requiresGateway`（旧名；分别用 `spuId` / `productName` / `needsGateway`）
