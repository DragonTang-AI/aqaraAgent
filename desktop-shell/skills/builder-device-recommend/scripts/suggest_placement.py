#!/usr/bin/env python3
"""Suggest one point per recommended device.

Coordinates match Device.point in the spatial model: millimeters,
x right, y down, z up. Never read editor.position (meters, axis order differs).

stdin JSON: {"spatial_model": {...}, "devices": [json.device devices]}
Prints {"ok": true, "placements": [...]} . Does not invent a room that is not in the model.
"""

from __future__ import annotations

import json
import sys


def _point(obj):
    pt = (obj or {}).get("point") if isinstance(obj, dict) else None
    if isinstance(pt, dict) and "x" in pt and "y" in pt:
        return float(pt["x"]), float(pt["y"])
    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
        return float(pt[0]), float(pt[1])
    return None


def _ring(raw):
    pts = []
    for item in raw or []:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            pts.append((float(item[0]), float(item[1])))
        elif isinstance(item, dict) and "x" in item and "y" in item:
            pts.append((float(item["x"]), float(item["y"])))
    return pts


def _inside(px, py, ring):
    if len(ring) < 3:
        return False
    hit = False
    for i, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(i + 1) % len(ring)]
        if (y1 > py) != (y2 > py):
            xint = (x2 - x1) * (py - y1) / ((y2 - y1) or 1e-9) + x1
            if px < xint:
                hit = not hit
    return hit


def _centroid(ring):
    n = len(ring)
    return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n


