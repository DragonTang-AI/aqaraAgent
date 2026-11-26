# 户型空间模型 — 推理核心（V2 精简）

完整规范见知识库 `空间图谱及模型说明/户型空间模型格式说明文档_V2.md`。此处只保留 Agent 必读。

## 根结构

- `meta`：version、projectId、units.length=`mm`、north、axis
- `levels[]`：每层含 `rooms`、`walls`、`doors`、`windows`、`furniture`、`devices` 等

## 必用字段

| 对象 | 字段 |
|------|------|
| room | id, name, boundary, area, namePoint |
| door | id, hostId, point, width, type, facingOrientation |
| window | id, hostId, point, width, sillHeight, type |
| device | id, name, point；可选 deviceId, resourceId, deviceTypesList, hostId |
| wall | id, startPoint, endPoint, thickness |

## 忽略

- `_editorScene`、实体上的 `editor` 大块透传
- 材质与精细造型可选字段（不影响房间拓扑理解）

## 单位

长度 mm。若只有 model 无 graph：`area_m2 ≈ area / 1e6`（当 area 明显为 mm² 时）。
