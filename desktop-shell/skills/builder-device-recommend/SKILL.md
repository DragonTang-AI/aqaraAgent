---
name: builder-device-recommend
whenToUse: "当用户要推荐设备/设备清单/选型/全屋智能，或指定房间与品类需要产出设备清单时。"
description: >
  按房间 + 已有设备 + 配置档做缺口补全（精简/标准/进阶）。
  触发词：推荐设备、设备清单、选型、全屋智能。点了灯、雷达、传感器或某房间并要求推荐，直接出清单并交 json.device，不要先问档。没点品类也没点档才先问。文字表不能代替 json.device。
compatibility: 读取 assets/default-picks.json；assemble 脚本可直接吃 spatial_model。
metadata:
  version: "1.8.36"
  aqara_builder: "2.0"
---

# Builder Device Recommend

英文自由输入（hello / yes / recommend / continue / Floor plan & devices 都算）时，**禁止输出任何汉字**。进度、解读、表头、房间列、收尾全部英文。聊天表与 JSON `roomName`：Entry / Living room / Bedroom / Bathroom / Courtyard。`roomId` 仍用图谱 id。GEN 必须先 `json.device` 成功，再写表；`devices[].model` 不能空。`mcp_load` 失败忽略，继续 `models.get` → lookup → validate → `json.device`。

**硬门闩：** 尚未成功拿到非空 `device_models` 之前，禁止 lookup / assemble / validate / `json.device` / 出表。工具不存在、`STALE_PAGE`、超时、列表里没有该工具 = 失败停，禁止改走无白名单全库查。**空屋从零**与**已有设备缺口补全**同一条链，都必须先 `builder.device.models.get`；盘点已有只决定补哪类/几台，不代替白名单。禁止说「已有户型/在补全所以不用查」「本地目录够用」。对人禁止提工具名 / `STALE_PAGE`。

## 速度红线

1. **禁止** `ls` / `glob` / 翻 `device-index` / `categories`
2. **禁止**再读本 SKILL.md / references / example
3. **两条互斥路线（禁止同一回合都走）：**  
   **HELLO**（整句你好/hello，没点推荐）：问好 + 快捷 `json.question`，禁止清单。  
   **ASK**（要推荐，但没点档，也没点房间或品类）：恰好 1 次 `json.question` 后停。正文禁止再写「请先选一个配置档」和 `1. 2. 3.` 三档。`json.question` 一返回本回合死亡：禁止再 picks / `models.get` / lookup / `json.device` / 「正在按您选的精简入门」。自己写的「1. 精简入门」不是用户已选。`id` 只用 `"1"` `"2"` `"3"`（HELLO 可到 `"4"`）。  
   **GEN**（点了三档，或点名灯/雷达/存在传感/传感器/窗帘/某房/预算习惯且要清单）：没点档也直接出，不要先问。文字表不能代替交付，validate 通过后必须 `json.device`，没有这个工具结果禁止写「清单已就绪」。不要读 `default-picks.json`。角色用系统提示里的房间表。**GEN 顺序：** ① **1 次** `builder.device.models.get`（读 `data.device_models` 或根 `device_models`；空数组=无货停；失败=请再试，禁止假装全库可卖）② **execute 1 次** `lookup_catalog.py`，必须带 `--allowed-models`（或 stdin `allowed_models`/`device_models`）做 **著名库 ∩ 白名单** ③ validate ④ `json.device`。`--roles` 先按档再按用户品类收窄（点名窗帘加 `curtain`；只要传感器或窗帘时不要硬带 `light`；未点名品类才默认含灯）。**空间锁死：** `devices[]` / `recommendations[]` 每行的 `roomId + roomName` 必须逐字取自当前 model 的真实 Room，禁止 `whole_home` /「全屋」/面积后缀等合成空间；网关、M300 也锚定玄关/入户优先、其次客厅、否则第一个真实 Room。用户说只要卧室/某房 → 只含这些房间，禁止把客厅等顺手铺进去。每房只出该房 picks ∩ 该档 ∩ 用户品类。灯：厨/卫筒灯，其余吸顶。理由每房一句，禁止多房同一套。`/skills/` 只给 `read_file`；execute 用 find 行。无国区也要查。对人跟用户语种，不跟国区。进度也跟语种：英文用 `Matching devices for what you asked for…` / `Putting the list together…`，禁止英文用户打「正在…」。表里设备名用 lookup `productName`，禁止自译、禁止抄 picks 中文名。**聊天表**只列房间/设备/理由，禁止把 `lumi.*` 念给用户。**JSON `devices[].model` 必须仍是 lookup 且 ∈ 白名单的库型号**，空了右侧列表不渲染。落卡前再 `execute` 一次 `validate_recommendation.py`（stdin `-`，外层带 model 真实 `rooms`），校验完整字段、连续 seq、数量聚合与统计，FAIL 禁止 artifact
