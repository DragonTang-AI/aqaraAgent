#!/usr/bin/env python3
"""缺口补全。stdin: 房间列表 / {rooms,existingDevices} / spatial_model|graph。stdout JSON。"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
PICKS_PATH = ROOT / "assets" / "default-picks.json"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from resource_lib import extract_country_code  # noqa: E402
from lookup_catalog import overlay_picks  # noqa: E402

ROLE_ALIASES = {
    "客厅": "客厅", "起居室": "客厅", "卧室": "卧室", "主卧": "主卧", "次卧": "卧室",
    "书房": "默认", "厨房": "厨房", "卫生间": "卫生间", "主卫": "主卫", "次卫": "卫生间",
    "洗手间": "卫生间", "阳台": "阳台", "玄关": "默认", "餐厅": "默认",
    "living": "客厅", "living room": "客厅", "bedroom": "卧室", "kitchen": "厨房",
    "bath": "卫生间", "bathroom": "卫生间", "balcony": "阳台",
}
TIER_ALIASES = {
    "1": "basic", "精简": "basic", "入门": "basic", "安防": "basic",
    "essential": "basic", "basic": "basic", "2": "standard", "标准": "standard",
    "舒适": "standard", "comfort": "standard", "standard": "standard", "3": "plus",
    "进阶": "plus", "全屋": "plus", "full": "plus", "plus": "plus", "综合舒适": "plus",
}
TYPE_TO_ROLE = {
    "Gateway": "gateway", "Hub": "gateway", "MotionSensor": "motion",
    "OccupancySensor": "motion", "Light": "light", "Switch": "switch",
    "ContactSensor": "contact", "MagnetSensor": "contact",
    "WaterLeakSensor": "leak", "NaturalGasAlarm": "gas",
    "TemperatureSensor": "climate", "HumiditySensor": "climate",
    "AtmosphericPressureSensor": "climate",
}


def _area(raw) -> float:
    try:
        a = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return round(a / 1e6, 2) if a > 10000 else round(a, 2)


def _bare(raw) -> str:
    text = str(raw or "")
    return text.split(":", 1)[-1] if ":" in text else text


def _exist(d, **extra) -> dict:
    return {
        "deviceId": d.get("deviceId") or d.get("id"),
        "name": d.get("name") or "",
        "model": d.get("model") or d.get("resourceId") or "",
        "deviceTypes": d.get("deviceTypes") or d.get("deviceTypesList") or [],
        **extra,
    }


def _row(seq, room_id, room_name, src, qty, rationale, **over) -> dict:
    return {
        "seq": seq, "roomId": room_id, "roomName": room_name,
        "deviceType": src["deviceType"], "spuId": src.get("spuId"),
        "productName": src["productName"], "model": src["model"],
        "protocols": list(src.get("protocols") or []),
        "needsGateway": bool(src.get("needsGateway", True)),
        "qty": qty, "rationale": rationale, **over,
    }


def match_role(room_name: str, picks: dict) -> str:
    by = picks["byRoomRole"]
    if room_name in by:
        return room_name
    base = re.sub(r"[①②③④⑤⑥⑦⑧⑨⑩\d\-_\s]+$", "", room_name).strip()
    if base in by:
        return base
    for key, canon in ROLE_ALIASES.items():
        if key in room_name:
            return canon if canon in by else "默认"
    return "默认"


def classify_role(dev: dict) -> str:
    for t in dev.get("deviceTypes") or []:
        if t in TYPE_TO_ROLE:
            return TYPE_TO_ROLE[t]
    model, name = (dev.get("model") or "").lower(), dev.get("name") or ""
    if "gateway" in model or "网关" in name or "hub" in model or "边端" in name:
        return "gateway"
    if "motion" in model or "occupy" in model or "人体" in name or "存在" in name:
        return "motion"
    if ".light." in model or ("灯" in name and "开关" not in name):
        return "light"
    if ".switch." in model or "开关" in name:
        return "switch"
    if "magnet" in model or "contact" in model or "门窗" in name or "门磁" in name:
        return "contact"
    if "wleak" in model or "flood" in model or "水浸" in name:
        return "leak"
    if "natgas" in model or "sensor_gas" in model or "燃气" in name or "天然气" in name:
        return "gas"
    if "weather" in model or "sensor_ht" in model or "温湿" in name:
        return "climate"
    return ""


def is_smart_light(dev: dict) -> bool:
    model, name = (dev.get("model") or "").lower(), dev.get("name") or ""
    if model.startswith(("lumi.", "aqara.")) or ".light." in model or ".dimmer." in model:
        return True
    return "智能" in name and "灯" in name


def allow_contact(role_key: str, room: dict) -> bool:
    if room.get("openingsKnown"):
        doors, windows = int(room.get("doors") or 0), int(room.get("windows") or 0)
        return doors >= 2 or (doors + windows) >= 3
    return role_key in ("客厅", "阳台")


def apply_duplicate_labels(rooms: list[dict]) -> None:
    counts = defaultdict(int)
    for r in rooms:
        counts[r["roomName"]] += 1
    for r in rooms:
        if r.get("roomLabel"):
            continue
        name, area = r["roomName"], r.get("area")
        if counts[name] > 1 and area:
            shown = int(area) if float(area) == int(area) else area
            r["roomLabel"] = f"{name}（约{shown}㎡）"
        else:
            r["roomLabel"] = name


def choose_gateway_room(rooms: list[dict]) -> dict:
    """Bind home-level hardware to a real model room so the visualizer can place it."""
    preferred = ("玄关", "入户", "门厅", "客厅", "起居", "entry", "foyer", "living")
    for keyword in preferred:
        match = next(
            (room for room in rooms if keyword.lower() in room["roomName"].lower()),
            None,
        )
        if match:
            return match
    return rooms[0]


def pick_item(items: list, role: str):
    return next((it for it in items if it.get("role") == role), None)


def merge_openings(rooms: list[dict], by_room: dict | None) -> None:
    if not by_room:
        return
    for r in rooms:
        op = by_room.get(r["roomId"]) or by_room.get(_bare(r["roomId"])) or {}
        if not op:
            continue
        r["openingsKnown"] = True
        r["doors"] = int(op.get("doors") or 0)
        r["windows"] = int(op.get("windows") or 0)


def attach_graph_openings(g: dict, rooms: list[dict]) -> None:
    nodes = {n["id"]: n for n in g.get("nodes") or [] if isinstance(n, dict) and n.get("id")}
    by_open = {_bare(r["roomId"]): {"doors": 0, "windows": 0} for r in rooms}
    connects, belongs = defaultdict(list), {}
    for e in g.get("edges") or []:
        if not isinstance(e, dict):
            continue
        if e.get("edgeType") == "connects":
            connects[e.get("source")].append(e.get("target"))
        elif e.get("edgeType") == "belongsTo":
            belongs[e.get("source")] = _bare(e.get("target"))
    saw = False
    for n in nodes.values():
        if n.get("nodeType") == "Door":
            saw = True
            for t in connects.get(n["id"], []):
                if _bare(t) in by_open:
                    by_open[_bare(t)]["doors"] += 1
        elif n.get("nodeType") == "Window":
            saw = True
            if belongs.get(n["id"]) in by_open:
                by_open[belongs[n["id"]]]["windows"] += 1
    if saw:
        merge_openings(rooms, by_open)


def resolve_tier(raw, picks: dict) -> tuple[str, set | None, bool]:
    tiers = picks.get("budgetTiers") or {}
    text = str(raw or "").strip().lower()
    key = TIER_ALIASES.get(text, "")
    if not key:
        for alias in sorted(TIER_ALIASES, key=len, reverse=True):
            if alias and alias in text:
                key = TIER_ALIASES[alias]
                break
    if key not in tiers:
        key = "standard" if "standard" in tiers else (next(iter(tiers), "") if tiers else "")
    spec = tiers.get(key) or {}
    roles = set(spec.get("roles") or [])
    return key, (roles or None), bool(spec.get("areaQty", True))


def apply_area_qty(item: dict, area: float, role_key: str) -> tuple[int, str]:
    qty, role, note = int(item.get("qty") or 1), item.get("role") or "", ""
    rules = {
        "light": [(50.0, ("客厅",), 3, "大客厅分区主灯"), (25.0, ("客厅", "默认"), 2, "面积较大，主灯分区")],
        "motion": [(40.0, ("客厅", "默认"), 3, "大空间补点，覆盖更多动线"), (25.0, ("客厅", "主卧", "卧室", "默认"), 2, "面积较大，建议双点位覆盖")],
        "switch": [(30.0, ("客厅", "主卧", "卧室"), 2, "大房间多回路，便于分区控制")],
        "contact": [(20.0, ("客厅", "阳台"), 2, "多门窗房间建议增加门磁")],
    }
    for threshold, roles, target, msg in rules.get(role, []):
        if area >= threshold and (not roles or role_key in roles) and target > qty:
            return target, msg
    return qty, note


def rooms_from_list(data: list) -> list[dict]:
    rooms = []
    for r in data:
        area = r.get("area") if r.get("area") is not None else r.get("area_m2")
        room = {
            "roomId": str(r.get("roomId") or r.get("id") or ""),
            "roomName": str(r.get("roomName") or r.get("displayName") or r.get("name") or "房间"),
            "area": _area(area),
        }
        if r.get("label"):
            room["roomLabel"] = str(r["label"])
        if "doors" in r or "windows" in r or r.get("openingsKnown"):
            room["openingsKnown"] = True
            room["doors"] = int(r.get("doors") or 0)
            room["windows"] = int(r.get("windows") or 0)
        rooms.append(room)
    return rooms


def from_spatial_model(m: dict) -> tuple[list[dict], list[dict]]:
    rooms, existing = [], []
    for lv in m.get("levels") or []:
        for r in lv.get("rooms") or []:
            rooms.append({"roomId": str(r.get("id") or ""), "roomName": str(r.get("name") or r.get("displayName") or "房间"), "area": _area(r.get("area"))})
        for d in lv.get("devices") or []:
            if isinstance(d, dict):
                existing.append(_exist(d, roomId=str(d.get("roomId") or d.get("hostId") or ""), hostId=str(d.get("hostId") or "")))
    names = {r["roomId"]: r["roomName"] for r in rooms}
    for e in existing:
        if e["roomId"] in names:
            e["roomName"] = names[e["roomId"]]
        elif e.get("hostId") in names:
            e["roomId"], e["roomName"] = e["hostId"], names[e["hostId"]]
        else:
            e["roomName"] = ""
    return rooms, existing


def from_spatial_graph(g: dict) -> tuple[list[dict], list[dict]]:
    nodes = {n["id"]: n for n in g.get("nodes") or [] if isinstance(n, dict) and "id" in n}
    room_name = {n["id"]: (n.get("properties") or {}).get("name") or n["id"] for n in nodes.values() if n.get("nodeType") == "Room"}
    belongs = {e.get("source"): e.get("target") for e in g.get("edges") or [] if e.get("edgeType") == "belongsTo"}
    rooms, existing = [], []
    for n in nodes.values():
        if n.get("nodeType") == "Room":
            props = n.get("properties") or {}
            rooms.append({"roomId": n["id"], "roomName": room_name.get(n["id"], ""), "area": _area(props.get("area") or props.get("area_m2"))})
        if n.get("nodeType") != "Device":
            continue
        props, room_id, rname, cur, seen = n.get("properties") or {}, None, "", belongs.get(n["id"]), set()
        while cur and cur not in seen:
            seen.add(cur)
            node = nodes.get(cur)
            if not node:
                break
            if node.get("nodeType") == "Room":
                room_id, rname = cur, room_name.get(cur, "")
                break
            cur = belongs.get(cur)
        existing.append(_exist(props, deviceId=n["id"], roomId=room_id or "", roomName=rname))
    attach_graph_openings(g, rooms)
    return rooms, existing


def _rooms_existing_from_obj(data: dict) -> tuple[list[dict], list[dict]]:
    if isinstance(data.get("spatial_model"), dict):
        rooms, existing = from_spatial_model(data["spatial_model"])
    elif isinstance(data.get("spatial_graph"), dict):
        rooms, existing = from_spatial_graph(data["spatial_graph"])
    elif "levels" in data:
        rooms, existing = from_spatial_model(data)
    elif "nodes" in data:
        rooms, existing = from_spatial_graph(data)
    else:
        rooms = rooms_from_list(data.get("rooms") or [])
        existing = [_exist(d, roomId=str(d.get("roomId") or ""), roomName=d.get("roomName") or "") for d in data.get("existingDevices") or data.get("devices") or []]
    merge_openings(rooms, (data.get("openings") or {}).get("byRoom"))
    return rooms, existing


def _as_str_set(raw) -> set[str]:
    if raw is None:
        return set()
    if isinstance(raw, str):
        text = raw.strip()
        return {text} if text else set()
    if isinstance(raw, (list, tuple, set)):
        return {str(x).strip() for x in raw if str(x).strip()}
    return set()


def load_input(
    arg: str,
) -> tuple[list[dict], list[dict], str | None, str | None, set[str], set[str], list[str] | None]:
    raw = sys.stdin.read() if arg == "-" else Path(arg).read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, list):
        return rooms_from_list(data), [], None, None, set(), set(), None
    if not isinstance(data, dict):
        raise SystemExit("input must be list or object")
    country = extract_country_code(data)
    if country is None:
        for inner in (data.get("spatial_model"), data.get("spatial_graph")):
            if isinstance(inner, dict):
                country = extract_country_code(inner)
                if country:
                    break
    rooms, existing = _rooms_existing_from_obj(data)
    target_room_ids = _as_str_set(
        data.get("targetRoomIds") if data.get("targetRoomIds") is not None else data.get("roomIds")
    )
    allowed_roles = _as_str_set(
        data.get("allowedRoles") if data.get("allowedRoles") is not None else data.get("roles")
    )
    allowed_models = None
    if (
        "allowed_models" in data
        or "device_models" in data
        or "allowedModels" in data
    ):
        raw_models = (
            data.get("allowed_models")
            if data.get("allowed_models") is not None
            else data.get("device_models")
            if data.get("device_models") is not None
            else data.get("allowedModels")
        )
        if isinstance(raw_models, str):
            allowed_models = [raw_models.strip()] if raw_models.strip() else []
        else:
            allowed_models = [str(x).strip() for x in (raw_models or []) if str(x).strip()]
    return (
        rooms,
        existing,
        country,
        data.get("budget") or data.get("tier") or data.get("intent"),
        target_room_ids,
        allowed_roles,
        allowed_models,
    )


def existing_counts(existing: list[dict]) -> tuple[int, dict, set]:
    gw, by_room, trad = 0, defaultdict(int), set()
    for d in existing:
        role = classify_role(d)
        if not role:
            continue
        if role == "gateway":
            gw += 1
            continue
        if d.get("roomId") or d.get("roomName"):
            by_room[(str(d.get("roomId") or d.get("roomName")), role)] += 1
            if d.get("roomName"):
                by_room[(d["roomName"], role)] += 1
        if role == "light" and not is_smart_light(d):
            trad.update(x for x in (str(d.get("roomId") or ""), d.get("roomName") or "") if x)
    return gw, by_room, trad


def room_have(by_room: dict, room: dict, role: str) -> int:
    return max(by_room.get((room["roomId"], role), 0), by_room.get((room["roomName"], role), 0))


def main():
    if len(sys.argv) < 2:
        print("usage: assemble_recommendation.py rooms.json|-", file=sys.stderr)
        raise SystemExit(2)
    (
        rooms,
        existing,
        country,
        tier_raw,
        target_room_ids,
        allowed_roles,
        allowed_models,
    ) = load_input(sys.argv[1])
    if target_room_ids:
        rooms = [
            r
            for r in rooms
            if str(r.get("roomId") or "") in target_room_ids
            or str(r.get("roomName") or "") in target_room_ids
            or str(r.get("roomLabel") or "") in target_room_ids
        ]
    if not rooms:
        raise SystemExit("no rooms")
    picks = json.loads(PICKS_PATH.read_text(encoding="utf-8"))
    device_source = overlay_picks(picks, country or "", allowed_models=allowed_models)
    tier_key, preset_roles, use_area = resolve_tier(tier_raw, picks)
    if not preset_roles:
        preset_roles = set(picks.get("intentPresets", {}).get("综合舒适") or []) or None
    if allowed_roles:
        # Scope filter intersects with tier preset when both exist.
        preset_roles = (
            set(preset_roles) & allowed_roles if preset_roles is not None else set(allowed_roles)
        )

    gw_have, by_room, trad = existing_counts(existing)
    apply_duplicate_labels(rooms)
    skipped, devices, recommendations, seq = [], [], [], 1

    gw = picks["gateway"]
    # Room-scoped runs should not inject a whole-home gateway unless gateway role is allowed.
    want_gateway = not allowed_roles or "gateway" in allowed_roles
    if gw_have < 1 and want_gateway and not target_room_ids:
        if not gw.get("_catalog"):
            skipped.append("该国区货架暂无网关，跳过")
        else:
            gateway_room = choose_gateway_room(rooms)
            devices.append(
                _row(
                    seq,
                    gateway_room["roomId"],
                    gateway_room["roomName"],
                    gw,
                    1,
                    gw.get("rationale") or "组网中枢",
                    needsGateway=bool(gw.get("needsGateway", False)),
                )
            )
            seq += 1
    elif gw_have >= 1:
        skipped.append(f"已有网关 {gw_have} 台，不再推荐网关")
    elif target_room_ids:
        skipped.append("已限定房间范围，跳过全屋网关推荐")
    elif allowed_roles and "gateway" not in allowed_roles:
        skipped.append("已限定品类，跳过网关推荐")

    for room in rooms:
        label = room.get("roomLabel") or room["roomName"]
        role_key = match_role(room["roomName"], picks)
        items = list(picks["byRoomRole"].get(role_key) or picks["byRoomRole"]["默认"])
        extra = set()
        if (room["roomId"] in trad or room["roomName"] in trad) and room_have(by_room, room, "switch") == 0:
            if not allowed_roles or "switch" in allowed_roles:
                extra.add("switch")
                if not pick_item(items, "switch"):
                    sw = pick_item(picks["byRoomRole"]["默认"], "switch")
                    if sw:
                        items.append(sw)
        type_counts = defaultdict(int)
        for it in items:
            role = it.get("role") or ""
            if preset_roles is not None and role not in preset_roles and role not in extra:
                continue
            if role == "contact" and not allow_contact(role_key, room):
                skipped.append(f"{label} 门少，不加门磁")
                continue
            want, area_note = apply_area_qty(it, room["area"], role_key) if use_area else (int(it.get("qty") or 1), "")
            have = room_have(by_room, room, role) if role else 0
            need = max(0, want - have)
            if need <= 0:
                skipped.append(f"{label} 已有 {role or it['deviceType']}×{have}，跳过")
                continue
            if not it.get("_catalog"):
                skipped.append(f"{label} {role or it['deviceType']} 该国区货架暂缺，跳过")
                continue
            type_counts[it["deviceType"]] += need
            if role == "switch" and role in extra:
                rationale = "已有传统灯，补墙开控灯，不再叠一盏智能灯"
            else:
                rationale = it.get("rationale") or "按房间常用能力选型"
                if have:
                    rationale = f"{rationale}；已有 {have}，再补 {need}"
                elif area_note:
                    rationale = f"{rationale}；{area_note}"
            devices.append(_row(seq, room["roomId"], room["roomName"], it, need, rationale))
            seq += 1
        recommendations.append({"roomId": room["roomId"], "roomName": room["roomName"], "area": room["area"], "deviceTypes": [{"type": k, "count": v} for k, v in type_counts.items()]})

    # Machine summary is derived from final device rows, including a gateway
    # anchored to a real Room, so frontend counts cannot drift from devices[].
    counts_by_room: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    for device in devices:
        pair = (str(device["roomId"]), str(device["roomName"]))
        counts_by_room[pair][str(device["deviceType"])] += int(device.get("qty") or 1)
    for recommendation in recommendations:
        pair = (str(recommendation["roomId"]), str(recommendation["roomName"]))
        recommendation["deviceTypes"] = [
            {"type": device_type, "count": count}
            for device_type, count in sorted(counts_by_room[pair].items())
        ]

    payload = {
        "hasRecommendedDevices": len(devices) >= 1, "totalRooms": len(recommendations),
        "totalDevices": len(devices), "recommendations": recommendations, "devices": devices,
        "country_code": country, "device_source": device_source, "budget": tier_key,
    }
    lines = ["| 房间 | 设备 | 型号 | 协议 | 需网关 | 推荐理由 |", "|------|------|------|------|--------|----------|"]
    area_by_id = {r["roomId"]: r["area"] for r in rooms}
    label_by_id = {r["roomId"]: r.get("roomLabel") or r["roomName"] for r in rooms}
    for d in devices:
        display_room = label_by_id.get(d["roomId"], d["roomName"])
        room_cell = f"{display_room} {area_by_id.get(d['roomId'])}㎡" if area_by_id.get(d["roomId"]) else display_room
        name = d["productName"] if int(d.get("qty") or 1) == 1 else f"{d['productName']} ×{d['qty']}"
        need = "是" if d.get("needsGateway") else "否"
        lines.append(f"| {room_cell} | {name} | {d['model']} | {'/'.join(d.get('protocols') or [])} | {need} | {d.get('rationale','')} |")

    if not devices:
        summary = "已按新设备库查询，该国区货架暂无待补型号，或现有设备已覆盖缺口。"
        if any((r.get("roomLabel") or r["roomName"]) != r["roomName"] for r in rooms):
            summary = "有重名房间，清单里用面积区分。" + summary
    else:
        sized = sorted(rooms, key=lambda r: r.get("area") or 0, reverse=True)
        top = "、".join(f"{(r.get('roomLabel') or r['roomName'])}约{r['area']}㎡" if r.get("area") else (r.get("roomLabel") or r["roomName"]) for r in sized[:3])
        miss = []
        joined = " ".join(r["roomName"] for r in rooms)
        if not any(k in joined for k in ("厨", "kitchen", "Kitchen")):
            miss.append("没有厨房，未配水浸和燃气")
        if not any(k in joined for k in ("卫", "bath", "Bath")):
            miss.append("没有卫生间")
        if any((r.get("roomLabel") or r["roomName"]) != r["roomName"] for r in rooms):
            miss.append("有重名房间，清单里用面积区分")
        head = "空屋按完整配置" if not existing else "按已有设备做缺口补全"
        summary = f"{head}，共 {len(rooms)} 个房间（{top}），本档 {payload['totalDevices']} 项"
        if miss:
            summary += "；" + "；".join(miss)
        summary += "。"

    print(json.dumps({"payload": payload, "markdown_table": "\n".join(lines) if devices else "", "summary_line": summary, "skipped": skipped, "existing_counts": {"gateway": gw_have, "other": len(existing)}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
