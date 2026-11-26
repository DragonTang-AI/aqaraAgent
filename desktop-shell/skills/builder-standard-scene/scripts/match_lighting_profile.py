#!/usr/bin/env python3
"""Lighting-profile standard scene helper.

Modes (stdin JSON):

1) Prepare (agent will call mid-platform MCP builder-scene-mcp):
   {"scene":"lantian","spatial_graph":{...},"url":"https://...graph.json"}
   → prints status=PREPARE with mcp_arguments {name, deviceIds, url}

2) Assemble (after MCP returns structuredContent):
   {"scene":"lantian","spatial_graph":{...},"mcp_result":{...ok/data...}}
   → prints status=OK|DEGRADED|UNMET and scene {data:{name,config:{actions}}}

3) Local HTTP fallback (optional; needs PROFILE_MCP_SERVER_TOKEN + url):
   {"scene":"lantian","spatial_graph":{...},"url":"https://..."}
   with env token set → call MCP over HTTP then assemble.

Never commit tokens. Prefer mode 1+2 on mid-platform.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "assets" / "catalog.json").read_text(encoding="utf-8"))
sys.path.insert(0, str(ROOT / "scripts"))
from capability_guard import sanitize_scene  # noqa: E402
from logic_summary import build_logic_for_user  # noqa: E402

SCENE_ALIASES: dict[str, str] = {}
for _row in CATALOG.get("scenes") or []:
    if not _row.get("lighting_profile"):
        continue
    _sid = str(_row.get("id") or "")
    if not _sid:
        continue
    SCENE_ALIASES[_sid] = _sid
    label = str(_row.get("label") or "")
    if label:
        SCENE_ALIASES[label] = _sid
        SCENE_ALIASES[f"{label}场景"] = _sid
        SCENE_ALIASES[f"按标准场景输出{label}"] = _sid


def load_payload() -> dict[str, Any]:
    if len(sys.argv) >= 2 and sys.argv[1] != "-":
        return json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def catalog_row(scene_id: str) -> dict[str, Any]:
    for row in CATALOG.get("scenes") or []:
        if row.get("id") == scene_id:
            return row
    raise SystemExit(f"FAIL unknown scene {scene_id}")


def resolve_scene_id(raw: str) -> str | None:
    raw = (raw or "").strip()
    sid = SCENE_ALIASES.get(raw) or SCENE_ALIASES.get(raw.lower())
    if sid:
        return sid
    if "蓝天" in raw:
        return "lantian"
    return None


def classify_light(name: str, types: list[str], model: str) -> bool:
    type_l = {str(t).lower() for t in types}
    if "light" in type_l:
        return True
    return any(k in name for k in ("灯", "灯带", "射灯", "格栅", "落地", "台灯", "筒灯", "吸顶", "灯膜"))


def collect_light_ids(graph: dict[str, Any]) -> tuple[list[str], dict[str, str], list[dict]]:
    ids: list[str] = []
    id_map: dict[str, str] = {}
    devices: list[dict] = []
    for n in graph.get("nodes") or []:
        nid = str(n.get("id") or "")
        if not nid.startswith("Device:"):
            continue
        props = n.get("properties") or {}
        name = str(props.get("name") or "")
        model = str(props.get("model") or "")
        types = props.get("deviceTypesList") or []
        if not isinstance(types, list):
            types = []
        if not classify_light(name, types, model):
            continue
        studio = str(props.get("deviceId") or "").strip() or nid
        ids.append(nid)
        id_map[nid] = studio
        devices.append({"id": nid, "controlId": studio, "name": name, "model": model})
    seen: set[str] = set()
    uniq: list[str] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            uniq.append(i)
    return uniq[:100], id_map, devices


def fill_device_ids(obj: Any, id_map: dict[str, str]) -> Any:
    if isinstance(obj, list):
        return [fill_device_ids(x, id_map) for x in obj]
    if not isinstance(obj, dict):
        return obj
    out: dict[str, Any] = {}
    for k, v in obj.items():
        if k == "graphDeviceId":
            continue
        out[k] = fill_device_ids(v, id_map)
    gid = obj.get("graphDeviceId")
    if gid and (not out.get("deviceId")):
        out["deviceId"] = id_map.get(str(gid), "")
    elif gid and out.get("deviceId") == "":
        out["deviceId"] = id_map.get(str(gid), "")
    return out


def _action_graph_ids(action: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    gid = action.get("graphDeviceId")
    if gid:
        ids.add(str(gid))
    for t in action.get("targets") or []:
        if not isinstance(t, dict):
            continue
        tg = t.get("graphDeviceId")
        if tg:
            ids.add(str(tg))
    return ids


def _is_display_image_action(action: dict[str, Any]) -> bool:
    return (
        str(action.get("traitCode") or "") == "DisplayImage"
        or str(action.get("functionCode") or "") == "ImageMediaManagement"
    )


def _next_action_id(actions: list[Any]) -> str:
    max_n = 0
    for a in actions:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "")
        if aid.startswith("action-"):
            try:
                max_n = max(max_n, int(aid.split("-", 1)[1]))
            except ValueError:
                continue
    return f"action-{max_n + 1}"


def _as_endpoint_ids(raw: Any) -> list[int]:
    if isinstance(raw, list) and raw:
        out: list[int] = []
        for x in raw:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out or [1]
    if raw is None or raw == "":
        return [1]
    try:
        return [int(raw)]
    except (TypeError, ValueError):
        return [1]


def _stringify_value(val: Any) -> Any:
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        # create_scene examples use string numbers for trait writes
        if isinstance(val, float) and val.is_integer():
            return str(int(val))
        return str(val)
    return val


def _is_preview_effect_item(item: dict[str, Any]) -> bool:
    if str(item.get("functionCode") or "") != "Lighting":
        return False
    if str(item.get("commandCode") or "") == "PreviewEffect":
        return True
    if str(item.get("traitCode") or "") == "PreviewEffect":
        return True
    return bool(item.get("command")) and any(
        isinstance(a, dict) and a.get("fieldCode") == "EffectData" for a in (item.get("args") or [])
    )


def _make_targets(device_id: str, endpoint_ids: list[int], graph_device_id: str = "") -> list[dict[str, Any]]:
    t: dict[str, Any] = {"deviceId": device_id or "", "endpointIds": endpoint_ids}
    if graph_device_id:
        t["graphDeviceId"] = graph_device_id
    return [t]


def _preview_effect_batch_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Studio-deployable batch item shape (matches官方可运行蓝天白云)."""
    device_id = str(raw.get("deviceId") or "")
    if not device_id and isinstance(raw.get("targets"), list) and raw["targets"]:
        t0 = raw["targets"][0]
        if isinstance(t0, dict):
            device_id = str(t0.get("deviceId") or "")
    if not device_id:
        return None
    ep = raw.get("endpointId")
    if ep is None and isinstance(raw.get("targets"), list) and raw["targets"]:
        t0 = raw["targets"][0]
        if isinstance(t0, dict):
            eps = t0.get("endpointIds") or t0.get("endpointId")
            ep = eps[0] if isinstance(eps, list) and eps else eps
    try:
        endpoint_id = int(ep) if ep is not None else 2
    except (TypeError, ValueError):
        endpoint_id = 2
    args = list(raw.get("args") or [])
    if not args:
        return None
    # Official: traitCode + command:true（不要拆成 device.command.call）
    return {
        "deviceId": device_id,
        "endpointId": endpoint_id,
        "functionCode": "Lighting",
        "traitCode": "PreviewEffect",
        "command": True,
        "args": args,
        **(
            {"graphDeviceId": str(raw.get("graphDeviceId"))}
            if raw.get("graphDeviceId")
            else {}
        ),
    }


