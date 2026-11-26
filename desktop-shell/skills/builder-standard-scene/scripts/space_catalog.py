"""Deterministic Room/Zone discovery for standard-scene navigation and scope."""
from __future__ import annotations

from collections import Counter
from typing import Any


WHOLE_HOME_ID = "__whole_home__"


def _node_type(node: dict[str, Any]) -> str:
    value = str(node.get("nodeType") or node.get("type") or "")
    node_id = str(node.get("id") or "")
    if value:
        return value
    if ":" in node_id:
        return node_id.split(":", 1)[0]
    return ""


def _name(node: dict[str, Any]) -> str:
    props = node.get("properties") or {}
    return str(props.get("name") or props.get("displayName") or "").strip()


def classify_device_kinds(node: dict[str, Any]) -> set[str]:
    props = node.get("properties") or {}
    name = str(props.get("name") or "")
    model = str(props.get("model") or "")
    types = props.get("deviceTypesList") or []
    if not isinstance(types, list):
        types = []
    joined = " ".join([name, model] + [str(value) for value in types]).lower()
    lowered = {str(value).lower() for value in types}
    kinds: set[str] = set()
    if "light" in lowered or any(
        value in name for value in ("灯", "灯带", "射灯", "格栅", "落地灯", "台灯", "筒灯", "吸顶")
    ):
        kinds.add("light")
    if "hub" in lowered:
        # 网关带 IRDevice，不能当成电视去写 OnOff
        return kinds
    if "speaker" in lowered or any(
        value in joined for value in ("speaker", "音箱", "音响", "sonos", "小乔")
    ):
        kinds.add("speaker")
    # 演示箱「客厅窗帘」是开关（只有 OnOff），不是行程窗帘
    if "windowcovering" in lowered or "curtain" in joined:
        kinds.add("curtain")
    elif "帘" in name and "switch" in lowered:
        kinds.add("curtain_switch")
    elif "帘" in name and "light" not in kinds:
        kinds.add("curtain")
    if "light" not in kinds and any(value in name for value in ("电视", "投影", "盒子")):
        kinds.add("av")
    return kinds


