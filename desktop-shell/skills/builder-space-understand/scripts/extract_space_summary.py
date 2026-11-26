#!/usr/bin/env python3
"""从 spatial_graph / spatial_model 抽出房间、邻接、开口、按房设备。不对用户展示。

中台 execute（cwd=/app/.agenthub，禁止 /skills/）:
  python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-space-understand/scripts/extract_space_summary.py' 2>/dev/null | head -1)" - <<'EOF'
  {"spatial_graph":{...}}
  EOF
也可: extract_space_summary.py graph.json
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path


def bare_id(raw: str) -> str:
    text = str(raw or "")
    if ":" in text:
        return text.split(":", 1)[1]
    return text


def keep_device_id(raw: str) -> str:
    text = str(raw or "")
    if text.startswith("Device:"):
        return text
    bare = bare_id(text)
    if bare.startswith("item_"):
        return f"Device:{bare}"
    return bare


def _catalog_model(props: dict) -> str:
    resource = str(props.get("resourceId") or "")
    model = str(props.get("model") or "")
    if resource.startswith("studio:"):
        return model
    return resource or model


def _area_m2(raw) -> float:
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if val > 10000:
        return round(val / 1e6, 1)
    return round(val, 1)


def _seg_dist(px, py, x1, y1, x2, y2) -> float:
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return ((px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2) ** 0.5


def _near_boundary(px, py, boundary, thresh=350.0) -> bool:
    if not boundary or len(boundary) < 2:
        return False
    best = 1e18
    n = len(boundary)
    for i in range(n):
        a, b = boundary[i], boundary[(i + 1) % n]
        if not (isinstance(a, (list, tuple)) and isinstance(b, (list, tuple))):
            continue
        if len(a) < 2 or len(b) < 2:
            continue
        best = min(best, _seg_dist(float(px), float(py), float(a[0]), float(a[1]), float(b[0]), float(b[1])))
    return best <= thresh


def _point(obj) -> tuple[float, float] | None:
    pt = (obj or {}).get("point") if isinstance(obj, dict) else None
    if isinstance(pt, dict) and "x" in pt and "y" in pt:
        return float(pt["x"]), float(pt["y"])
    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
        return float(pt[0]), float(pt[1])
    return None


def _point_in_poly(px: float, py: float, boundary) -> bool:
    if not boundary or len(boundary) < 3:
        return False
    inside = False
    n = len(boundary)
    for i in range(n):
        a, b = boundary[i], boundary[(i + 1) % n]
        if not (isinstance(a, (list, tuple)) and isinstance(b, (list, tuple))):
            continue
        if len(a) < 2 or len(b) < 2:
            continue
        x1, y1 = float(a[0]), float(a[1])
        x2, y2 = float(b[0]), float(b[1])
        if (y1 > py) != (y2 > py):
            xint = (x2 - x1) * (py - y1) / ((y2 - y1) or 1e-18) + x1
            if px < xint:
                inside = not inside
    return inside


TYPE_TO_KIND = {
    "motionsensor": "motion", "occupancysensor": "motion", "light": "light",
    "switch": "switch", "contactsensor": "contact", "magnetsensor": "contact",
    "waterleaksensor": "leak", "naturalgasalarm": "gas", "smokealarm": "smoke",
    "doorlock": "lock", "lock": "lock", "windowcovering": "curtain",
    "gateway": "gateway", "hub": "gateway",
    "temperaturesensor": "climate", "humiditysensor": "climate",
}
NAME_KIND_HINTS = (
    ("门锁", "lock"), ("人感", "motion"), ("人体", "motion"), ("门磁", "contact"),
    ("门窗传感", "contact"), ("烟雾", "smoke"), ("燃气", "gas"), ("天然气", "gas"),
    ("水浸", "leak"), ("窗帘", "curtain"), ("筒灯", "light"), ("吸顶", "light"),
    ("灯带", "light"), ("灯泡", "light"), ("墙壁开关", "switch"), ("边端", "gateway"), ("网关", "gateway"),
    ("魔方", "cube"),
    ("lock", "lock"), ("motion", "motion"), ("magnet", "contact"), ("smoke", "smoke"),
    ("flood", "leak"), ("gas", "gas"), ("curtain", "curtain"), ("light", "light"),
    ("downlight", "light"), ("ceiling", "light"), ("strip", "light"), ("bulb", "light"),
    ("cube", "cube"),
)


def is_shell_model(model: str) -> bool:
    text = (model or "").strip().lower()
    return text.startswith("lumi.models.") or text.startswith("x2.lumi.models.")


def device_kinds(types, name: str, model: str) -> list[str]:
    kinds, seen = [], set()
    for raw in types or []:
        key = str(raw).lower().replace(" ", "")
        kind = TYPE_TO_KIND.get(key)
        if kind and kind not in seen:
            seen.add(kind)
            kinds.append(kind)
    model_l = (model or "").lower()
    if ".lock." in model_l and "lock" not in seen:
        seen.add("lock")
        kinds.append("lock")
    if not kinds:
        text = f"{name or ''} {model or ''}"
        text_l = text.lower()
        for needle, kind in NAME_KIND_HINTS:
            hit = needle in text if not needle.isascii() else needle in text_l
            if not hit:
                continue
            if kind in seen:
                continue
            seen.add(kind)
            kinds.append(kind)
    return kinds


def _assign_room(rid: str | None, pt, rooms: list[dict], room_ids: set[str]) -> str:
    if rid in room_ids:
        return rid or ""
    if not pt:
        return ""
    for r in rooms:
        if _point_in_poly(pt[0], pt[1], r.get("_boundary") or []):
            return r["roomId"]
    return ""


def _inventory_rows(items: list[dict], rooms: list[dict]) -> tuple[list[dict], dict]:
    room_by_id = {r["roomId"]: r for r in rooms}
    room_ids = set(room_by_id)
    inventory, kind_index = [], {}
    for it in items:
        rid = _assign_room(it.get("roomId"), it.get("point"), rooms, room_ids)
        rname = (room_by_id.get(rid) or {}).get("displayName") or ""
        exec_id = it.get("deviceId") or it["id"]
        model = it.get("model") or ""
        name = it.get("name") or ""
        shell = is_shell_model(model)
        row = {
            "id": it["id"],
            "deviceId": exec_id,
            "name": name,
            "model": model,
            "probeAs": name if (shell or not model) and name else (model or name),
            "shell": shell,
            "kinds": it.get("kinds") or [],
            "roomId": rid,
            "roomName": rname,
        }
        if it.get("powers"):
            row["powers"] = it["powers"]
        inventory.append(row)
        for k in row["kinds"]:
            kind_index.setdefault(k, []).append(
                {
                    "id": row["id"],
                    "deviceId": exec_id,
                    "name": row["name"],
                    "model": row["model"],
                    "probeAs": row["probeAs"],
                    "roomId": rid,
                    "roomName": rname,
                }
            )
    return inventory, kind_index


def _device_item(did: str, props: dict, room_id: str | None = None) -> dict:
    name = props.get("name") or ""
    model = _catalog_model(props)
    types = props.get("deviceTypesList") or []
    node_id = keep_device_id(did)
    item = {
        "id": node_id,
        "deviceId": node_id,
        "name": name,
        "model": model,
        "kinds": device_kinds(types, name, model),
        "roomId": room_id or "",
        "point": _point(props),
    }
    powers = _powers_list(props.get("powers"))
    if powers:
        item["powers"] = powers
    return item


def _powers_list(raw) -> list:
    out = []
    if not isinstance(raw, list):
        return out
    for row in raw:
        if not isinstance(row, dict):
            continue
        mapping = row.get("mapping") if isinstance(row.get("mapping"), dict) else {}
        target = keep_device_id(str(row.get("targetId") or ""))
        if not target:
            continue
        out.append(
            {
                "targetId": target,
                "targetName": row.get("targetName") or row.get("name") or "",
                "targetType": row.get("targetType") or "",
                "sourceEndpointId": mapping.get("sourceEndpointId", row.get("sourceEndpointId")),
            }
        )
    return out


def _mark_loads(inventory: list) -> None:
    by_id = {}
    for row in inventory:
        if row.get("id"):
            by_id[row["id"]] = row
        if row.get("deviceId"):
            by_id[row["deviceId"]] = row
    for row in inventory:
        for link in row.get("powers") or []:
            load = by_id.get(link.get("targetId") or "")
            if not load:
                continue
            entry = {
                "switchId": row["id"],
                "sourceEndpointId": link.get("sourceEndpointId"),
            }
            held = load.setdefault("poweredBy", [])
            if entry not in held:
                held.append(entry)


def _dup_issues(rooms: list[dict]) -> list[dict]:
    groups: dict[str, list[str]] = defaultdict(list)
    for r in rooms:
        groups[r["displayName"]].append(r["roomId"])
    issues = []
    for name, ids in groups.items():
        if len(ids) < 2:
            continue
        for r in rooms:
            if r["roomId"] in ids:
                r["duplicateGroup"] = name
        issues.append(
            {"code": "duplicate_room_name", "message": f"存在多间「{name}」", "roomIds": ids}
        )
    return issues


def from_graph(g: dict) -> dict:
    nodes = {n["id"]: n for n in g.get("nodes") or [] if isinstance(n, dict) and n.get("id")}
    rooms, floors = [], []
    for n in nodes.values():
        props = n.get("properties") or {}
        ntype = n.get("nodeType")
        if ntype == "Floor":
            floors.append(
                {
                    "id": n["id"],
                    "name": props.get("name") or "",
                    "floorNum": props.get("floorNum") if props.get("floorNum") is not None else props.get("level"),
                }
            )
        if ntype == "Room":
            rid = bare_id(n["id"])
            rooms.append(
                {
                    "roomId": rid,
                    "nodeId": n["id"],
                    "displayName": props.get("name") or rid,
                    "area_m2": _area_m2(props.get("area") or props.get("area_m2")),
                    "labelConfidence": "high",
                    "duplicateGroup": None,
                    "_boundary": props.get("boundary") or [],
                }
            )
    room_ids = {r["roomId"] for r in rooms}
    adj, seen = [], set()
    by_room = {r["roomId"]: {"doors": 0, "windows": 0} for r in rooms}
    connects: dict[str, list[str]] = defaultdict(list)
    belongs_to: dict[str, str] = {}
    powers_by_source: dict[str, list] = defaultdict(list)
    for e in g.get("edges") or []:
        if not isinstance(e, dict):
            continue
        et, src, tgt = e.get("edgeType"), e.get("source") or "", e.get("target") or ""
        if et == "belongsTo" and src and tgt:
            belongs_to[src] = tgt
        if et == "connects":
            connects[src].append(tgt)
        if et == "powers" and src:
            mapping = (e.get("properties") or {}).get("mapping") or {}
            tgt_node = nodes.get(tgt) or {}
            powers_by_source[src].append(
                {
                    "targetId": tgt,
                    "targetName": (tgt_node.get("properties") or {}).get("name") or "",
                    "targetType": tgt_node.get("nodeType") or "",
                    "sourceEndpointId": mapping.get("sourceEndpointId"),
                }
            )
        if et != "isAdjacentTo":
            continue
        a, b = bare_id(src), bare_id(tgt)
        if a not in room_ids or b not in room_ids or a == b:
            continue
        key = tuple(sorted((a, b)))
        if key in seen:
            continue
        seen.add(key)
        via = (e.get("properties") or {}).get("viaDoor") or (e.get("properties") or {}).get("via")
        adj.append({"a": a, "b": b, "via": bare_id(via) if via else None})

    def room_of(node_id: str) -> str:
        seen_ids: set[str] = set()
        cur = node_id
        while cur and cur not in seen_ids:
            seen_ids.add(cur)
            node = nodes.get(cur) or {}
            if node.get("nodeType") == "Room":
                return bare_id(cur)
            cur = belongs_to.get(cur) or ""
        return ""

    door_n = win_n = 0
    entrance = None
    for n in nodes.values():
        ntype = n.get("nodeType")
        props = n.get("properties") or {}
        if ntype == "Door":
            door_n += 1
            indoor = [bare_id(t) for t in connects.get(n["id"], []) if bare_id(t) in room_ids]
            if not indoor:
                host = room_of(n["id"])
                indoor = [host] if host in room_ids else []
            for rid in indoor:
                by_room[rid]["doors"] += 1
            if props.get("isMainEntrance") and indoor:
                entrance = indoor[0]
            elif not entrance and any(
                (nodes.get(t) or {}).get("nodeType") == "Outside" for t in connects.get(n["id"], [])
            ):
                if indoor:
                    entrance = indoor[0]
        elif ntype in ("Window", "CornerWindow"):
            win_n += 1
            indoor = [bare_id(t) for t in connects.get(n["id"], []) if bare_id(t) in room_ids]
            host = room_of(n["id"])
            if host in room_ids and host not in indoor:
                indoor.append(host)
            if indoor:
                for rid in indoor:
                    by_room[rid]["windows"] += 1
            else:
                pt = _point(props)
                if pt:
                    for r in rooms:
                        if _near_boundary(pt[0], pt[1], r.get("_boundary") or []):
                            by_room[r["roomId"]]["windows"] += 1
                            break

    raw_devices = [
        _device_item(keep_device_id(n["id"]), n.get("properties") or {}, room_of(n["id"]))
        for n in nodes.values()
        if n.get("nodeType") == "Device"
    ]
    inventory, kind_index = _inventory_rows(raw_devices, rooms)
    for row in inventory:
        powered = powers_by_source.get(row["id"]) or []
        if powered:
            row["powers"] = powered
    _mark_loads(inventory)
    with_room = sum(1 for d in inventory if d.get("roomId"))
    issues = _dup_issues(rooms)
    if raw_devices and with_room < len(raw_devices):
        issues.append(
            {
                "code": "orphan_devices",
                "message": "部分设备未归属房间",
                "count": len(raw_devices) - with_room,
            }
        )
    for r in rooms:
        r.pop("_boundary", None)
    return _pack(
        rooms,
        floors,
        adj,
        door_n,
        win_n,
        entrance,
        by_room,
        issues,
        inventory=inventory,
        kind_index=kind_index,
        from_model=0,
        from_graph=len(raw_devices),
        with_room=with_room,
        project_id="",
    )


def from_model(m: dict) -> dict:
    rooms, floors, adj = [], [], []
    door_n = win_n = 0
    by_room: dict[str, dict] = {}
    devices = []
    meta = m.get("meta") or {}
    for lv in m.get("levels") or []:
        floors.append(
            {"id": lv.get("id") or "", "name": lv.get("name") or "", "floorNum": lv.get("level")}
        )
        level_rooms = []
        for r in lv.get("rooms") or []:
            rid = str(r.get("id") or "")
            row = {
                "roomId": rid,
                "nodeId": f"Room:{rid}" if rid and not rid.startswith("Room:") else rid,
                "displayName": r.get("name") or r.get("displayName") or rid,
                "area_m2": _area_m2(r.get("area")),
                "labelConfidence": "high",
                "duplicateGroup": None,
                "_boundary": r.get("boundary") or [],
            }
            rooms.append(row)
            level_rooms.append(row)
            by_room[rid] = {"doors": 0, "windows": 0}
        for d in lv.get("devices") or []:
            if isinstance(d, dict):
                devices.append(d)
        seen = set()
        for opening, kind in (
            (lv.get("doors") or [], "doors"),
            (lv.get("windows") or [], "windows"),
            (lv.get("cornerWindows") or [], "windows"),
        ):
            for item in opening:
                if not isinstance(item, dict):
                    continue
                if kind == "doors":
                    door_n += 1
                else:
                    win_n += 1
                pt = _point(item)
                if not pt:
                    continue
                near = [
                    r["roomId"]
                    for r in level_rooms
                    if _near_boundary(pt[0], pt[1], r.get("_boundary") or [])
                ]
                for rid in near:
                    by_room[rid][kind] += 1
                if kind == "doors" and len(near) >= 2:
                    key = tuple(sorted(near[:2]))
                    if key not in seen:
                        seen.add(key)
                        adj.append({"a": key[0], "b": key[1], "via": item.get("id")})
    raw_devices = []
    for d in devices:
        if not isinstance(d, dict):
            continue
        raw_devices.append(
            _device_item(
                keep_device_id(str(d.get("id") or d.get("deviceId") or "")),
                d,
                str(d.get("roomId") or d.get("hostId") or ""),
            )
        )
    inventory, kind_index = _inventory_rows(raw_devices, rooms)
    _mark_loads(inventory)
    with_room = sum(1 for d in inventory if d.get("roomId"))
    issues = _dup_issues(rooms)
    if raw_devices and with_room < len(raw_devices):
        issues.append(
            {
                "code": "orphan_devices",
                "message": "部分设备未归属房间",
                "count": len(raw_devices) - with_room,
            }
        )
    for r in rooms:
        r.pop("_boundary", None)
    return _pack(
        rooms,
        floors,
        adj,
        door_n,
        win_n,
        None,
        by_room,
        issues,
        inventory=inventory,
        kind_index=kind_index,
        from_model=len(raw_devices),
        from_graph=0,
        with_room=with_room,
        project_id=str((meta.get("projectId") or "")),
    )


def _label_rooms(rooms: list[dict]) -> None:
    groups: dict[str, list] = defaultdict(list)
    for r in rooms:
        groups[r.get("displayName") or ""].append(r)
    for name, rows in groups.items():
        if len(rows) < 2:
            for r in rows:
                r["label"] = name
            continue
        for r in rows:
            area = r.get("area_m2")
            if area:
                shown = int(area) if float(area) == int(area) else area
                r["label"] = f"{name}（约{shown}㎡）"
            else:
                r["label"] = name


def _pack(rooms, floors, adj, doors, windows, entrance, by_room, issues, **hints) -> dict:
    if not rooms:
        issues = list(issues) + [{"code": "unusable_space", "message": "未识别到房间"}]
    _label_rooms(rooms)
    return {
        "schemaVersion": "space-summary-v1",
        "projectId": hints.get("project_id") or "",
        "floors": floors,
        "rooms": rooms,
        "adjacencies": adj,
        "openings": {
            "doors": doors,
            "windows": windows,
            "mainEntranceHint": entrance,
            "byRoom": by_room,
        },
        "deviceHints": {
            "fromModelCount": hints.get("from_model") or 0,
            "fromGraphCount": hints.get("from_graph") or 0,
            "withRoomBelongsTo": hints.get("with_room") or 0,
        },
        "inventory": hints.get("inventory") or [],
        "kindIndex": hints.get("kind_index") or {},
        "issues": issues,
        "readyForRecommend": bool(rooms),
    }


def _as_graph(obj: dict) -> dict:
    nested = obj.get("graph")
    if isinstance(nested, dict) and "nodes" in nested:
        return nested
    return obj


def unwrap(data):
    if not isinstance(data, dict):
        raise SystemExit("need object")
    if isinstance(data.get("spatial_graph"), dict):
        return from_graph(_as_graph(data["spatial_graph"]))
    if isinstance(data.get("spatial_model"), dict):
        return from_model(data["spatial_model"])
    if isinstance(data.get("graph"), dict) and "nodes" in data["graph"]:
        return from_graph(data["graph"])
    if "nodes" in data:
        return from_graph(data)
    if "levels" in data:
        return from_model(data)
    raise SystemExit("need spatial_graph or spatial_model")


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(sys.argv[1]).read_text(encoding="utf-8")
    out = unwrap(json.loads(raw))
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
