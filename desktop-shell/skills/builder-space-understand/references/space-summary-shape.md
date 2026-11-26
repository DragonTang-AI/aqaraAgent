# 内部空间摘要形状

编排层消费；不对用户原样展示。

```json
{
  "schemaVersion": "space-summary-v1",
  "projectId": "string",
  "floors": [{ "id": "Floor:…", "name": "0F", "floorNum": 0 }],
  "rooms": [
    {
      "roomId": "zone_room_1",
      "nodeId": "Room:zone_room_1",
      "displayName": "客厅",
      "area_m2": 20.5,
      "label": "客厅",
      "labelConfidence": "high",
      "duplicateGroup": null
    }
  ],
  "adjacencies": [
    { "a": "zone_room_1", "b": "zone_room_2", "via": "door_id_or_null" }
  ],
  "openings": {
    "doors": 9,
    "windows": 9,
    "mainEntranceHint": "zone_room_1",
    "byRoom": { "zone_room_1": { "doors": 4, "windows": 2 } }
  },
  "deviceHints": {
    "fromModelCount": 0,
    "fromGraphCount": 0,
    "withRoomBelongsTo": 0
  },
  "inventory": [
    {
      "id": "item_xxx",
      "deviceId": "matt.xxx",
      "name": "人体传感器 P1",
      "model": "lumi.motion.ac02",
      "kinds": ["motion"],
      "roomId": "zone_room_1",
      "roomName": "客厅"
    }
  ],
  "kindIndex": {
    "motion": [{ "id": "item_xxx", "name": "人体传感器 P1", "model": "lumi.motion.ac02", "roomId": "zone_room_1", "roomName": "客厅" }]
  },
  "issues": [
    { "code": "duplicate_room_name", "message": "存在多间「卧室」", "roomIds": [] },
    { "code": "orphan_devices", "message": "部分设备未归属房间", "count": 0 },
    { "code": "unusable_space", "message": "未识别到房间" }
  ],
  "readyForRecommend": true
}
```

`readyForRecommend`：无 `unusable_space` 且至少 1 个房间。
