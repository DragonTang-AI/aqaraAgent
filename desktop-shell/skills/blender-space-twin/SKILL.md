---
name: blender-space-twin
description: 用 Blender 把户型图/照片/尺寸搭成可用的 3D 空间，并导出 GLB 供右侧数字孪生加载。适用于"根据户型图生成 3D 户型""把家做成数字孪生""用照片还原房间"等任务。
whenToUse: 当用户要在 Blender 里生成/修改三维空间、从户型图或照片还原房间、或需要导出 GLB 到数字孪生时。
---

# Blender 空间生成（数字孪生）

把「资料」变成「可用的三维空间」，并交付一个 GLB 给右侧数字孪生查看。

## 先决条件（先确认，不要盲目执行）
1. 调用 `blender_status`：确认 Blender 已连接（返回版本号）。若失败，提示用户：
   - 打开 Blender → 偏好设置 → 插件 → 启用「Aqara MCP Bridge」；
   - 3D 视图按 N → Aqara 面板 → Start MCP Server。
2. 确认资料：优先使用**资料库**中的户型图/照片/尺寸文件（当前项目 `library/` 目录，可直接读取）。
3. **尺寸优先级**：图纸/产品规格 > 用户口述 > 照片估算。缺失尺寸时按经验默认并**明确列出假设**。

## 坐标与单位（关键，别搞错）
- 单位统一为**米**。
- **Blender 是 Z-up**：X=宽，Y=深，Z=高。
- glTF 导出会自动转成 Y-up（Three.js 用），无需手动转换。
- 建 `add_box(name, sx, sy, sz, x, y, z)` 时：`sx`宽、`sy`深、`sz`高；`z` 填**高度中心**（如墙高 2.8，则 z=1.4）。

## 建模原则
- 先做 **地面 → 墙体 → 门洞/窗洞**，空间定下来再做柜体、家具。
- 每轮只改一个组件，保留旧对象（改名加版本后缀），不要一次性重建全场景。
- 对象命名稳定（如 `wall_living_north`、`sofa_main`），便于后续绑定设备与交互。
- 用户未确认前，**不要清空他正在编辑的场景**；新建集合（collection）放置生成内容。

## 工作流
1. `blender_status` 确认连接。
2. 读取资料（`library/` 下的图片/PDF/尺寸文本；照片用于核对形状颜色，尺寸仍以图纸为准）。
3. 生成房间规格 JSON（内部）：每间 `{name, x, y, w, d, h}`，门窗 `{wall, offset, width, height}`；写下 `assumptions`。
4. `blender_execute` 执行 bpy 脚本（见模板），先建地面与墙体。
5. `blender_execute` 加门窗洞与家具体块（沙发/床/桌/柜，先体块后细节）。
6. `blender_scene` 检查对象与相机；需要时渲染检查图到 `library/generated/preview.png`。
7. 导出 GLB：`bpy.ops.export_scene.gltf(filepath=<项目>/library/generated/<name>.glb, export_format='GLB')`。
8. 汇报：生成了什么、假设是什么、GLB 路径；提示用户在右侧「数字孪生 → 模型」加载。

## bpy 脚本模板（按需修改）
```python
import bpy, os

# ---- 参数（由你根据资料填写；单位米，Blender Z-up）----
ROOM = {"name": "living", "x": 0.0, "y": 0.0, "w": 6.0, "d": 4.5, "h": 2.8}
WALL_T = 0.12
OUT = "<项目绝对路径>/library/generated"
NAME = "space_twin"

coll = bpy.data.collections.get("AqaraGen") or bpy.data.collections.new("AqaraGen")
if coll.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(coll)

def add_box(name, sx, sy, sz, x, y, z):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    return o

w, d, h = ROOM["w"], ROOM["d"], ROOM["h"]
x0, y0 = ROOM["x"], ROOM["y"]

# 地面：X宽、Y深、Z高(0.02)
add_box("floor_" + ROOM["name"], w, d, 0.02, x0, y0, 0.0)
# 四面墙：北/南(X宽,Y厚,Z高)，东/西(X厚,Y深,Z高)
add_box("wall_n", w, WALL_T, h, x0, y0 - d/2, h/2)
add_box("wall_s", w, WALL_T, h, x0, y0 + d/2, h/2)
add_box("wall_w", WALL_T, d, h, x0 - w/2, y0, h/2)
add_box("wall_e", WALL_T, d, h, x0 + w/2, y0, h/2)

# 家具体块示例（Z 为高度）
add_box("sofa_base", 2.2, 0.9, 0.4, x0 - 1.4, y0 + 1.2, 0.2)
add_box("sofa_back", 2.2, 0.2, 0.5, x0 - 1.4, y0 + 1.6, 0.65)
add_box("table", 1.0, 0.6, 0.35, x0 - 1.4, y0 + 0.2, 0.18)
add_box("bed_frame", 1.6, 2.0, 0.3, x0 + 1.6, y0 - 0.8, 0.15)
add_box("bed_mattress", 1.5, 1.85, 0.25, x0 + 1.6, y0 - 0.8, 0.42)

os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + ".glb"), export_format="GLB", use_selection=False)
result = "exported:" + os.path.join(OUT, NAME + ".glb")
```

## 质量检查
- 单位是否米、层高 2.6–3.0m；房间是否"站得起来"（**高度在 Z 轴**）。
- 门洞是否连通、家具是否穿墙。
- 对象命名稳定、都在 `AqaraGen` 集合。
- GLB 是否导出成功（文件存在且 > 1KB）。

## 交付
- GLB 输出到 `library/generated/<name>.glb`；
- 告知用户：右侧「数字孪生」→「模型」→ 选择该 GLB 查看；
- 迭代时保留旧文件（`<name>_v2.glb`），不要覆盖。