def normalize_to_studio_actions(actions: list[Any]) -> list[dict[str, Any]]:
    """Pack MCP actions into Studio-runnable shape.

    官方可运行蓝天白云 = 单条 device.batch，items 全是 Lighting.PreviewEffect
    （endpointId 单数 + command:true + traitCode）。禁止拆成 command.call，
    有 PreviewEffect 时丢掉 Level/ColorXY 等 V1 写点（Studio 会 Invalid）。
    DisplayImage 若有 png URL 可另附一条 trait.write。
    """
    preview_items: list[dict[str, Any]] = []
    display_actions: list[dict[str, Any]] = []
    other_writes: list[dict[str, Any]] = []

    def take(obj: dict[str, Any]) -> None:
        if _is_preview_effect_item(obj) or (
            str(obj.get("type") or "") == "device.command.call"
            and str(obj.get("commandCode") or obj.get("traitCode") or "") == "PreviewEffect"
        ):
            item = _preview_effect_batch_item(obj)
            if item:
                preview_items.append(item)
            return
        if _is_display_image_action(obj):
            display_actions.append(obj)
            return
        atype = str(obj.get("type") or "")
        if atype == "device.batch":
            for it in obj.get("items") or []:
                if isinstance(it, dict):
                    take(it)
            return
        # leftover trait writes / commands — only keep if no PreviewEffect later
        other_writes.append(obj)

    for a in actions or []:
        if isinstance(a, dict):
            take(a)

    out: list[dict[str, Any]] = []
    if preview_items:
        # Dedupe by deviceId+endpointId (keep first EffectData)
        seen: set[tuple[str, int]] = set()
        uniq: list[dict[str, Any]] = []
        for it in preview_items:
            key = (str(it.get("deviceId")), int(it.get("endpointId") or 2))
            if key in seen:
                continue
            seen.add(key)
            uniq.append(it)
        out.append(
            {
                "id": "action-1",
                "type": "device.batch",
                "items": uniq,
            }
        )
        # Official lighting scenes do not mix V1 Level/ColorXY with PreviewEffect.
        other_writes = []
    else:
        # No V2 effect — keep stringified trait writes (rare fallback)
        for i, raw in enumerate(other_writes, start=1):
            act = dict(raw)
            act.setdefault("id", f"action-{i}")
            act.pop("linkFrom", None)
            if act.get("type") in ("", None, "device.trait.write") and "value" in act:
                act["value"] = _stringify_value(act.get("value"))
                act["type"] = "device.trait.write"
            out.append(act)

    # Optional DisplayImage after batch (灯膜 png)；无 URL 则跳过
    for raw in display_actions:
        val = str(raw.get("value") or "")
        if not val.startswith("http"):
            continue
        act = {
            "id": f"action-{len(out) + 1}",
            "type": "device.trait.write",
            "functionCode": "ImageMediaManagement",
            "traitCode": "DisplayImage",
            "targets": list(raw.get("targets") or []),
            "value": val,
        }
        if not act["targets"] and raw.get("deviceId"):
            ep = raw.get("endpointId") or 3
            act["targets"] = [{"deviceId": str(raw["deviceId"]), "endpointIds": _as_endpoint_ids(ep)}]
        out.append(act)

    # re-id
    for i, a in enumerate(out, start=1):
        a["id"] = f"action-{i}"
    return out


