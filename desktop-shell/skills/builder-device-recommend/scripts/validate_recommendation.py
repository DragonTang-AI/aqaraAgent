#!/usr/bin/env python3
"""落卡前校验推荐清单。聊天表可以不写型号；JSON 的 devices[].model 为空则前端列表是空的。"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from resource_lib import is_catalog_model, is_instance_id  # noqa: E402

NEED = (
    "seq",
    "roomId",
    "roomName",
    "deviceType",
    "productName",
    "model",
    "protocols",
    "needsGateway",
    "qty",
    "rationale",
)


def unwrap(raw):
    if not isinstance(raw, dict):
        raise ValueError("need object")
    if isinstance(raw.get("content"), str) and raw.get("name") == "json.device":
        inner = json.loads(raw["content"] or "{}")
        if isinstance(inner, dict):
            return inner
    if isinstance(raw.get("payload"), dict):
        return raw["payload"]
    return raw


def extract_rooms(raw: dict) -> list[dict]:
    rooms = raw.get("rooms") or raw.get("allowedRooms") or []
    if not isinstance(rooms, list):
        return []
    return [
        {
            "roomId": str(room.get("roomId") or room.get("id") or ""),
            "roomName": str(
                room.get("roomName")
                or room.get("displayName")
                or room.get("name")
                or ""
            ),
        }
        for room in rooms
        if isinstance(room, dict)
    ]


def check(
    obj: dict,
    rooms: list[dict] | None = None,
    require_rooms: bool = False,
) -> list[str]:
    errs = []
    allowed = {
        (str(room.get("roomId") or ""), str(room.get("roomName") or ""))
        for room in (rooms or [])
        if room.get("roomId") and room.get("roomName")
    }
    allowed_ids = {pair[0] for pair in allowed}
    devices = obj.get("devices")
    if not isinstance(devices, list):
        return ["devices must be an array"]
    if require_rooms and not allowed:
        errs.append("rooms must contain at least one valid model room")
    flag = obj.get("hasRecommendedDevices")
    if not isinstance(flag, bool):
        errs.append("hasRecommendedDevices must be boolean")
        flag = bool(flag)
    if flag and not devices:
        errs.append("hasRecommendedDevices=true but devices=[] — frontend list stays empty")
    if (not flag) and devices:
        errs.append("hasRecommendedDevices=false but devices is not empty")
    seqs: list[int] = []
    actual_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    for i, d in enumerate(devices):
        if not isinstance(d, dict):
            errs.append(f"devices[{i}] not object")
            continue
        for key in NEED:
            if d.get(key) in (None, ""):
                errs.append(f"devices[{i}].{key} missing")
        seq = d.get("seq")
        if not isinstance(seq, int) or isinstance(seq, bool) or seq < 1:
            errs.append(f"devices[{i}].seq must be a positive integer")
        else:
            seqs.append(seq)
        qty = d.get("qty")
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1:
            errs.append(f"devices[{i}].qty must be a positive integer")
            qty_value = 0
        else:
            qty_value = qty
        protocols = d.get("protocols")
        if (
            not isinstance(protocols, list)
            or not protocols
            or not all(isinstance(protocol, str) and protocol.strip() for protocol in protocols)
        ):
            errs.append(f"devices[{i}].protocols must be a non-empty string array")
        if not isinstance(d.get("needsGateway"), bool):
            errs.append(f"devices[{i}].needsGateway must be boolean")
        room_pair = (str(d.get("roomId") or ""), str(d.get("roomName") or ""))
        if room_pair[0] == "whole_home":
            errs.append(f"devices[{i}].roomId=whole_home is not a model room")
        elif allowed and room_pair[0] not in allowed_ids:
            errs.append(
                f"devices[{i}] roomId not in model rooms: {room_pair[0]}"
            )
        elif allowed and room_pair not in allowed and room_pair[0] in allowed_ids:
            # English display roomName is OK when roomId still anchors the model room.
            pass
        elif not allowed and room_pair[1] in ("全屋", "Whole home"):
            errs.append(f"devices[{i}].roomName=全屋 needs an actual model room")
        model = str(d.get("model") or "").strip()
        if not model:
            errs.append(f"devices[{i}].model empty — right-panel list cannot render")
        elif is_instance_id(model):
            errs.append(f"devices[{i}].model is instance id, need catalog model")
        elif not is_catalog_model(model):
            errs.append(f"devices[{i}].model not a catalog model: {model}")
        if room_pair[0] and room_pair[1] and d.get("deviceType"):
            actual_counts[(room_pair[0], room_pair[1], str(d["deviceType"]))] += (
                qty_value
            )
    if seqs and seqs != list(range(1, len(devices) + 1)):
        errs.append("devices[].seq must be unique and continuous from 1")

    recommendations = obj.get("recommendations")
    if not isinstance(recommendations, list):
        errs.append("recommendations must be an array")
        recommendations = []
    declared_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    recommendation_pairs: set[tuple[str, str]] = set()
    for i, recommendation in enumerate(recommendations):
        if not isinstance(recommendation, dict):
            errs.append(f"recommendations[{i}] not object")
            continue
        pair = (
            str(recommendation.get("roomId") or ""),
            str(recommendation.get("roomName") or ""),
        )
        if not all(pair):
            errs.append(f"recommendations[{i}] roomId/roomName missing")
        elif pair[0] == "whole_home" or (
            not allowed and pair[1] in ("全屋", "Whole home")
        ):
            errs.append(
                f"recommendations[{i}] uses a synthetic room: "
                f"{pair[0]} / {pair[1]}"
            )
        elif pair[0] in {p[0] for p in recommendation_pairs}:
            errs.append(f"recommendations[{i}] duplicates room {pair[0]}")
        recommendation_pairs.add(pair)
        if allowed and pair[0] not in allowed_ids:
            errs.append(
                f"recommendations[{i}] roomId not in model rooms: {pair[0]}"
            )
        area = recommendation.get("area")
        if (
            not isinstance(area, (int, float))
            or isinstance(area, bool)
            or area < 0
        ):
            errs.append(f"recommendations[{i}].area must be a non-negative number")
        device_types = recommendation.get("deviceTypes")
        if not isinstance(device_types, list):
            errs.append(f"recommendations[{i}].deviceTypes must be an array")
            continue
        seen_types: set[str] = set()
        for j, item in enumerate(device_types):
            if not isinstance(item, dict) or not item.get("type"):
                errs.append(f"recommendations[{i}].deviceTypes[{j}] invalid")
                continue
            device_type = str(item["type"])
            if device_type in seen_types:
                errs.append(
                    f"recommendations[{i}].deviceTypes duplicates type {device_type}"
                )
                continue
            seen_types.add(device_type)
            count = item.get("count")
            if not isinstance(count, int) or isinstance(count, bool) or count < 1:
                errs.append(
                    f"recommendations[{i}].deviceTypes[{j}].count "
                    "must be a positive integer"
                )
                continue
            declared_counts[(pair[0], device_type)] = count

    # Compare by roomId + type so English display roomName does not break counts.
    actual_by_id = {
        (rid, dtype): qty for (rid, _rname, dtype), qty in actual_counts.items()
    }
    if actual_by_id != declared_counts:
        errs.append("recommendations[].deviceTypes does not match devices[] qty aggregation")
    total_rooms = obj.get("totalRooms")
    if not isinstance(total_rooms, int) or isinstance(total_rooms, bool):
        errs.append("totalRooms must be an integer")
    elif total_rooms != len(recommendations):
        errs.append("totalRooms must equal recommendations length")
    total_devices = obj.get("totalDevices")
    if not isinstance(total_devices, int) or isinstance(total_devices, bool):
        errs.append("totalDevices must be an integer")
    elif total_devices != len(devices):
        errs.append("totalDevices must equal devices row count")
    return errs


def main() -> int:
    raw = sys.stdin.read() if (len(sys.argv) > 1 and sys.argv[1] == "-") else (
        Path(sys.argv[1]).read_text(encoding="utf-8") if len(sys.argv) > 1 else ""
    )
    if not raw.strip():
        print("FAIL need json on stdin or file")
        return 2
    try:
        source = json.loads(raw)
        rooms = extract_rooms(source) if isinstance(source, dict) else []
        require_rooms = isinstance(source, dict) and (
            "rooms" in source or "allowedRooms" in source
        )
        if isinstance(source, dict) and isinstance(source.get("recommendation"), dict):
            obj = source["recommendation"]
        else:
            obj = unwrap(source)
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"FAIL {exc}")
        return 2
    errs = check(obj, rooms, require_rooms)
    if errs:
        print("FAIL")
        for e in errs:
            print(e)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
