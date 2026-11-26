# 情景照明库（已停用）

不要调用。标准场景只跑 `match_and_build_scene.py`，脚本返回后直接交 `json.standard_scene`。下面是旧说明，当前链路不走。

catalog 里 `lighting_profile` 非空时曾经走这里（当前：**蓝天白云**）。观影 / 回家为 `null`。

## 工具（中台挂在 Automation Agent）

- MCP 名：`builder-scene-mcp`
- 工具：`scene_profile_match_template`
- 参数（三项都要）：
  - `name`：云端模板名，与 catalog `lighting_profile` 一致（`蓝天白云`；找不到再试 `蓝天白云场景`）
  - `deviceIds`：图谱 Device 节点 id 列表，如 `Device:item_xxx`（1～100，不重复）
  - `url`：上游图谱 JSON 的 HTTP/HTTPS URL（来自 `builder.spatial_graph.upload` 返回，原样传入）

调用方传图谱 ID + 图谱 URL，不传设备能力。禁止把 Token 写进对话或仓库。

## Skill 流程（蓝天白云）

1. execute `match_lighting_profile.py`，stdin 带 `scene` + `spatial_graph` + **`url`**（upload 返回里的图谱 url）  
   → 得到 `status=PREPARE` 与 `mcp_arguments`
2. 用中台 MCP **`builder-scene-mcp`** 调 `scene_profile_match_template`，参数用 `mcp_arguments`（含 `url`）
3. 再 execute 同一脚本，stdin 带 `scene` + `spatial_graph` + **`mcp_result`**（MCP 的 `structuredContent` 或整包返回）  
   → 得到 `OK`/`DEGRADED`/`UNMET` 与 `scene`
4. `OK`/`DEGRADED` 才交 `json.standard_scene`，content = `scene` **原样**（经典 `JSON_SCENE`，actions 含 `DisplayImage`+png）。见 [create-scene-shape.md](create-scene-shape.md)。

本地联调可选：环境注入 `PROFILE_MCP_SERVER_TOKEN` 时，同一次带 `url` 的调用会走 HTTP 兜底并直接组装（中台优先用上面 1→2→3）。

## 结果注意

- `ok=true` 且组装后 `actions` 非空才能落卡  
- 动作里 `deviceId` 常为空；脚本用图谱 `properties.deviceId` 回填并去掉 `graphDeviceId`  
- MCP 常把灯膜图只放在 `deviceTemplateConfigs[].config.lightBox.imgUrl`。组装脚本会补 `DisplayImage`，`value` = 原始 png URL  
- V2 `EffectData` 原样保留，禁止手改  
- **`mcp_result` 必须带全文**（含 `deviceTemplateConfigs`），只传 `actions` 会丢 png  

说明全文见仓库 `docs/说明/场景画像MCP接口调用与结果说明.md`、`docs/说明/Studio场景保存前create_scene完整JSON.md`。