4. `assemble_recommendation.py` **仅备用**（read 失败、模型太大盘不清、或缺口减法无把握时，最多 1 次；它会自己叠库）。走 assemble 时 stdin 必须带本轮 `device_models`/`allowed_models`
5. 某 role **库空或白名单滤光则跳过该行**，禁止用 picks 的 model/spuId 凑。**`models.get` 失败 / 没调到 / 工具不存在 / `STALE_PAGE` → 不出清单、不 artifact、不写「待库确认」、不改走无白名单 lookup**。清单 `model` 只能是库型号且 ∈ 白名单，禁止实例 id、禁止空 model。同品优先 `lumi.*`。禁止拉全库；禁止跳过白名单；禁止向用户要国区。纯招呼走 HELLO。「请给我几个档位」必须再走 ASK。上一轮问过或出过清单都不算本轮交付。用户点名房间/品类后仍出全屋或未点名品类硬铺灯 = 失败。清单交完后用一句话问要不要空间布点，不要同一回合跑 `suggest_placement.py`。用户下一轮明确要布点，且已有清单和 `spatial_model`，才 execute 1 次该脚本，坐标照抄 `point` 的 `x` `y` `z`（毫米，x 向右、y 向下、z 向上），禁止编点，禁止读 `editor.position`。缺清单或没有户型就停。

## 缺口规则（必须）

1. 从 `levels[].devices`（或 graph Device 节点）抽出已有：`name` / `resourceId|model` / `deviceTypesList` / 归属房间。已装设备的 model **不是**可售白名单，禁止当 `--allowed-models`
2. **空设备**（一条都没有）→ 按 picks **该房角色+数量** 全量，含一台网关与 **各常用房间灯具**；网关也必须挂到真实 Room。型号仍必须来自 **`models.get` ∩ lookup**，库空不出行。禁止用插座代替灯；`switch` 只选墙开。有已装设备时同样：先 `models.get`，再按缺口减法出待补行
3. **已有网关**（名称含「网关」、`resourceId` 含 `gateway`、或类型 `Gateway`，全屋任一处）→ 禁止再出网关行
4. 房间内同类：`need = max(0, 面积规则qty − 该房已有台数)`；`need==0` 则跳过。档位 roles 只是白名单，再 ∩ 用户点名的品类。**已有任何灯不再叠灯**；**传统灯补墙开**（精简档也补），智能灯不因此强行加墙开。用户明确只要传感等非灯品类 → 空房也不加灯。**门磁看开口**：门≥2 或门+窗≥3 才给；没开口数才退回客厅/阳台。门少不加；卧室/书房/餐厅默认不加，除非这间门很多。水浸/燃气仅厨房（卫生间仅水浸）。名称含网关/边端或类型 Hub 算已有网关，禁止再推。重名用面积区分（`label` /「客厅（约62㎡）」）；用户只说客厅且有两间 → 先问哪间。**用户说只要某房 → 表禁止出现其他房间。** 解读必须和表一致。没有厨卫则整表不要水浸/燃气。老人/小孩：卧室人感、卫浴水浸优先，少气候。每房理由必须带展示名，禁止多房同一句「覆盖动线」
5. `devices[]` 只含 **待补且新库有型号** 的行