def normalize_to_create_scene_actions(actions: list[Any]) -> list[dict[str, Any]]:
    """Backward-compatible alias → Studio-runnable normalize."""
    return normalize_to_studio_actions(actions)

def harvest_img_urls(obj: Any) -> list[str]:
    """Collect http(s) image URLs from any imgUrl/imageUrl/pictureUrl field."""
    found: list[str] = []
    seen: set[str] = set()

    def add(val: Any) -> None:
        if not isinstance(val, str):
            return
        u = val.strip()
        if u.startswith(("http://", "https://")) and u not in seen:
            # prefer image-like paths but accept any https (CDN may omit extension)
            seen.add(u)
            found.append(u)

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            for k, v in x.items():
                lk = str(k).lower()
                if lk in ("imgurl", "imageurl", "pictureurl", "image_url", "img_url", "displayimage"):
                    add(v)
                elif lk in ("value",) and isinstance(v, str) and (
                    ".png" in v.lower() or ".jpg" in v.lower() or ".jpeg" in v.lower() or ".webp" in v.lower()
                ):
                    add(v)
                walk(v)
        elif isinstance(x, list):
            for i in x:
                walk(i)

    walk(obj)
    return found


def collect_lightbox_gids(graph: dict[str, Any]) -> list[str]:
    """Graph Device nodes that look like 灯膜 / lightbox."""
    out: list[str] = []
    for n in graph.get("nodes") or []:
        nid = str(n.get("id") or "")
        if not nid.startswith("Device:"):
            continue
        props = n.get("properties") or {}
        name = str(props.get("name") or "")
        model = str(props.get("model") or "").lower()
        types = props.get("deviceTypesList") or []
        type_l = {str(t).lower() for t in types} if isinstance(types, list) else set()
        if (
            "灯膜" in name
            or "lightbox" in name.lower()
            or "lightbox" in model
            or "lightfilm" in model
            or "lightbox" in type_l
        ):
            out.append(nid)
    return out