def _dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def _near(pt, ring, thresh):
    if len(ring) < 2:
        return False
    best = 1e18
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == 0 and dy == 0:
            best = min(best, _dist(pt, a))
            continue
        t = max(0.0, min(1.0, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        best = min(best, _dist(pt, (a[0] + t * dx, a[1] + t * dy)))
    return best <= thresh


def _mix(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _kind(device):
    text = f"{device.get('deviceType') or ''} {device.get('productName') or ''} {device.get('name') or ''}"
    low = text.lower()
    if "gateway" in low or "网关" in text or "hub" in low:
        return "gateway"
    if "motion" in low or "occupancy" in low or "人感" in text or "人体" in text:
        return "motion"
    if "contact" in low or "magnet" in low or "门磁" in text or "门窗" in text:
        return "contact"
    if "leak" in low or "水浸" in text:
        return "leak"
    if "gas" in low or "燃气" in text:
        return "gas"
    if "curtain" in low or "windowcovering" in low or "窗帘" in text:
        return "curtain"
    if "switch" in low or "开关" in text:
        return "switch"
    if "climate" in low or "temperature" in low or "humidity" in low or "温湿" in text:
        return "climate"
    if "light" in low or "灯" in text:
        return "light"
    return "other"


# 这套房没有同类设备的非零高度时才用。单位毫米，z 向上。
HEIGHT_MM = {
    "light": 2400,
    "curtain": 2400,
    "motion": 1400,
    "switch": 1200,
    "contact": 1000,
    "climate": 1500,
    "gas": 1500,
    "leak": 0,
    "other": 0,
}


def _home_heights(model):
    """同类设备里出现最多的非零 z。z 为 0 的点不当安装高度。"""
    buckets = {}
    for level in model.get("levels") or []:
        for device in level.get("devices") or []:
            raw = (device.get("point") or {}).get("z")
            if not isinstance(raw, (int, float)) or raw <= 0:
                continue
            buckets.setdefault(_kind(device), []).append(round(float(raw), 1))
    chosen = {}
    for kind, vals in buckets.items():
        chosen[kind] = max(set(vals), key=vals.count)
    return chosen


COPY = {
    "light": ("房间中部", "Middle of the room", "照亮主要活动区", "Lights the main part of the room"),
    "motion": ("靠近门口", "Near the door", "人进门就能感应", "Catches people as they enter"),
    "contact": ("这扇门上", "On this door", "看这道门开没开", "Watches whether this door opens"),
    "switch": ("进门手边", "Just inside the door", "进门顺手就能按", "Within reach as you walk in"),
    "curtain": ("这面窗边", "By this window", "跟着这扇窗走", "Follows this window"),
    "leak": ("地面中部", "Middle of the floor", "靠近这间的用水处", "Near the water use in this room"),
    "gas": ("房间中部", "Middle of the room", "靠近灶台一侧", "Toward the cooking side"),
    "climate": ("避开窗边", "Away from the window", "读数少受窗边冷热影响", "Steadier away from the window"),
    "other": ("房间中部", "Middle of the room", "放在这间的主要活动处", "In the main part of this room"),
    "gateway": ("入户附近", "Near the entrance", "全屋一台，放信号居中的入户处", "One for the home, near the entrance"),
}


def _rooms(model):
    found = []
    for level in model.get("levels") or []:
        doors = [p for p in (_point(d) for d in level.get("doors") or []) if p]
        windows = [p for p in (_point(w) for w in level.get("windows") or []) if p]
        for room in level.get("rooms") or []:
            ring = _ring(room.get("boundary") or room.get("polygon"))
            if len(ring) < 3:
                continue
            center = _point({"point": room.get("namePoint")}) or _centroid(ring)
            if not _inside(center[0], center[1], ring):
                center = _centroid(ring)
            found.append(
                {
                    "id": str(room.get("id") or ""),
                    "name": room.get("name") or room.get("displayName") or "",
                    "ring": ring,
                    "center": center,
                    "doors": [p for p in doors if _near(p, ring, 800)],
                    "windows": [p for p in windows if _near(p, ring, 800)],
                }
            )
    return found


def _match(device, rooms):
    rid = str(device.get("roomId") or "")
    name = str(device.get("roomName") or "")
    if rid and rid != "whole_home":
        for room in rooms:
            if room["id"] == rid or rid.endswith(room["id"]):
                return room
    if name:
        for room in rooms:
            if room["name"] == name:
                return room
    return None


def _spot(kind, room, index, total):
    center = room["center"]
    door = room["doors"][0] if room["doors"] else None
    window = room["windows"][0] if room["windows"] else None
    if kind == "light" and total > 1:
        xs = [p[0] for p in room["ring"]]
        ys = [p[1] for p in room["ring"]]
        span_x = max(xs) - min(xs)
        span_y = max(ys) - min(ys)
        t = (index + 1) / (total + 1)
        if span_x >= span_y:
            pt = (min(xs) + span_x * t, center[1])
        else:
            pt = (center[0], min(ys) + span_y * t)
    elif kind in ("motion", "switch", "contact") and door:
        pt = _mix(center, door, 0.72 if kind == "contact" else 0.45)
    elif kind == "curtain" and window:
        pt = _mix(center, window, 0.7)
    elif kind == "climate" and window:
        pt = _mix(center, window, -0.25)
    else:
        pt = center
    if not _inside(pt[0], pt[1], room["ring"]):
        pt = center
    return round(pt[0], 1), round(pt[1], 1)


def _blank(room_name, name, where_cn, where_en, why_cn, why_en):
    return {
        "roomName": room_name,
        "device": name,
        "point": None,
        "x": None,
        "y": None,
        "z": None,
        "where_cn": where_cn,
        "where_en": where_en,
        "why_cn": why_cn,
        "why_en": why_en,
    }


def suggest(model, devices):
    rooms = _rooms(model)
    if not rooms:
        return {"ok": False, "message": "no rooms"}
    heights = _home_heights(model)
    groups = {}
    for device in devices:
        key = (str(device.get("roomId") or ""), _kind(device))
        groups.setdefault(key, []).append(device)
    rows = []
    for device in devices:
        kind = _kind(device)
        where_cn, where_en, why_cn, why_en = COPY[kind]
        name = device.get("productName") or device.get("name") or device.get("deviceType") or ""
        if kind == "gateway" or str(device.get("roomId") or "") == "whole_home":
            rows.append(_blank(device.get("roomName") or "全屋", name, where_cn, where_en, why_cn, why_en))
            continue
        room = _match(device, rooms)
        if not room:
            rows.append(
                _blank(
                    device.get("roomName") or "",
                    name,
                    "对不上户型",
                    "Room not on the plan",
                    "这间不在户型里，先不标坐标",
                    "This room is not on the floor plan, so no point is given",
                )
            )
            continue
        siblings = groups[(str(device.get("roomId") or ""), kind)]
        x, y = _spot(kind, room, siblings.index(device), len(siblings))
        z = heights.get(kind, HEIGHT_MM.get(kind, 0))
        point = {"x": x, "y": y, "z": z}
        rows.append(
            {
                "roomName": room["name"] or device.get("roomName") or "",
                "device": name,
                "point": point,
                "x": x,
                "y": y,
                "z": z,
                "where_cn": where_cn,
                "where_en": where_en,
                "why_cn": why_cn,
                "why_en": why_en,
            }
        )
    return {"ok": True, "placements": rows}


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"ok": False, "message": "bad json"}, ensure_ascii=False))
        return 1
    model = data.get("spatial_model") if isinstance(data, dict) else None
    if not isinstance(model, dict):
        model = data if isinstance(data, dict) and data.get("levels") else None
    devices = data.get("devices") if isinstance(data, dict) else None
    if not isinstance(model, dict) or not isinstance(devices, list):
        print(json.dumps({"ok": False, "message": "need spatial_model and devices"}, ensure_ascii=False))
        return 1
    print(json.dumps(suggest(model, devices), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