面积微调仅标准/进阶：灯 客厅≥25㎡→2 / ≥50㎡→3；人感≥25㎡→2 / 客厅≥40㎡→3；开关≥30㎡→2；门磁仅已决定要出的房间，客厅阳台≥20㎡或门窗≥3→2。精简档每类 1 台，仍含灯，不含温湿度；开关只在该房已有传统灯时例外补。

## 主路径产出

交给编排（字段不变）：

```json
{
  "hasRecommendedDevices": true,
  "totalRooms": 0,
  "totalDevices": 0,
  "country_code": "CN",
  "budget": "standard",
  "recommendations": [{ "roomId": "", "roomName": "", "area": 0, "deviceTypes": [] }],
  "devices": [{
    "seq": 1, "roomId": "Room:living", "roomName": "客厅",
    "deviceType": "Gateway", "spuId": "spu.xxx", "productName": "Hub M3",
    "model": "lumi.gateway.acn004",
    "protocols": ["zigbee"], "needsGateway": false, "qty": 1, "rationale": "unify"
  }]
}
```

`devices[]` 的 `model` **必须是 lookup 且 ∈ 白名单的库型号，禁止空字符串**（上表是形状示例，真值必须填满）。每行空间必须精确匹配 model Room；展示用重名面积标签只放聊天表，禁止写进机器字段。聊天表可以不写 `lumi.*`；JSON 缺 `model` 或空间对不上，前端右侧列表无法渲染。落卡前 `validate_recommendation.py` 必须 OK。

已覆盖或该地区货架全空则 `hasRecommendedDevices=false`、`devices=[]`。对人：先 2～3 句解读（这次范围、预算/品类/习惯、空屋或补缺），再表明细列：房间 | 设备 | 推荐理由（英文 Room | Device | Why）。禁止**聊天表**列型号/协议/需网关。理由禁止多房逐字相同。  
收尾只说「清单已就绪，请在平面图上放置并保存。」禁止来源/设备库括号。库空品类可一句「这个地区暂时没有合适的可售型号」。对人禁止 Skill / JSON / 路径 / 工具失败。

## 备用脚本

每轮推荐必须查库（无国区也要）。中台 `execute` 的 cwd 是 `/app/.agenthub`，`/skills/` 在 shell 里不存在。**第一次就用这一行**（禁止 `/skills/`、禁止 `python3 scripts/...`、禁止先 `ls`/`glob`/`pwd`）：

GEN 先调 **1 次** `builder.device.models.get`，再查库（白名单必带）：

```bash
python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-device-recommend/scripts/lookup_catalog.py' 2>/dev/null | head -1)" --roles gateway light motion contact leak gas --country XX --lang YY --limit 3 --allowed-models MODEL_A MODEL_B
```

`XX` 来自会话里整段 `{"country_code":"US"}` 或 `metadata.country_code`（大写）。都没有则去掉 `--country`。`YY` 跟用户话：`en` / `cn`。禁止写死 `CN`。`MODEL_*` 来自 `models.get` 的 `device_models`（优先 `data.device_models`）。空数组不要查库。stdout 无该 role 的 item → 跳过该行。该 JSON 条不是用户问题，不要回复。

组好清单后、artifact 前，再跑 **1 次**（stdin 外层带 model 真实房间和清单，禁止 `/tmp`）：

```bash
python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-device-recommend/scripts/validate_recommendation.py' 2>/dev/null | head -1)" -
```

stdin：`{"rooms":[...model真实Room原样...],"recommendation":{...清单根对象...}}`。FAIL 则补 `model` 或修正空间后再验；artifact content 只交内层清单，禁止带着 FAIL 调 artifact。

assemble 可直接喂 `spatial_model` / `{rooms, existingDevices}` / 房间数组；必须带本轮 `device_models`/`allowed_models`；点名房间时加 `targetRoomIds`，点名品类时加 `allowedRoles`，脚本会先收窄再出清单。

## 不做什么

不生成自动化；不调 artifact；不编造价格；不把已有设备再写进 `devices[]`；不用本地 SKU 凑行；不用旧形状 `rooms[].items` / `gatewayPlan`。  
编排调用：`artifact_tool(name="json.device", content="<清单JSON字符串>")`。`name` 恒为 `json.device`。本轮用户再要推荐 → 必须再调。