def inject_lightbox_display_images(
    actions: list[Any],
    configs: list[Any],
    id_map: dict[str, str],
    structured: dict[str, Any] | None = None,
    graph: dict[str, Any] | None = None,
) -> tuple[list[Any], int, dict[str, Any]]:
    """MCP keeps lightBox.imgUrl in deviceTemplateConfigs but often omits DisplayImage.

    create_scene expects ImageMediaManagement/DisplayImage with value = raw image URL.
    Fill empty DisplayImage.value, or append a DisplayImage action when missing.
    """
    out = [a for a in actions if isinstance(a, dict)]
    filled_existing = 0
    injected = 0
    debug: dict[str, Any] = {
        "config_count": len(configs) if isinstance(configs, list) else 0,
        "routes": [],
        "img_urls_from_lightbox": [],
        "img_urls_harvested": [],
        "lightbox_gids_graph": [],
    }

    img_by_gid: dict[str, tuple[str, int]] = {}
    for cfg in configs or []:
        if not isinstance(cfg, dict):
            continue
        route = str(cfg.get("route") or "")
        debug["routes"].append({"graphDeviceId": cfg.get("graphDeviceId"), "route": route, "status": cfg.get("status")})
        if str(cfg.get("status") or "").lower() == "unmatched":
            continue
        box = ((cfg.get("config") or {}) if isinstance(cfg.get("config"), dict) else {}).get("lightBox")
        if not isinstance(box, dict):
            continue
        if str(box.get("status") or "").lower() == "off":
            continue
        img = str(box.get("imgUrl") or box.get("imageUrl") or "").strip()
        if not img.startswith(("http://", "https://")):
            continue
        gid = str(cfg.get("graphDeviceId") or "").strip()
        if not gid:
            continue
        ep = box.get("displayEndpointId", box.get("endpointId"))
        try:
            endpoint = int(ep) if ep is not None else 3
        except (TypeError, ValueError):
            endpoint = 3
        # create_scene 灯膜图常用 endpoint 3；若 MCP 给的是亮度端点 2，仍优先 3 写 DisplayImage
        if endpoint == 2:
            endpoint = 3
        img_by_gid[gid] = (img, endpoint)
        debug["img_urls_from_lightbox"].append({"graphDeviceId": gid, "imgUrl": img, "endpoint": endpoint})

    harvested = harvest_img_urls(structured if structured is not None else {"deviceTemplateConfigs": configs})
    debug["img_urls_harvested"] = harvested

    # Fallback: MCP put imgUrl somewhere but not bound to a lightBox device — bind to graph 灯膜
    if not img_by_gid and harvested and graph:
        lightbox_gids = collect_lightbox_gids(graph)
        debug["lightbox_gids_graph"] = lightbox_gids
        primary = harvested[0]
        for gid in lightbox_gids:
            img_by_gid[gid] = (primary, 3)
    elif graph:
        debug["lightbox_gids_graph"] = collect_lightbox_gids(graph)

    for action in out:
        if not _is_display_image_action(action):
            continue
        val = action.get("value")
        if isinstance(val, str) and val.strip().startswith(("http://", "https://")):
            continue
        if val not in (None, "", 0, "0"):
            continue
        for gid in _action_graph_ids(action):
            if gid in img_by_gid:
                action["value"] = img_by_gid[gid][0]
                filled_existing += 1
                break
        if (not isinstance(action.get("value"), str) or not action["value"].startswith("http")) and harvested:
            action["value"] = harvested[0]
            filled_existing += 1

    gids_with_display: set[str] = set()
    for action in out:
        if _is_display_image_action(action):
            gids_with_display |= _action_graph_ids(action)
            # also count by studio deviceId via targets
            for t in action.get("targets") or []:
                if isinstance(t, dict) and t.get("graphDeviceId"):
                    gids_with_display.add(str(t["graphDeviceId"]))

    for gid, (img, endpoint) in img_by_gid.items():
        if gid in gids_with_display:
            continue
        studio = id_map.get(gid, "")
        out.append(
            {
                "id": _next_action_id(out),
                "type": "device.trait.write",
                "functionCode": "ImageMediaManagement",
                "traitCode": "DisplayImage",
                "targets": [
                    {
                        "deviceId": studio,
                        "endpointIds": [endpoint],
                        "graphDeviceId": gid,
                    }
                ],
                "value": img,
            }
        )
        injected += 1
        gids_with_display.add(gid)

    debug["injected"] = injected
    debug["filled_existing"] = filled_existing
    return out, filled_existing + injected, debug


