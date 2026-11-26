#!/usr/bin/env python3
"""Match graph devices to a simplified standard scene (sales v1.2+).

按空间召回**该空间全部相关设备**（不只「要用的那几盏」）：
- 全开/全关/冷暖/亮度：空间内所有灯统一态
- 氛围类（观影/晚安/起夜）：焦点灯开/调，同空间其余灯关
- 离开类：灯+帘+影音尽量全覆盖

Studio create_scene 当前文档/样例未见原生互斥字段；互斥由 catalog
`mutex_group` 软声明（写进 description / logic_for_user），禁止臆造会炸 Studio 的字段。

产物须 Studio 可运行：
- endpoint 默认 2（有能力快照时以真实可写端点为准）
- WindowCovering.TargetPositionPercentage
- ColorTemperature 用开尔文 K（禁止 mired）
- trait value 用 bool/number
- 省略空 linkFrom（禁止写 linkFrom: []）

Usage:
  python3 match_and_build_scene.py - <<'EOF'
  {"scene":"会客","spatial_graph":{...}}
  EOF
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "assets" / "catalog.json").read_text(encoding="utf-8"))
sys.path.insert(0, str(ROOT / "scripts"))
from capability_guard import apply_studio_capability_fix, sanitize_scene  # noqa: E402
from i18n_en import (  # noqa: E402
    SCENE_EN_ALIASES,
    room_en,
    scene_display_name,
    scene_label_en,
)
from logic_summary import build_logic_for_user  # noqa: E402
from space_catalog import (  # noqa: E402
    available_scenes,
    available_spaces,
    build_graph_index,
    devices_for_target,
    resolve_space,
    template_for_space,
)

SCENE_ALIASES: dict[str, str] = {}
_DUP_LABELS = {"离开", "有人开灯无人关灯"}
for _row in CATALOG.get("scenes") or []:
    _sid = str(_row.get("id") or "")
    if not _sid:
        continue
    SCENE_ALIASES[_sid] = _sid
    label = str(_row.get("label") or "")
    send = str(_row.get("send") or "")
    space = str(_row.get("space") or "")
    if send:
        SCENE_ALIASES[send] = _sid
        SCENE_ALIASES[send.replace("按标准场景输出", "", 1)] = _sid
    if space and label:
        SCENE_ALIASES[f"{space}{label}"] = _sid
        SCENE_ALIASES[f"按标准场景输出{space}{label}"] = _sid
        SCENE_ALIASES[f"{space}·{label}"] = _sid
    # 非重名 label 才直接挂短名，避免「离开」歧义
    if label and label not in _DUP_LABELS:
        SCENE_ALIASES[label] = _sid
        SCENE_ALIASES[f"{label}场景"] = _sid
        SCENE_ALIASES[f"按标准场景输出{label}"] = _sid
    for _alias in _row.get("aliases") or []:
        _alias = str(_alias).strip()
        if _alias:
            SCENE_ALIASES[_alias] = _sid
for _en, _zh in SCENE_EN_ALIASES.items():
    _sid = SCENE_ALIASES.get(_zh)
    if _sid:
        SCENE_ALIASES[_en] = _sid
        SCENE_ALIASES[_en.lower()] = _sid


DEFAULT_LIGHT_ENDPOINT = 2
# 九楼演示箱等：多路灯写点在 3/4；灯带仍在 2。无能力快照时按品名启发式，避免全写 [2] 导致 Studio Invalid。
MULTI_EP_NAME_HINTS = ("落地灯", "台灯", "射灯", "水晶", "格栅", "壁灯", "筒灯", "吸顶")
STRIP_NAME_HINTS = ("灯带", "灯膜", "灯条")
DEFAULT_CURTAIN_ENDPOINT = 2
# 单空间设备上限：够覆盖典型户型全屋灯，避免无限膨胀
SPACE_DEVICE_LIMIT = 48

DEFAULT_FOCUS_KEYWORDS = (
    "灯带",
    "背景",
    "沙发",
    "茶几",
    "电视",
    "投影",
    "氛围",
    "落地",
    "台灯",
    "床头",
    "夜灯",
    "低位",
    "洗墙",
)
DEFAULT_MAIN_KEYWORDS = (
    "主灯",
    "吸顶",
    "天花",
    "水晶",
    "筒灯",
    "格栅",
    "射灯组",
    "全开",
)


def load_payload() -> dict[str, Any]:
    if len(sys.argv) >= 2 and sys.argv[1] != "-":
        return json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def catalog_row(scene_id: str) -> dict[str, Any]:
    for row in CATALOG.get("scenes") or []:
        if row.get("id") == scene_id:
            return row
    raise SystemExit(f"FAIL unknown scene {scene_id}")


def room_name(props: dict) -> str:
    return str(props.get("name") or props.get("displayName") or "").strip()


def is_living(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("客厅", "起居", "living", "lounge"))


def is_entry(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("玄关", "入户", "门厅", "entry", "foyer"))


def is_bedroom(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("卧", "bedroom", "主人房", "次卧", "儿童房"))


def is_dining(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("餐厅", "餐桌", "dining")) and not is_kitchen(name)


def is_kitchen(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("厨房", "kitchen", "橱柜"))


def is_bath(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("卫", "浴", "洗漱", "toilet", "bath", "卫生间"))


def is_corridor(name: str) -> bool:
    n = name.lower()
    return any(k in n for k in ("走廊", "过道", "廊", "corridor", "hallway", "hall"))


def space_match(space: str, room: str, device_name: str = "") -> bool:
    space = space or ""
    blob = f"{room} {device_name}"
    if "全屋" in space:
        return True
    if "玄关" in space:
        return is_entry(blob)
    if "客厅" in space:
        return is_living(blob)
    if "餐厅" in space:
        return is_dining(blob) or ("餐" in blob and not is_kitchen(blob))
    if "厨房" in space:
        return is_kitchen(blob)
    if "卧" in space:
        return is_bedroom(blob)
    if "卫" in space:
        return is_bath(blob)
    if "走廊" in space or "过道" in space:
        return is_corridor(blob)
    return False


def classify_kinds(name: str, types: list[str], model: str) -> set[str]:
    kinds: set[str] = set()
    joined = " ".join([name, model] + [str(t) for t in types]).lower()
    type_l = {str(t).lower() for t in types}
    if "light" in type_l or any(
        k in name for k in ("灯", "灯带", "射灯", "格栅", "落地灯", "台灯", "筒灯", "吸顶")
    ):
        kinds.add("light")
    if "hub" in type_l:
        return kinds
    if "speaker" in type_l or any(k in joined for k in ("speaker", "音箱", "音响", "sonos", "小乔")):
        kinds.add("speaker")
    # 演示箱窗帘是继电器开关，只有 OnOff；写 TargetPositionPercentage 会被 Studio 拒
    if "windowcovering" in type_l or "curtain" in joined:
        kinds.add("curtain")
    elif "帘" in name and "switch" in type_l:
        kinds.add("curtain_switch")
    elif "帘" in name and "light" not in kinds:
        kinds.add("curtain")
    if "light" not in kinds and any(k in name for k in ("电视", "投影", "盒子")):
        kinds.add("av")
    return kinds


def parse_graph(graph: dict[str, Any]) -> tuple[dict[str, dict], list[dict]]:
    index = build_graph_index(graph)
    return index["spaces"], index["devices"]


def guess_light_endpoints(device: dict[str, Any] | None = None, device_id: str = "") -> list[int]:
    """Pick endpointIds: prefer graph hints, else name heuristic, else default 2."""
    del device_id
    if isinstance(device, dict):
        for key in ("endpointIds", "lightEndpointIds", "writableEndpoints"):
            raw = device.get(key)
            if isinstance(raw, list) and raw:
                try:
                    return [int(x) for x in raw]
                except (TypeError, ValueError):
                    pass
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                return [int(raw)]
        name = str(device.get("name") or "")
        if any(k in name for k in STRIP_NAME_HINTS):
            return [DEFAULT_LIGHT_ENDPOINT]
        if any(k in name for k in MULTI_EP_NAME_HINTS):
            return [3, 4]
    return [DEFAULT_LIGHT_ENDPOINT]


def action_onoff(
    device_id: str,
    value: bool,
    aid: str,
    *,
    endpoint_ids: list[int] | None = None,
) -> dict:
    eps = endpoint_ids or [DEFAULT_LIGHT_ENDPOINT]
    return {
        "type": "device.trait.write",
        "functionCode": "Output",
        "traitCode": "OnOff",
        "targets": [{"deviceId": device_id, "endpointIds": list(eps)}],
        "value": value,
        "id": aid,
    }


def action_level(
    device_id: str,
    level: int,
    aid: str,
    *,
    endpoint_ids: list[int] | None = None,
) -> dict:
    eps = endpoint_ids or [DEFAULT_LIGHT_ENDPOINT]
    return {
        "type": "device.trait.write",
        "functionCode": "LevelControl",
        "traitCode": "CurrentLevel",
        "targets": [{"deviceId": device_id, "endpointIds": list(eps)}],
        "value": int(max(0, min(100, level))),
        "id": aid,
    }


def action_ct(
    device_id: str,
    kelvin: int,
    aid: str,
    *,
    endpoint_ids: list[int] | None = None,
) -> dict:
    # Studio ColorTemperature 单位是开尔文 K（罗航 2026-11）；禁止再写 mired。
    eps = endpoint_ids or [DEFAULT_LIGHT_ENDPOINT]
    return {
        "type": "device.trait.write",
        "functionCode": "ColorControl",
        "traitCode": "ColorTemperature",
        "targets": [{"deviceId": device_id, "endpointIds": list(eps)}],
        "value": int(max(1000, min(20000, kelvin))),
        "id": aid,
    }


def _apply_covers(
    curtains: list[dict],
    curtain_switches: list[dict],
    *,
    percent: int,
    switch_on: bool,
    nid,
    actions: list[dict],
    limit: int,
) -> None:
    """行程窗帘写位置；继电器窗帘（演示箱）只写 OnOff。"""
    for d in curtains[:limit]:
        actions.append(action_curtain(d["controlId"], percent, nid()))
    for d in curtain_switches[:limit]:
        actions.append(action_onoff(d["controlId"], switch_on, nid(), endpoint_ids=[2]))


def _apply_power_offs(devices: list[dict], *, nid, actions: list[dict], limit: int) -> None:
    """只关确认有 OnOff 的影音开关。音箱/网关不写（Studio 无 Output.OnOff）。"""
    for d in devices[:limit]:
        kinds = set(d.get("kinds") or set())
        if "speaker" in kinds or "hub" in kinds:
            continue
        if "av" in kinds:
            actions.append(action_onoff(d["controlId"], False, nid(), endpoint_ids=[2]))


def action_curtain(device_id: str, percent: int, aid: str) -> dict:
    return {
        "type": "device.trait.write",
        "functionCode": "WindowCovering",
        "traitCode": "TargetPositionPercentage",
        "targets": [{"deviceId": device_id, "endpointIds": [DEFAULT_CURTAIN_ENDPOINT]}],
        "value": int(max(0, min(100, percent))),
        "id": aid,
    }


def pick_devices(devices: list[dict], space: str, kind: str) -> list[dict]:
    out = [
        d
        for d in devices
        if kind in d.get("kinds", set())
        and space_match(space, str(d.get("roomName") or ""), str(d.get("name") or ""))
    ]
    if out:
        return out
    if "全屋" in space:
        return [d for d in devices if kind in d.get("kinds", set())]
    return []


def _nid_factory(prefix: str = "action"):
    n = 0

    def nid() -> str:
        nonlocal n
        n += 1
        return f"{prefix}-{n}"

    return nid


def _name_hit(dev: dict, keywords: tuple[str, ...] | list[str]) -> bool:
    name = str(dev.get("name") or "")
    return any(k in name for k in keywords)


def is_ambient_light(dev: dict, focus_keywords: list[str] | None = None) -> bool:
    keys = tuple(focus_keywords) if focus_keywords else DEFAULT_FOCUS_KEYWORDS
    return _name_hit(dev, keys)


def is_main_light(dev: dict) -> bool:
    return _name_hit(dev, DEFAULT_MAIN_KEYWORDS)


def partition_lights(
    lights: list[dict],
    *,
    focus_keywords: list[str] | None = None,
) -> tuple[list[dict], list[dict]]:
    """Split space lights into focus (keep/adjust) vs rest (通常关掉)."""
    if not lights:
        return [], []
    ambient = [d for d in lights if is_ambient_light(d, focus_keywords)]
    if ambient:
        focus = ambient
        rest = [d for d in lights if d not in focus]
        return focus, rest
    # 没有氛围灯时：主灯当 rest，其余当 focus；若全是主灯则全部做 focus（降级）
    mains = [d for d in lights if is_main_light(d)]
    if mains and len(mains) < len(lights):
        rest = mains
        focus = [d for d in lights if d not in rest]
        return focus, rest
    return list(lights), []


def mutex_peers(scene_id: str, mutex_group: str | None) -> list[str]:
    if not mutex_group:
        return []
    peers: list[str] = []
    for row in CATALOG.get("scenes") or []:
        if row.get("mutex_group") != mutex_group:
            continue
        sid = str(row.get("id") or "")
        if not sid or sid == scene_id:
            continue
        space = str(row.get("space") or "")
        label = str(row.get("label") or sid)
        peers.append(f"{space}{label}" if label in _DUP_LABELS else label)
    return peers


def _apply_lights(
    lights: list[dict],
    *,
    on: bool | None = None,
    level: int | None = None,
    kelvin: int | None = None,
    nid,
    actions: list[dict],
    limit: int = SPACE_DEVICE_LIMIT,
) -> None:
    for d in lights[:limit]:
        eps = guess_light_endpoints(d)
        if on is False:
            actions.append(action_onoff(d["controlId"], False, nid(), endpoint_ids=eps))
            continue
        if on is True:
            actions.append(action_onoff(d["controlId"], True, nid(), endpoint_ids=eps))
        if level is not None:
            actions.append(action_level(d["controlId"], level, nid(), endpoint_ids=eps))
        if kelvin is not None:
            actions.append(action_ct(d["controlId"], kelvin, nid(), endpoint_ids=eps))


def _apply_focus_rest(
    lights: list[dict],
    *,
    focus_keywords: list[str] | None,
    level: int,
    kelvin: int,
    nid,
    actions: list[dict],
    notes: list[str],
    off_outside_space: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """Turn off rest (+ optional outside), then set focus lights."""
    focus, rest = partition_lights(lights, focus_keywords=focus_keywords)
    outside = off_outside_space or []
    _apply_lights(outside, on=False, nid=nid, actions=actions)
    _apply_lights(rest, on=False, nid=nid, actions=actions)
    _apply_lights(focus, on=True, level=level, kelvin=kelvin, nid=nid, actions=actions)
    if rest:
        notes.append(f"同空间非焦点灯已关 {len(rest[:SPACE_DEVICE_LIMIT])} 路，避免抢光。")
    if outside:
        notes.append(f"其它空间灯已关 {len(outside[:SPACE_DEVICE_LIMIT])} 路。")
    if not rest and len(focus) == len(lights):
        notes.append("未识别出氛围/焦点灯与主灯差异，已对空间内灯统一调暗（降级）。")
    return focus, rest


def build_basic(
    row: dict[str, Any],
    devices: list[dict],
    selected_devices: list[dict] | None = None,
    target_node_type: str | None = None,
) -> tuple[str, dict | None, list[str], list[str]]:
    label = str(row.get("label") or row.get("id"))
    space = str(row.get("space") or "")
    effect = str(row.get("effect") or "space_on_100")
    core = str(row.get("core") or "灯")
    need = str(row.get("need") or "")
    coverage = str(row.get("coverage") or "all")
    focus_keywords = row.get("focus_keywords")
    if not isinstance(focus_keywords, list):
        focus_keywords = None
    else:
        focus_keywords = [str(k) for k in focus_keywords if k]

    notes: list[str] = [f"按空间「{space}」召回**全部**相关设备，基础场景「{label}」。"]
    if need:
        notes.append(need)
    missing: list[str] = []
    nid = _nid_factory(f"std_{row.get('id') or 'scene'}")
    actions: list[dict] = []

    scoped = selected_devices
    lights = (
        [d for d in scoped if "light" in d.get("kinds", set())]
        if scoped is not None
        else pick_devices(devices, space, "light")
    )
    curtains = (
        [d for d in scoped if "curtain" in d.get("kinds", set())]
        if scoped is not None
        else pick_devices(devices, space, "curtain")
    )
    curtain_switches = (
        [d for d in scoped if "curtain_switch" in d.get("kinds", set())]
        if scoped is not None
        else pick_devices(devices, space, "curtain_switch")
    )
    speakers = (
        [d for d in scoped if "speaker" in d.get("kinds", set())]
        if scoped is not None
        else pick_devices(devices, space, "speaker")
    )
    avs = (
        [d for d in scoped if "av" in d.get("kinds", set())]
        if scoped is not None
        else pick_devices(devices, space, "av")
    )

    is_zone_target = target_node_type == "Zone"

    # 全屋白天/晚上/离家：Room/WholeHome 可覆盖全屋；Zone 永远保持局部边界
    if effect in ("day_mode", "night_mode", "all_off") and not is_zone_target:
        lights = [d for d in devices if "light" in d.get("kinds", set())]
        curtains = [d for d in devices if "curtain" in d.get("kinds", set())]
        curtain_switches = [d for d in devices if "curtain_switch" in d.get("kinds", set())]
        speakers = [d for d in devices if "speaker" in d.get("kinds", set())]
        avs = [d for d in devices if "av" in d.get("kinds", set())]

    lim = SPACE_DEVICE_LIMIT

    if effect == "entry_welcome":
        if not is_zone_target:
            lights = pick_devices(devices, "玄关", "light") or pick_devices(devices, "客厅", "light")
        _apply_lights(lights, on=True, level=80, kelvin=3500, nid=nid, actions=actions)
    elif effect == "all_off":
        _apply_lights(lights, on=False, nid=nid, actions=actions)
        _apply_covers(curtains, curtain_switches, percent=0, switch_on=False, nid=nid, actions=actions, limit=lim)
        _apply_power_offs(avs, nid=nid, actions=actions, limit=lim)
    elif effect == "living_bright":
        _apply_lights(lights, on=True, level=100, kelvin=5000, nid=nid, actions=actions)
    elif effect == "space_on_100":
        _apply_lights(lights, on=True, level=100, kelvin=4000, nid=nid, actions=actions)
    elif effect == "space_off":
        _apply_lights(lights, on=False, nid=nid, actions=actions)
    elif effect == "target_reading":
        _apply_lights(lights, on=True, level=70, kelvin=4000, nid=nid, actions=actions)
    elif effect == "target_on":
        _apply_lights(lights, on=True, level=100, nid=nid, actions=actions)
    elif effect == "target_off":
        _apply_lights(lights, on=False, nid=nid, actions=actions)
    elif effect == "space_cool":
        _apply_lights(lights, on=True, level=80, kelvin=5000, nid=nid, actions=actions)
    elif effect == "space_warm":
        _apply_lights(lights, on=True, level=80, kelvin=3000, nid=nid, actions=actions)
    elif effect == "space_level_50":
        _apply_lights(lights, on=True, level=50, kelvin=4000, nid=nid, actions=actions)
    elif effect == "space_level_25":
        _apply_lights(lights, on=True, level=25, kelvin=3500, nid=nid, actions=actions)
    elif effect == "living_leave":
        _apply_lights(lights, on=False, nid=nid, actions=actions)
        _apply_covers(curtains, curtain_switches, percent=0, switch_on=False, nid=nid, actions=actions, limit=lim)
        _apply_power_offs(avs, nid=nid, actions=actions, limit=lim)
    elif effect == "living_movie":
        # 观影：焦点氛围灯微亮；同空间主灯关；其它空间灯也关；关帘；停音箱；影音开
        outside = [] if is_zone_target else [
            d for d in devices if "light" in d.get("kinds", set()) and d not in lights
        ]
        focus, _rest = _apply_focus_rest(
            lights,
            focus_keywords=focus_keywords
            or ["灯带", "背景", "沙发", "电视", "投影", "氛围", "洗墙", "低位"],
            level=10,
            kelvin=5000,
            nid=nid,
            actions=actions,
            notes=notes,
            off_outside_space=outside,
        )
        _apply_covers(curtains, curtain_switches, percent=0, switch_on=False, nid=nid, actions=actions, limit=lim)
        if speakers:
            notes.append("已跳过音箱：演示箱音箱没有开关写点，写 OnOff 会被 Studio 拒绝。")
        if avs:
            for d in avs[:lim]:
                actions.append(action_onoff(d["controlId"], True, nid(), endpoint_ids=[2]))
            notes.append("已识别影音开关，只写 OnOff；网关不写。")
        else:
            missing.append("电视或视频盒子控制")
            notes.append("未找到电视/盒子，已跳过片源相关动作。")
        if not focus and lights:
            notes.append("未识别氛围灯，已用客厅灯做降级观影光。")
    elif effect == "focus_dim":
        # 品鉴/冥想等：只动当前空间，复用焦点灯逻辑。不关全屋、不开电视、不写音箱。
        try:
            level = int(row.get("focus_level") or 20)
        except (TypeError, ValueError):
            level = 20
        try:
            kelvin = int(row.get("focus_kelvin") or 3000)
        except (TypeError, ValueError):
            kelvin = 3000
        _apply_focus_rest(
            lights,
            focus_keywords=focus_keywords or ["灯带", "射灯", "氛围", "台灯"],
            level=level,
            kelvin=kelvin,
            nid=nid,
            actions=actions,
            notes=notes,
        )
        if row.get("close_cover"):
            _apply_covers(
                curtains,
                curtain_switches,
                percent=0,
                switch_on=False,
                nid=nid,
                actions=actions,
                limit=lim,
            )
    elif effect == "dining_bright":
        _apply_lights(lights, on=True, level=100, kelvin=5000, nid=nid, actions=actions)
    elif effect == "dining_warm":
        _apply_lights(lights, on=True, level=60, kelvin=3000, nid=nid, actions=actions)
    elif effect == "morning":
        _apply_lights(lights, on=True, level=60, kelvin=4500, nid=nid, actions=actions)
        _apply_covers(curtains, curtain_switches, percent=80, switch_on=True, nid=nid, actions=actions, limit=lim)
    elif effect == "night_sleep":
        _apply_focus_rest(
            lights,
            focus_keywords=focus_keywords or ["灯带", "床头", "夜灯", "台灯", "氛围", "低位"],
            level=10,
            kelvin=2703,
            nid=nid,
            actions=actions,
            notes=notes,
        )
        _apply_covers(curtains, curtain_switches, percent=0, switch_on=False, nid=nid, actions=actions, limit=lim)
        _apply_power_offs(avs, nid=nid, actions=actions, limit=lim)
    elif effect == "night_dim":
        _apply_focus_rest(
            lights,
            focus_keywords=focus_keywords or ["灯带", "床头", "夜灯", "台灯", "氛围", "低位"],
            level=15,
            kelvin=2703,
            nid=nid,
            actions=actions,
            notes=notes,
        )
    elif effect == "presence_on":
        _apply_lights(lights, on=True, level=70, kelvin=4000, nid=nid, actions=actions)
        notes.append("基础版先做成「开灯」场景；完整「有人开/无人关」需人感自动化，可后续增强。")
    elif effect == "alert":
        _apply_lights(lights, on=True, level=100, kelvin=5000, nid=nid, actions=actions)
        notes.append("基础版用灯全亮提示告警；烟雾/水浸触发需后续接传感器。")
    elif effect == "day_mode":
        _apply_lights(lights, on=True, level=80, kelvin=5000, nid=nid, actions=actions)
    elif effect == "night_mode":
        _apply_lights(lights, on=True, level=30, kelvin=3000, nid=nid, actions=actions)
    else:
        # 未知 effect：仍按空间全覆盖开灯，避免漏设备
        _apply_lights(lights, on=True, level=80, kelvin=4000, nid=nid, actions=actions)
        notes.append(f"未识别 effect={effect}，已按空间全灯中性态降级。")

    # coverage=focus_off_rest 但 effect 未走专用分支时的兜底（catalog 显式声明）
    if coverage == "focus_off_rest" and effect not in ("living_movie", "night_sleep", "night_dim"):
        notes.append("coverage=focus_off_rest 已由专用 effect 处理或将在后续扩展。")

    notes.append(
        f"本场景覆盖：灯 {len(lights)} / 帘 {len(curtains)} / 音箱 {len(speakers)} / 影音 {len(avs)}。"
    )

    if not lights and not actions:
        return "UNMET", None, [core], notes + ["当前图谱在该空间没有可用灯具。"]

    if not lights:
        missing.append(core)

    status = "OK" if lights and not missing else "DEGRADED"
    if effect in ("presence_on", "alert"):
        status = "DEGRADED"

    mutex_group = str(row.get("mutex_group") or "") or None
    peers = mutex_peers(str(row.get("id") or ""), mutex_group)
    desc = f"标准场景·{space}·{label}"
    if mutex_group:
        desc += f"；互斥组={mutex_group}"
        if peers:
            peer_txt = "、".join(peers[:8])
            notes.append(f"软互斥：与「{peer_txt}」不宜同时开启（Studio 无原生互斥字段，仅产品层声明）。")

    scene = {
        "name": label if label not in ("离开", "有人开灯无人关灯") else f"{space}{label}",
        "configFormat": "JSON_SCENE",
        "createTime": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "config": {
            "metadata": {
                "name": label if label not in ("离开", "有人开灯无人关灯") else f"{space}{label}",
                "scope": [],
                "variables": [],
                "description": desc,
            },
            "actions": actions,
        },
    }
    # Prefer unique display name from send when label duplicates
    send = str(row.get("send") or "")
    if send.startswith("按标准场景输出"):
        pretty = send.replace("按标准场景输出", "", 1)
        if pretty:
            scene["name"] = pretty
            scene["config"]["metadata"]["name"] = pretty

    return status, scene, missing, notes


def recommend_text(missing: list[str], row: dict[str, Any] | None = None) -> list[str]:
    lines = []
    for m in missing:
        lines.append(f"- {m}：该空间还缺这类设备，补上后效果更完整。")
    if row and row.get("core") and not missing:
        lines.append(f"- {row['core']}：完整效果需要该能力。")
    return lines


def resolve_scene_id(raw_scene: str) -> str | None:
    raw_scene = (raw_scene or "").strip()
    if not raw_scene:
        return None
    if raw_scene in SCENE_ALIASES:
        return SCENE_ALIASES[raw_scene]
    if raw_scene.startswith("按标准场景输出"):
        label = raw_scene.replace("按标准场景输出", "", 1).strip()
        if label in SCENE_ALIASES:
            return SCENE_ALIASES[label]
    lowered = raw_scene.lower().strip()
    if lowered in SCENE_ALIASES:
        return SCENE_ALIASES[lowered]
    best = None
    best_len = 0
    for key, sid in SCENE_ALIASES.items():
        if not key:
            continue
        # Prefer Chinese catalog keys; also accept longer English phrases.
        if key in raw_scene and len(key) > best_len:
            best = sid
            best_len = len(key)
        elif key.isascii() and key.lower() in lowered and len(key) > best_len:
            best = sid
            best_len = len(key)
    return best


def _selection_from_send(raw_scene: str) -> tuple[str, str]:
    prefix = "按标准场景输出"
    if not raw_scene.startswith(prefix):
        return "", ""
    value = raw_scene[len(prefix) :].strip()
    if "·" not in value:
        return "", ""
    return tuple(value.rsplit("·", 1))  # type: ignore[return-value]


def _dynamic_scene_id(
    graph: dict[str, Any],
    selector: str,
    label: str,
    index: dict[str, Any],
) -> str | None:
    result = available_scenes(graph, CATALOG, selector, index=index)
    for scene in result.get("scenes") or []:
        if label in (scene.get("label"), scene.get("scene_id")):
            return str(scene["scene_id"])
    return None


def main() -> int:
    payload = load_payload()
    graph = payload.get("spatial_graph") or payload.get("graph") or payload
    if "nodes" not in graph:
        print(json.dumps({"status": "UNMET", "error": "spatial_graph missing nodes"}, ensure_ascii=False))
        return 1

    op = str(payload.get("op") or "build")
    if op == "list_spaces":
        out = available_spaces(
            graph,
            CATALOG,
            page=int(payload.get("page") or 1),
            page_size=int(payload.get("page_size") or 3),
        )
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 0

    target_selector = str(
        payload.get("target_node_id") or payload.get("target_selector") or ""
    ).strip()
    if op == "list_scenes":
        out = available_scenes(
            graph,
            CATALOG,
            target_selector,
            page=int(payload.get("page") or 1),
        )
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 0 if out.get("status") == "OK" else 2

    lang = str(payload.get("lang") or payload.get("language") or "cn").strip().lower()
    use_en = lang.startswith("en")
    raw_scene = str(
        payload.get("scene_id") or payload.get("scene") or payload.get("name") or ""
    ).strip()
    index = build_graph_index(graph)
    send_selector, send_label = _selection_from_send(raw_scene)
    if not target_selector and send_selector:
        target_selector = send_selector
    scene_id = (
        _dynamic_scene_id(graph, target_selector, send_label, index)
        if target_selector and send_label
        else resolve_scene_id(raw_scene)
    )
    if not scene_id:
        print(json.dumps({"status": "UNMET", "error": f"unknown scene {raw_scene}"}, ensure_ascii=False))
        return 1

    row = dict(catalog_row(scene_id))
    # 简化版：一律经典 JSON_SCENE，不再走照明库 MCP
    devices = index["devices"]
    selected_devices = None
    target = resolve_space(index, target_selector) if target_selector else None
    if target_selector and not target:
        out = {"status": "UNMET", "error": "target space not found", "scene": None}
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 2
    if target:
        template_id = template_for_space(CATALOG, target)
        if row.get("category") != template_id:
            out = {
                "status": "UNMET",
                "error": "scene is not available for target space",
                "scene": None,
            }
            print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
            return 2
        row["space"] = target["display_name"]
        row["send"] = f"按标准场景输出{target['display_name']}·{row.get('label') or scene_id}"
        selected_devices = devices_for_target(index, target["node_id"])
    elif row.get("category") in ("reading", "generic"):
        out = {"status": "UNMET", "error": "target space required", "scene": None}
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 2

    status, scene, missing, notes = build_basic(
        row,
        devices,
        selected_devices,
        target_node_type=str(target.get("node_type") or "") if target else None,
    )

    logic_for_user = ""
    if scene is not None:
        guard_devices = selected_devices if target else devices
        capability_snapshot = (
            payload.get("device_capabilities")
            or payload.get("capability_snapshot")
            or payload.get("deviceCapabilities")
        )
        scene, guard_notes = sanitize_scene(
            scene,
            devices=guard_devices,
            capability_snapshot=capability_snapshot,
        )
        notes = list(notes or []) + guard_notes
        scene, fix_notes = apply_studio_capability_fix(
            scene,
            capability_snapshot=capability_snapshot,
        )
        notes = list(notes or []) + fix_notes
        acts = ((scene or {}).get("config") or {}).get("actions") or []
        if not acts:
            status = "UNMET"
            missing = list(missing or []) + ["无有效可写能力动作（能力消毒后为空）"]
            scene = None
        else:
            mutex_group = str(row.get("mutex_group") or "") or None
            peers = mutex_peers(scene_id, mutex_group)
            display_label = str(scene.get("name") or row.get("label") or scene_id)
            peer_labels = list(peers)
            if use_en:
                zh_label = str(row.get("label") or "")
                zh_space = str(row.get("space") or "")
                display_label = scene_display_name(zh_space, zh_label)
                scene["name"] = display_label
                meta = (scene.get("config") or {}).get("metadata")
                if isinstance(meta, dict):
                    meta["name"] = display_label
                    meta["description"] = (
                        f"Standard scene · {scene_display_name(zh_space, zh_label)}"
                        + (
                            f"; mutex group = {mutex_group}"
                            if mutex_group
                            else ""
                        )
                    )
                peer_labels = [scene_label_en(p) for p in peers]
            logic_for_user = build_logic_for_user(
                label=display_label,
                need="" if use_en else str(row.get("need") or ""),
                trigger_hint="" if use_en else str(row.get("trigger_hint") or ""),
                actions=acts,
                status=status,
                mutex_peers=peer_labels,
                lang="en" if use_en else "cn",
            )

    out = {
        "status": status,
        "scene_id": scene_id,
        "label": (
            scene_label_en(str(row.get("label") or ""))
            if use_en
            else row.get("label")
        ),
        "space": room_en(str(row.get("space") or "")) if use_en else row.get("space"),
        "mutex_group": row.get("mutex_group"),
        "lighting_profile": None,
        "trigger_hint": row.get("trigger_hint"),
        "scene": scene,
        "logic_for_user": logic_for_user,
        "missing": missing,
        "notes": notes,
        "recommend": recommend_text(missing, row) if missing or status != "OK" else [],
        "device_count": len(devices),
    }
    print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0 if status in ("OK", "DEGRADED") else 2


if __name__ == "__main__":
    raise SystemExit(main())
