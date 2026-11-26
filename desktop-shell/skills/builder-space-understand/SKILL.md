---
name: builder-space-understand
whenToUse: "当需要从户型/空间数据抽取房间、邻接、门窗与按房设备时。"
description: >-
  从 spatial_graph / spatial_model 抽出房间、邻接、门窗开口和按房设备清单，供推荐与自动化使用。
  触发词：户型、房间、邻接、空间模型、按房设备。只抽事实，不推荐设备、不生成联动。
compatibility: 会话注入空间 JSON；邻接优先 graph 的 isAdjacentTo。
metadata:
  version: "1.2.12"
  aqara_builder: "2.0"
---

# Builder Space Understand

## 速度红线

1. 会话已有房间列表且本轮只要房间名 → **不必再抽**
2. 需要邻接 / 开口 / 入户门 / **按房设备清单** 时 **execute 1 次** `extract_space_summary.py`。`/skills/` 只给 `read_file`；execute 用：

```bash
python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-space-understand/scripts/extract_space_summary.py' 2>/dev/null | head -1)" - <<'EOF'
{"spatial_graph":{...}}
EOF
```

有 graph 用 graph；只有 model 脚本会按门洞推邻接。禁止 `/skills/`、相对路径、先 `ls`/`glob`/`pwd`。禁止读本 SKILL / references。
3. 上下文里已能看到 `isAdjacentTo` → 直接用，不必再跑脚本
4. 禁止把摘要 JSON 贴给用户

## 输出（内部）

`rooms[]`（roomId / displayName / area_m2 / **label**）、`adjacencies[]`（a / b / via）、`openings`（doors / windows / mainEntranceHint / byRoom）、`inventory[]`（id / **deviceId** / name / model / **probeAs** / shell / kinds / roomId / roomName）、`kindIndex`、`issues[]`、`readyForRecommend`。  
`displayName` / `inventory.roomName` 来自 Room `properties.name`（如 Bedroom2）。`roomId`/`nodeId`（`Room:zone_room_*`）只给对内定位，**禁止**写进自动化方案名或对人说话。  
`probeAs`：`lumi.models.*` 空壳时用产品名，给自动化 probe 的 `product` 字段。自动化选设备只看 `inventory` / `kindIndex`（灯带/灯泡 = `light`），禁止因没说全名就当没有。  
`id` 是图谱节点；有绑定实例时 `deviceId` 另带。自动化 JSON 取 `id` 或 `deviceId` 均可（取 `id` 即可）。设备房间：先 `belongsTo`，没有再用坐标落在房间多边形内。自动化选设备只看 `inventory`，禁止自己用坐标猜。重名房间 `label` 带面积（如「客厅（约62㎡）」），`issues` 含 `duplicate_room_name`。

对人一句即可，**跟用户语种不跟国区**（中文：「已了解您的户型，共 N 个房间。」/ 英文：`Got the layout: N rooms.`）。不说邻接、图谱、开口字段。有重名交给编排用家里话说明有两间同名、用面积区分；用户点名某房时再追问是哪一间。

## 不做什么

不推荐设备、不生成自动化、不报预算、不对用户贴 JSON / 路径 / 工具失败。