def extract_graph_url(payload: dict[str, Any]) -> str:
    for key in ("url", "graph_url", "graphUrl", "source_url", "spatial_graph_url"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip().startswith(("http://", "https://")):
            return val.strip()
    upload = payload.get("upload") or payload.get("spatial_graph_upload") or {}
    if isinstance(upload, dict):
        for key in ("url", "graph_url", "graphUrl"):
            val = upload.get(key)
            if isinstance(val, str) and val.strip().startswith(("http://", "https://")):
                return val.strip()
    graph = payload.get("spatial_graph") or payload.get("graph") or {}
    if isinstance(graph, dict):
        meta = graph.get("meta") or {}
        for key in ("url", "graph_url", "sourceUrl"):
            val = graph.get(key) or meta.get(key)
            if isinstance(val, str) and val.strip().startswith(("http://", "https://")):
                return val.strip()
    return ""


def call_mcp_http(template: str, device_ids: list[str], graph_url: str) -> dict[str, Any]:
    endpoint = (os.environ.get("PROFILE_MCP_SERVER_URL") or "http://127.0.0.1:8076/scene-profile/mcp").strip()
    token = (os.environ.get("PROFILE_MCP_SERVER_TOKEN") or "").strip()
    if not token:
        return {"ok": False, "error": "PROFILE_MCP_SERVER_TOKEN missing", "errorCode": "NO_TOKEN"}
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "scene_profile_match_template",
            "arguments": {"name": template, "deviceIds": device_ids, "url": graph_url},
        },
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        return {"ok": False, "error": f"HTTP {e.code}: {detail}", "errorCode": "HTTP_ERROR"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "errorCode": "NETWORK"}

    payload = None
    text = raw.strip()
    if text.startswith("{"):
        payload = json.loads(text)
    else:
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                chunk = line[5:].strip()
                if chunk and chunk != "[DONE]":
                    try:
                        payload = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
    if not isinstance(payload, dict):
        return {"ok": False, "error": "unparseable MCP response", "errorCode": "BAD_RESPONSE"}

    result = payload.get("result") or {}
    structured = result.get("structuredContent")
    if structured is None and isinstance(result.get("content"), list):
        for block in result["content"]:
            if isinstance(block, dict) and block.get("type") == "text":
                try:
                    structured = json.loads(block.get("text") or "")
                    break
                except json.JSONDecodeError:
                    continue
    if not isinstance(structured, dict):
        if "error" in payload:
            return {"ok": False, "error": str(payload.get("error")), "errorCode": "RPC_ERROR"}
        return {"ok": False, "error": "missing structuredContent", "errorCode": "BAD_RESULT"}
    return structured