def build_graph_index(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = {
        str(node.get("id")): node
        for node in graph.get("nodes") or []
        if isinstance(node, dict) and node.get("id")
    }
    spaces = {
        node_id: {
            "node_id": node_id,
            "node_type": _node_type(node),
            "name": _name(node) or node_id,
            "tags": [str(tag) for tag in ((node.get("properties") or {}).get("tags") or [])],
        }
        for node_id, node in nodes.items()
        if _node_type(node) in ("Room", "Zone")
    }
    parents: dict[str, str] = {}
    ambiguous: set[str] = set()
    for edge in graph.get("edges") or []:
        if not isinstance(edge, dict) or edge.get("edgeType") != "belongsTo":
            continue
        source, target = str(edge.get("source") or ""), str(edge.get("target") or "")
        if not source or not target:
            continue
        if source in parents and parents[source] != target:
            ambiguous.add(source)
        else:
            parents[source] = target

    def path_for(space_id: str) -> tuple[list[str], bool]:
        path: list[str] = []
        seen: set[str] = set()
        current = space_id
        while current in spaces:
            if current in seen or current in ambiguous:
                return [], False
            seen.add(current)
            path.append(current)
            parent = parents.get(current)
            if not parent or parent not in spaces:
                break
            current = parent
        path.reverse()
        valid = bool(path) and spaces[path[0]]["node_type"] == "Room"
        return path, valid

    for space_id, space in spaces.items():
        path_ids, valid = path_for(space_id)
        space["path_ids"] = path_ids
        space["path_names"] = [spaces[item]["name"] for item in path_ids]
        space["valid"] = valid

    devices: list[dict[str, Any]] = []
    for node_id, node in nodes.items():
        if _node_type(node) != "Device":
            continue
        direct_space = parents.get(node_id)
        if node_id in ambiguous or direct_space not in spaces:
            path_ids: list[str] = []
        else:
            path_ids = list(spaces[direct_space].get("path_ids") or [])
        props = node.get("properties") or {}
        writable = (
            props.get("writableTraits")
            or props.get("writable_traits")
            or props.get("capabilities")
            or props.get("traits")
        )
        devices.append(
            {
                "id": node_id,
                "controlId": str(props.get("deviceId") or "").strip() or node_id,
                "name": str(props.get("name") or ""),
                "model": str(props.get("model") or ""),
                "types": list(props.get("deviceTypesList") or []),
                "kinds": classify_device_kinds(node),
                "writable": writable if writable else None,
                "directSpaceId": direct_space if direct_space in spaces else None,
                "spacePathIds": path_ids,
                "roomId": path_ids[0] if path_ids else None,
                "roomName": spaces[path_ids[0]]["name"] if path_ids else "",
                "zoneId": path_ids[-1] if path_ids and spaces[path_ids[-1]]["node_type"] == "Zone" else None,
            }
        )

    return {"spaces": spaces, "devices": devices, "parents": parents}


def devices_for_target(index: dict[str, Any], target_node_id: str) -> list[dict[str, Any]]:
    if target_node_id == WHOLE_HOME_ID:
        selected = list(index["devices"])
    elif target_node_id not in index["spaces"]:
        return []
    elif index["spaces"][target_node_id].get("node_type") == "Zone":
        selected = [
            device
            for device in index["devices"]
            if device.get("directSpaceId") == target_node_id
        ]
    else:
        selected = [
            device
            for device in index["devices"]
            if target_node_id in (device.get("spacePathIds") or [])
        ]
    unique: dict[str, dict[str, Any]] = {}
    for device in selected:
        unique.setdefault(str(device.get("controlId") or device.get("id")), device)
    return list(unique.values())


def _category_matches(category: dict[str, Any], space: dict[str, Any]) -> bool:
    match = category.get("match") or {}
    text = " ".join([space.get("name") or ""] + list(space.get("tags") or [])).lower()
    values = [str(value).lower() for value in (match.get("names") or []) + (match.get("tags") or [])]
    return any(value and value in text for value in values)


def template_for_space(catalog: dict[str, Any], space: dict[str, Any]) -> str:
    if space.get("node_id") == WHOLE_HOME_ID:
        return "whole"
    fallback = "generic"
    for category in catalog.get("categories") or []:
        if category.get("fallback"):
            fallback = str(category.get("id") or fallback)
            continue
        if category.get("id") == "whole":
            continue
        if _category_matches(category, space):
            return str(category.get("id"))
    return fallback


def _display_names(spaces: list[dict[str, Any]]) -> None:
    basic = [" / ".join(space.get("path_names") or [space.get("name") or ""]) for space in spaces]
    counts = Counter(basic)
    for space, display in zip(spaces, basic):
        if counts[display] > 1:
            display = f"{display} [{space['node_id'].rsplit(':', 1)[-1][-6:]}]"
        space["display_name"] = display
        space["selection_key"] = display


def _device_counts_by_space(index: dict[str, Any]) -> tuple[dict[str, dict[str, int]], dict[str, int]]:
    """Single pass: Zone=directSpaceId, Room=any path membership; plus whole-home totals."""
    kinds = ("light", "curtain", "speaker", "av")
    by_space: dict[str, dict[str, int]] = {
        sid: {k: 0 for k in kinds} for sid in index["spaces"]
    }
    whole = {k: 0 for k in kinds}
    for device in index["devices"]:
        device_kinds = device.get("kinds") or set()
        hits = {k: (1 if k in device_kinds else 0) for k in kinds}
        for k, n in hits.items():
            whole[k] += n
        direct = device.get("directSpaceId")
        if direct and direct in by_space:
            space = index["spaces"].get(direct) or {}
            if space.get("node_type") == "Zone":
                for k, n in hits.items():
                    by_space[direct][k] += n
                continue
        for sid in device.get("spacePathIds") or []:
            space = index["spaces"].get(sid) or {}
            if space.get("node_type") == "Zone":
                # Zone coverage is direct-only; path membership must not inflate Zone.
                continue
            if sid in by_space:
                for k, n in hits.items():
                    by_space[sid][k] += n
    return by_space, whole


def available_spaces(
    graph: dict[str, Any], catalog: dict[str, Any], page: int = 1, page_size: int = 3
) -> dict[str, Any]:
    index = build_graph_index(graph)
    counts_by_space, whole_counts = _device_counts_by_space(index)
    candidates: list[dict[str, Any]] = []
    for space in index["spaces"].values():
        if not space.get("valid"):
            continue
        device_counts = counts_by_space.get(space["node_id"]) or {
            "light": 0,
            "curtain": 0,
            "speaker": 0,
            "av": 0,
        }
        if device_counts.get("light", 0) < 1:
            continue
        item = dict(space)
        item["template_id"] = template_for_space(catalog, item)
        item["device_counts"] = device_counts
        candidates.append(item)
    _display_names(candidates)
    candidates.sort(
        key=lambda item: (
            item.get("path_names", [""])[0],
            0 if item.get("node_type") == "Room" else 1,
            item.get("display_name", ""),
            item.get("node_id", ""),
        )
    )
    if whole_counts.get("light", 0) > 0:
        candidates.append(
            {
                "node_id": WHOLE_HOME_ID,
                "node_type": "WholeHome",
                "name": "全屋",
                "display_name": "全屋",
                "selection_key": "全屋",
                "path_ids": [],
                "path_names": ["全屋"],
                "template_id": "whole",
                "device_counts": whole_counts,
            }
        )
    page = max(1, int(page or 1))
    page_size = max(1, min(3, int(page_size or 3)))
    start = (page - 1) * page_size
    shown = candidates[start : start + page_size]
    for item in shown:
        item["send"] = f"按标准场景选空间{item['selection_key']}"
    return {
        "status": "OK",
        "page": page,
        "page_size": page_size,
        "has_more": start + page_size < len(candidates),
        "total": len(candidates),
        "spaces": shown,
    }


def resolve_space(index: dict[str, Any], selector: str) -> dict[str, Any] | None:
    if selector in (WHOLE_HOME_ID, "全屋"):
        return {
            "node_id": WHOLE_HOME_ID,
            "node_type": "WholeHome",
            "name": "全屋",
            "display_name": "全屋",
            "selection_key": "全屋",
            "path_ids": [],
            "path_names": ["全屋"],
        }
    if selector in index["spaces"]:
        item = dict(index["spaces"][selector])
        _display_names([item])
        return item
    candidates = [dict(space) for space in index["spaces"].values() if space.get("valid")]
    _display_names(candidates)
    matches = [
        item
        for item in candidates
        if selector in (item.get("selection_key"), item.get("display_name"))
    ]
    return matches[0] if len(matches) == 1 else None


def available_scenes(
    graph: dict[str, Any],
    catalog: dict[str, Any],
    target_selector: str,
    page: int = 1,
    index: dict[str, Any] | None = None,
) -> dict[str, Any]:
    index = index or build_graph_index(graph)
    space = resolve_space(index, target_selector)
    if not space:
        return {"status": "UNMET", "error": "target space not found", "scenes": []}
    devices = devices_for_target(index, space["node_id"])
    if not any("light" in device.get("kinds", set()) for device in devices):
        return {"status": "UNMET", "error": "target space has no controllable lights", "scenes": []}
    template_id = template_for_space(catalog, space)
    category = next(
        (item for item in catalog.get("categories") or [] if item.get("id") == template_id),
        None,
    )
    if not category:
        return {"status": "UNMET", "error": "target space template missing", "scenes": []}
    pages = category.get("pages") or []
    page = max(1, int(page or 1))
    scene_ids = pages[page - 1] if page <= len(pages) else []
    rows = {str(item.get("id")): item for item in catalog.get("scenes") or []}
    scenes = [
        {
            "scene_id": scene_id,
            "label": str(rows[scene_id].get("label") or scene_id),
            "send": f"按标准场景输出{space['display_name']}·{rows[scene_id].get('label') or scene_id}",
        }
        for scene_id in scene_ids
        if scene_id in rows
    ]
    return {
        "status": "OK",
        "target_node_id": space["node_id"],
        "display_name": space["display_name"],
        "template_id": template_id,
        "page": page,
        "has_more": page < len(pages),
        "scenes": scenes,
    }
