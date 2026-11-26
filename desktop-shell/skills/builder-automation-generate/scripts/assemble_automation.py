#!/usr/bin/env python3
"""从 spatial_graph 或平台注入的设备摘要 + 灯光预设，组装 schema-first automation-instance。

用法（工作目录 = Skill 根目录）:
  python3 scripts/assemble_automation.py path/to/spatial_graph.json
  python3 scripts/assemble_automation.py --summary path/to/device_summary.json
  python3 scripts/assemble_automation.py -   # stdin JSON

stdout JSON:
  { "payload", "markdown_table", "summary_line", "capability_notes", "validate_ok", "validate_errors" }
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESET_PATH = ROOT / "assets" / "presets" / "light-basic.json"
TEMPLATE_DIR = ROOT / "assets" / "device_templates"
VALIDATE_SCRIPT = ROOT / "scripts" / "validate_automation_instance.py"

LIGHT_TYPE_HINTS = ("Light", "ColorTemperatureLight", "DimmableLight", "ExtendedColorLight")
MOTION_HINTS = ("MotionSensor", "OccupancySensor")
CONTACT_HINTS = ("ContactSensor", "MagnetSensor")


def load_json(arg: str):
    if arg == "-":
        return json.loads(sys.stdin.read())
    return json.loads(Path(arg).read_text(encoding="utf-8"))


def from_summary(data: dict) -> list[dict]:
    devices = []
    for d in data.get("devices") or []:
        devices.append(
            {
                "deviceId": d.get("deviceId") or d.get("id"),
                "name": d.get("name") or d.get("displayName") or "",
                "model": d.get("model") or d.get("resourceId") or "",
                "roomId": d.get("roomId"),
                "roomName": d.get("roomName") or "",
                "deviceTypes": d.get("deviceTypes") or d.get("deviceTypesList") or [],
            }
        )
    return devices


def from_graph(graph: dict) -> list[dict]:
    nodes = {n["id"]: n for n in graph.get("nodes") or [] if isinstance(n, dict) and "id" in n}
    room_name = {}
    for n in nodes.values():
        if n.get("nodeType") == "Room":
            room_name[n["id"]] = (n.get("properties") or {}).get("name") or n["id"]
    belongs = {}
    for e in graph.get("edges") or []:
        if e.get("edgeType") == "belongsTo":
            belongs[e.get("source")] = e.get("target")
    devices = []
    for n in nodes.values():
        if n.get("nodeType") != "Device":
            continue
        props = n.get("properties") or {}
        rid = belongs.get(n["id"])
        # walk up to room
        room_id, rname = None, ""
        cur = rid
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            node = nodes.get(cur)
            if not node:
                break
            if node.get("nodeType") == "Room":
                room_id = cur
                rname = room_name.get(cur, "")
                break
            cur = belongs.get(cur)
        devices.append(
            {
                "deviceId": n["id"],
                "name": props.get("name") or "",
                "model": props.get("resourceId") or "",
                "roomId": room_id,
                "roomName": rname,
                "deviceTypes": props.get("deviceTypesList") or [],
            }
        )
    return devices


def is_light(dev: dict) -> bool:
    types = set(dev.get("deviceTypes") or [])
    if types & set(LIGHT_TYPE_HINTS):
        return True
    model = (dev.get("model") or "").lower()
    if model.startswith("lumi.light.") or ".light." in model:
        return True
    name = dev.get("name") or ""
    return any(k in name for k in ("灯", "筒灯", "射灯", "吸顶", "灯带"))


def is_motion(dev: dict) -> bool:
    types = set(dev.get("deviceTypes") or [])
    if types & set(MOTION_HINTS):
        return True
    model = (dev.get("model") or "").lower()
    return "motion" in model or "occupy" in model


def is_contact(dev: dict) -> bool:
    types = set(dev.get("deviceTypes") or [])
    if types & set(CONTACT_HINTS):
        return True
    model = (dev.get("model") or "").lower()
    return "magnet" in model or "contact" in model


_template_cache: dict[str, dict] = {}


def load_template(model: str) -> dict | None:
    if not model:
        return None
    if model in _template_cache:
        return _template_cache[model]
    path = TEMPLATE_DIR / f"{model}.json"
    if not path.exists():
        _template_cache[model] = None
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    _template_cache[model] = data
    return data


def _ep_trait_map(ep: dict) -> dict:
    found = {}
    eid = ep.get("endpointId")
    for fn in ep.get("functions") or []:
        fcode = fn.get("functionCode")
        for tr in fn.get("traits") or []:
            tcode = tr.get("traitCode")
            param = tr.get("parameter") or {}
            roles = tr.get("automationRoles") or []
            if not param.get("writable"):
                continue
            if roles and "action" not in roles:
                continue
            if tcode in ("OnOff", "CurrentLevel", "ColorTemperature") and tcode not in found:
                found[tcode] = {"functionCode": fcode, "endpointId": eid}
    return found


def probe_traits(model: str) -> dict:
    """Return {traitCode: {functionCode, endpointId}} for writable action traits we care about."""
    tpl = load_template(model)
    if not tpl:
        return {}
    eps = ((tpl.get("capabilities") or {}).get("endpoints")) or []
    maps = [(ep.get("endpointId") or 0, _ep_trait_map(ep)) for ep in eps]
    # prefer endpoint that has OnOff (control surface), then higher id
    maps.sort(key=lambda x: (0 if "OnOff" in x[1] else 1, -x[0]))
    out = {}
    for _, m in maps:
        for k, v in m.items():
            if k not in out:
                out[k] = v
    return out


TRAIT_FN_FALLBACK = {
    "OnOff": "Output",
    "CurrentLevel": "LevelControl",
    "ColorTemperature": "ColorControl",
}


def resolve_devices(role: str, lights: list[dict]) -> list[dict]:
    if not lights:
        return []
    if role == "all_lights":
        return lights
    if role == "primary_light":
        return [lights[0]]
    if role == "secondary_lights":
        return lights[1:] if len(lights) > 1 else []
    return []


def build_action(dev: dict, trait: str, value, optional: bool, gaps: list) -> dict | None:
    probed = probe_traits(dev["model"])
    info = probed.get(trait)
    if not info:
        if optional:
            return None
        gaps.append(
            {
                "deviceId": dev["deviceId"],
                "model": dev["model"],
                "traitCode": trait,
                "reason": "template_missing_or_not_writable",
            }
        )
        return None
    return {
        "type": "device.trait.write",
        "functionCode": info["functionCode"] or TRAIT_FN_FALLBACK.get(trait, "Output"),
        "traitCode": trait,
        "targets": [{"deviceId": dev["deviceId"], "endpointIds": [info["endpointId"]]}],
        "value": value,
    }


def assemble(devices: list[dict], preset: dict) -> tuple[dict, list[str]]:
    lights = [d for d in devices if is_light(d) and d.get("deviceId")]
    motions = [d for d in devices if is_motion(d)]
    contacts = [d for d in devices if is_contact(d)]
    notes = []
    gaps = []

    if len(lights) < (preset.get("requires") or {}).get("minLights", 1):
        raise SystemExit("no lights found in graph/summary — cannot assemble light-basic pack")

    # primary = first light (prefer name with 吸顶)
    lights = sorted(
        lights,
        key=lambda d: (0 if "吸顶" in (d.get("name") or "") else 1, d.get("name") or ""),
    )

    automations = []
    for item in preset.get("automations") or []:
        actions = []
        for spec in item.get("actions") or []:
            role = spec["role"]
            trait = spec["trait"]
            value = spec["value"]
            optional = bool(spec.get("optional"))
            for dev in resolve_devices(role, lights):
                act = build_action(dev, trait, value, optional, gaps)
                if act:
                    actions.append(act)
        if not actions:
            continue
        auto = {
            "name": item["name"],
            "starters": [item["starter"]],
            "actions": actions,
        }
        automations.append(auto)

    for g in preset.get("gapsWhenMissing") or []:
        if g.get("when") == "no_motion" and not motions:
            notes.append(g["message"])
        if g.get("when") == "no_contact" and not contacts:
            notes.append(g["message"])

    room_names = sorted({d.get("roomName") for d in lights if d.get("roomName")})
    scope_name = "、".join(room_names) if room_names else "全屋"
    payload = {
        "metadata": {
            "name": f"{scope_name}灯光基础方案",
            "description": preset.get("description") or "灯光定时与一键场景",
            "scope": [],
        },
        "capability_gaps": gaps,
        "automations": automations,
    }
    return payload, notes


def markdown_table(payload: dict) -> str:
    lines = [
        "| 名称 | 类型 | 何时 / 怎么触发 | 做什么 |",
        "|------|------|-----------------|--------|",
    ]
    for a in payload.get("automations") or []:
        st = (a.get("starters") or [{}])[0]
        if st.get("type") == "time.schedule":
            kind, when = "定时", f"每天 {st.get('at')}"
        elif st.get("type") == "manual":
            kind, when = "一键场景", "手动点击"
        elif st.get("type") == "property.event":
            kind, when = "联动", "设备事件"
        else:
            kind, when = st.get("type") or "?", "?"
        # compact action summary
        parts = []
        for act in a.get("actions") or []:
            tid = ((act.get("targets") or [{}])[0]).get("deviceId", "")
            short = tid.split(":")[-1][:12]
            parts.append(f"{act.get('traitCode')}={act.get('value')}@{short}")
        what = "；".join(parts[:6])
        if len(parts) > 6:
            what += "…"
        lines.append(f"| {a.get('name')} | {kind} | {when} | {what} |")
    return "\n".join(lines)


def validate_payload(payload: dict) -> tuple[bool, list[str]]:
    # inline minimal reuse of validate logic without writing temp if possible
    sys.path.insert(0, str(VALIDATE_SCRIPT.parent))
    try:
        import validate_automation_instance as v

        errors = v.validate(payload, require_probe=False)
        return (len(errors) == 0, errors)
    except Exception as e:
        return False, [f"validator_import_failed: {e}"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?", default="-", help="spatial_graph.json or - for stdin")
    ap.add_argument("--summary", action="store_true", help="input is device summary JSON")
    ap.add_argument("--preset", default=str(PRESET_PATH), help="preset json path")
    args = ap.parse_args()

    raw = load_json(args.input)
    if args.summary or (isinstance(raw, dict) and "devices" in raw and "nodes" not in raw):
        devices = from_summary(raw)
    else:
        devices = from_graph(raw)

    preset = json.loads(Path(args.preset).read_text(encoding="utf-8"))
    payload, notes = assemble(devices, preset)
    ok, errs = validate_payload(payload)
    n_auto = len(payload.get("automations") or [])
    summary = f"已按「{preset.get('title')}」生成 {n_auto} 条联动/场景。"
    if notes:
        summary += " " + "；".join(notes)

    out = {
        "payload": payload,
        "markdown_table": markdown_table(payload),
        "summary_line": summary,
        "capability_notes": notes,
        "validate_ok": ok,
        "validate_errors": errs,
        "device_counts": {
            "lights": sum(1 for d in devices if is_light(d)),
            "motion": sum(1 for d in devices if is_motion(d)),
            "contact": sum(1 for d in devices if is_contact(d)),
            "total": len(devices),
        },
    }
    print(json.dumps(out, ensure_ascii=False))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