def normalize_mcp_result(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"ok": False, "error": "mcp_result not object", "errorCode": "BAD_MCP"}
    if "structuredContent" in raw and isinstance(raw["structuredContent"], dict):
        return raw["structuredContent"]
    if "result" in raw and isinstance(raw["result"], dict):
        sc = raw["result"].get("structuredContent")
        if isinstance(sc, dict):
            return sc
    return raw


def assemble(
    scene_id: str,
    row: dict[str, Any],
    template: str,
    structured: dict[str, Any],
    id_map: dict[str, str],
    devices: list[dict],
    graph: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not structured.get("ok"):
        return {
            "status": "UNMET",
            "scene_id": scene_id,
            "label": row.get("label"),
            "lighting_profile": template,
            "scene": None,
            "missing": ["情景照明库匹配失败"],
            "notes": [str(structured.get("error") or "MCP ok=false")],
            "recommend": [
                f"- 确认模板名精确为「{template}」",
                "- 确认图谱 url 可访问且 deviceIds 都在该图中",
                "- 确认 Automation Agent 已挂 builder-scene-mcp",
            ],
            "mcp": {"error": structured.get("error"), "errorCode": structured.get("errorCode")},
            "device_count": len(devices),
        }

    data = structured.get("data") or {}
    actions = ((data.get("config") or {}).get("actions")) or []
    # Accept configs at data or top-level (agent sometimes flattens)
    configs = data.get("deviceTemplateConfigs") or structured.get("deviceTemplateConfigs") or []
    if not isinstance(configs, list):
        configs = []
    unmatched = [
        c
        for c in configs
        if isinstance(c, dict)
        and (
            str(c.get("status") or "").lower() == "unmatched"
            or (c.get("config") is None and str(c.get("status") or "").lower() != "matched")
        )
    ]
    # Pack to Studio-runnable shape（官方蓝天=单条 device.batch PreviewEffect，勿拆 command.call）
    actions_list = normalize_to_studio_actions(list(actions) if isinstance(actions, list) else [])
    has_preview_batch = any(
        isinstance(a, dict) and a.get("type") == "device.batch"
        and any(_is_preview_effect_item(it) for it in (a.get("items") or []) if isinstance(it, dict))
        for a in actions_list
    )
    lightbox_imgs = 0
    lightbox_debug: dict[str, Any] = {"skipped_display_image": False}
    if has_preview_batch:
        # 官方可运行版不含 DisplayImage；PreviewEffect 已带画面，再写 DisplayImage 易 Invalid
        lightbox_debug["skipped_display_image"] = True
        lightbox_debug["reason"] = "PreviewEffect batch present; match official runnable shape"
        harvested = harvest_img_urls(structured) + harvest_img_urls({"configs": configs})
        lightbox_debug["img_urls_available_but_not_injected"] = harvested[:5]
        lightbox_imgs = 0
    else:
        actions_list, lightbox_imgs, lightbox_debug = inject_lightbox_display_images(
            actions_list, configs, id_map, structured=structured, graph=graph
        )

    if not actions_list:
        return {
            "status": "UNMET",
            "scene_id": scene_id,
            "label": row.get("label"),
            "lighting_profile": template,
            "scene": None,
            "missing": ["无可保存的情景照明动作"],
            "notes": [structured.get("summary") or "actions 为空"],
            "recommend": ["- 换支持该模板的灯后再试", f"- 确认模板「{template}」已上架"],
            "unmatched_count": len(unmatched),
            "device_count": len(devices),
            "lightbox_debug": lightbox_debug,
        }

    filled = fill_device_ids(actions_list, id_map)
    has_display = any(
        isinstance(a, dict) and _is_display_image_action(a) and str(a.get("value") or "").startswith("http")
        for a in filled
    )
    scene_name = str(data.get("name") or row.get("label") or template)
    # Same classic JSON_SCENE envelope as 观影/回家; lighting-only extra = DisplayImage + png URL.
    scene = {
        "name": scene_name,
        "configFormat": "JSON_SCENE",
        "createTime": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "config": {
            "metadata": {
                "name": scene_name,
                "scope": [],
                "variables": [],
                "description": f"由情景照明库模板「{template}」匹配生成",
            },
            "actions": filled,
        },
    }
    scene, guard_notes = sanitize_scene(scene)
    filled = ((scene or {}).get("config") or {}).get("actions") or []
    has_preview_batch = any(
        isinstance(a, dict)
        and a.get("type") == "device.batch"
        and any(_is_preview_effect_item(it) for it in (a.get("items") or []) if isinstance(it, dict))
        for a in filled
    )
    has_display = any(
        isinstance(a, dict) and _is_display_image_action(a) and str(a.get("value") or "").startswith("http")
        for a in filled
    )
    if not filled:
        return {
            "status": "UNMET",
            "scene_id": scene_id,
            "label": row.get("label"),
            "lighting_profile": template,
            "scene": None,
            "missing": ["无有效可写能力动作（能力消毒后为空）"],
            "notes": guard_notes,
            "recommend": ["- 检查 MCP 返回的 functionCode/traitCode 是否在 Spec 可写白名单"],
            "lightbox_debug": lightbox_debug,
            "device_count": len(devices),
        }

    status = "DEGRADED" if unmatched else "OK"
    missing = []
    notes = [structured.get("summary") or f"已匹配模板「{template}」"] + guard_notes
    recommend = []
    if unmatched:
        missing.append(f"{len(unmatched)} 台灯未匹配模板")
        notes.append("部分设备未匹配，已按可匹配设备生成。")
        recommend.append("- 未匹配灯具：建议换支持该模板能力的灯。")
    if has_preview_batch:
        notes.append(
            "已按官方可运行形态打包：单条 device.batch + Lighting.PreviewEffect（未拆 command.call，未混 ColorXY/Level）。"
        )
        if lightbox_debug.get("img_urls_available_but_not_injected"):
            notes.append(
                "MCP 有灯膜 png URL，但 Studio 实测官方场景不写 DisplayImage；已跳过以免 Invalid scene configuration。"
            )
    elif lightbox_imgs:
        notes.append(
            f"无 PreviewEffect，已补全 {lightbox_imgs} 条 DisplayImage（value=原始 png URL）。"
        )
    elif not has_display:
        status = "DEGRADED"
        missing.append("PreviewEffect 或灯膜 DisplayImage")
        notes.append("既无 PreviewEffect batch，也无 DisplayImage；场景可能无法呈现照明效果。")
        recommend.append("- 确认 MCP structuredContent 含 Lighting.PreviewEffect 或 lightBox.imgUrl")
        if not configs:
            notes.append("警告：本次 mcp_result 没有 deviceTemplateConfigs。")
    notes.append(
        "artifact=json.standard_scene；照明库以官方可运行 device.batch/PreviewEffect 为准。"
    )
    logic_for_user = build_logic_for_user(
        label=str(row.get("label") or scene_name),
        need=str(row.get("need") or ""),
        trigger_hint=str(row.get("trigger_hint") or ""),
        actions=filled,
        status=status,
        lighting_profile=template,
    )
    return {
        "status": status,
        "scene_id": scene_id,
        "label": row.get("label"),
        "lighting_profile": template,
        "artifact_shape": "JSON_SCENE",
        "scene": scene,
        "logic_for_user": logic_for_user,
        "missing": missing,
        "notes": notes,
        "recommend": recommend,
        "matched_actions": len(filled),
        "lightbox_display_images": lightbox_imgs,
        "has_display_image": has_display,
        "lightbox_debug": lightbox_debug,
        "unmatched_count": len(unmatched),
        "device_count": len(devices),
    }


def main() -> int:
    payload = load_payload()
    scene_id = resolve_scene_id(str(payload.get("scene") or payload.get("name") or ""))
    if not scene_id:
        print(json.dumps({"status": "UNMET", "error": "unknown scene"}, ensure_ascii=False))
        return 1

    row = catalog_row(scene_id)
    template = (os.environ.get("PROFILE_MCP_TEMPLATE") or row.get("lighting_profile") or "").strip()
    if not template:
        print(json.dumps({"status": "UNMET", "error": "lighting_profile empty", "scene_id": scene_id}, ensure_ascii=False))
        return 1

    graph = payload.get("spatial_graph") or payload.get("graph")
    if not isinstance(graph, dict) or "nodes" not in graph:
        print(json.dumps({"status": "UNMET", "error": "spatial_graph missing nodes"}, ensure_ascii=False))
        return 1

    device_ids, id_map, devices = collect_light_ids(graph)
    if not device_ids:
        print(
            json.dumps(
                {
                    "status": "UNMET",
                    "scene_id": scene_id,
                    "label": row.get("label"),
                    "lighting_profile": template,
                    "scene": None,
                    "missing": ["可调光灯或灯带（核心）"],
                    "notes": ["当前空间没有可用于情景照明匹配的灯。"],
                    "recommend": ["- 可调光灯或灯带（核心）：情景照明库需要至少一台可写灯光设备。"],
                    "device_count": 0,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return 2

    # Mode 2: assemble from mcp_result
    if payload.get("mcp_result") is not None:
        structured = normalize_mcp_result(payload.get("mcp_result"))
        out = assemble(scene_id, row, template, structured, id_map, devices, graph=graph)
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 0 if out.get("status") in ("OK", "DEGRADED") else 2

    graph_url = extract_graph_url(payload)
    force_http = bool(payload.get("force_http")) or bool(os.environ.get("PROFILE_MCP_SERVER_TOKEN"))

    # Mode 3: local HTTP if token present and url present
    if force_http and graph_url:
        structured = call_mcp_http(template, device_ids, graph_url)
        if not structured.get("ok"):
            alt = "蓝天白云场景" if template != "蓝天白云场景" else "蓝天白云"
            if alt != template:
                alt_result = call_mcp_http(alt, device_ids, graph_url)
                if alt_result.get("ok"):
                    structured = alt_result
                    template = alt
        out = assemble(scene_id, row, template, structured, id_map, devices, graph=graph)
        print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        return 0 if out.get("status") in ("OK", "DEGRADED") else 2

    # Mode 1: prepare for agent MCP call
    if not graph_url:
        print(
            json.dumps(
                {
                    "status": "UNMET",
                    "scene_id": scene_id,
                    "error": "graph url missing",
                    "notes": [
                        "builder.spatial_graph.upload 返回里应有图谱 JSON 的 url；请把该 url 原样传入本脚本的 url 字段，或先调 MCP 再带 mcp_result 回来组装。"
                    ],
                    "deviceIds": device_ids,
                    "lighting_profile": template,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return 2

    out = {
        "status": "PREPARE",
        "scene_id": scene_id,
        "label": row.get("label"),
        "lighting_profile": template,
        "mcp_tool": "scene_profile_match_template",
        "mcp_arguments": {
            "name": template,
            "deviceIds": device_ids,
            "url": graph_url,
        },
        "notes": [
            "下一步：用中台 MCP builder-scene-mcp 调 scene_profile_match_template，参数用 mcp_arguments。",
            "返回 structuredContent 后，再跑本脚本并传入 mcp_result + spatial_graph 组装 json.standard_scene。",
            "若模板找不到，可把 name 改成「蓝天白云场景」再试一次。",
        ],
        "device_count": len(devices),
    }
    print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
