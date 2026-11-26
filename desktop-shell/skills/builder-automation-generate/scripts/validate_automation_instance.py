#!/usr/bin/env python3
"""Validate automation-instance JSON (or artifact_tool wrapper) against v0 schema shape checks."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "assets" / "schemas" / "automation-instance-v0.schema.json"
if not SCHEMA_PATH.exists():
    SCHEMA_PATH = (
        ROOT.parents[1]
        / "automation范式说明及范例"
        / "automation-instance-v0.schema.json"
    )

HHMM = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
SCOPE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9]*$")
DURATION = re.compile(r"^\d+(\.\d+)?(sec|s|min|m|hour|h)$", re.I)
# 云端 2026 Undefined variable reference: cube —— 角色词当了 deviceId / 引用了未声明的 scope 名
NICKNAME_ID = re.compile(r"^[a-z][a-z_]*$")
# 方案名误用房间图节点 id（应取 properties.name）
ROOM_GRAPH_ID_IN_NAME = re.compile(r"Room:zone_room_|zone_room_\d+", re.I)

FORBIDDEN_ROOT_KEYS = {
    "scenes",
    "version",
    "generated_from",
    "note",
    "trigger",
}
FORBIDDEN_ACTION_KEYS = {
    "command",
    "params",
    "device_id",
    "device_name",
    "room_id",
    "delay",
    "set",
    "target",
    "if",
    "then",
    "else",
}
FORBIDDEN_ACTION_TYPES = {
    "device.control",
    "device.write",
    "control",
    "write",
    "command",
    "set",
    "condition",
    "if",
    "branch",
}
# 实测翻车：device/property/function/type:boolean/propertyId
FORBIDDEN_SCOPE_KEYS = {
    "device",
    "property",
    "function",
    "room",
    "model",
    "resourceId",
    "propertyId",
}
FAKE_FN_EXACT = {
    "setlight",
    "setbrightness",
    "set_mode",
    "set_position",
    "dispense",
    "setcolor",
    "setcolour",
    "setlevel",
}
# trait 常见大小写错误（模板为 PascalCase）
TRAIT_CASE_FIX = {
    "onoff": "OnOff",
    "currentlevel": "CurrentLevel",
    "colortemperature": "ColorTemperature",
    "occupancy": "Occupancy",
    "contact": "Contact",
}
# 云端 2026：设备上没有的点一律 Property not found。Hue/Sat 是已知编造例，不是唯一例。
INVENTED_COLOR_TRAITS = {"Hue", "Saturation"}


def split_probe(data: dict) -> tuple[dict, dict | None]:
    if not isinstance(data, dict):
        return data, None
    if isinstance(data.get("instance"), dict) and (
        isinstance(data.get("probe"), dict) or isinstance(data.get("_probe"), dict)
    ):
        return data["instance"], data.get("probe") or data.get("_probe")
    extra = data.get("_probe")
    if isinstance(extra, dict):
        return {k: v for k, v in data.items() if k != "_probe"}, extra
    return data, None


def _index_probe(probe: dict) -> dict:
    if isinstance(probe.get("byDevice"), dict) and probe["byDevice"]:
        return probe["byDevice"]
    idx: dict = {}
    for w in probe.get("writes") or []:
        if not isinstance(w, dict) or not w.get("ok"):
            continue
        row = {
            k: w.get(k)
            for k in ("functionCode", "traitCode", "min", "max", "values", "valueType")
        }
        for t in w.get("targets") or []:
            if not isinstance(t, dict) or not t.get("deviceId"):
                continue
            eps = t.get("endpointIds") or [None]
            idx.setdefault(str(t["deviceId"]), {"writes": [], "events": []})[
                "writes"
            ].append({**row, "endpointId": eps[0]})
    for s in probe.get("scopes") or []:
        if isinstance(s, dict) and s.get("ok") and s.get("deviceId"):
            idx.setdefault(str(s["deviceId"]), {"writes": [], "events": []})[
                "events"
            ].append(s)
    return idx


def _cap_row(rows: list, fcode: str, tcode: str):
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("traitCode") or "") != tcode:
            continue
        if fcode and str(row.get("functionCode") or "") not in ("", fcode):
            continue
        return row
    return None


def _value_in_range(row: dict, value) -> str | None:
    if row.get("min") is not None and isinstance(value, (int, float)) and value < row["min"]:
        return f"value {value} < min {row['min']}"
    if row.get("max") is not None and isinstance(value, (int, float)) and value > row["max"]:
        return f"value {value} > max {row['max']}"
    vals = row.get("values")
    if vals and value not in vals and str(value) not in [str(x) for x in vals]:
        return f"value {value!r} not in probe values"
    return None


def _is_nickname_id(raw: str) -> bool:
    return bool(NICKNAME_ID.match((raw or "").strip()))


def _check_device_id(errors: list[str], prefix: str, did: str) -> None:
    if _is_nickname_id(did):
        err(
            errors,
            f"{prefix} deviceId={did!r} is a role nickname; "
            "cloud 2026 Undefined variable reference. "
            "Use the space device id (Device:item_*/matt.*/lumi.+hex), not cube/light/switch",
        )
    if did.startswith("item_"):
        err(
            errors,
            f"{prefix} deviceId={did!r} dropped the Device: prefix. "
            "Use the graph node id Device:item_... exactly",
        )


def _needs_probe(inst: dict) -> bool:
    if (inst.get("metadata") or {}).get("scope"):
        return True
    for auto in inst.get("automations") or []:
        if not isinstance(auto, dict):
            continue
        for st in auto.get("starters") or []:
            if isinstance(st, dict) and st.get("type") == "property.event":
                return True
        for act in auto.get("actions") or []:
            if isinstance(act, dict) and act.get("type") == "device.trait.write":
                return True
    return False


def load_instance(path: Path | None = None, raw: str | None = None) -> dict:
    if raw is None:
        if path is None:
            raise ValueError("need path or raw JSON")
        raw = path.read_text(encoding="utf-8")
    if "//" in raw:
        raise ValueError("file contains // comments — not valid JSON")
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("artifact_type") == "automation_instance_v0":
        payload = data.get("payload")
        if not isinstance(payload, dict):
            raise ValueError("artifact_tool wrapper missing object payload")
        return payload
    if isinstance(data, dict) and data.get("name") == "json.automation":
        content = data.get("content")
        if isinstance(content, str):
            content = json.loads(content)
        if not isinstance(content, dict):
            raise ValueError("artifact_tool json.automation missing object content")
        return content
    return data


def err(errors: list[str], msg: str) -> None:
    errors.append(msg)


def _bad_function_code(fcode: str) -> bool:
    low = (fcode or "").lower()
    if low in FAKE_FN_EXACT:
        return True
    if low.startswith("set") and low not in {"settings"}:
        return True
    return False


def _check_trait_case(errors: list[str], prefix: str, trait: str) -> None:
    if not trait:
        return
    low = trait.lower()
    if low in TRAIT_CASE_FIX and trait != TRAIT_CASE_FIX[low]:
        err(
            errors,
            f"{prefix} traitCode={trait!r} wrong case; use {TRAIT_CASE_FIX[low]!r}",
        )


def _load_index(loads) -> dict:
    idx = {}
    if not isinstance(loads, list):
        return idx
    for row in loads:
        if not isinstance(row, dict):
            continue
        tid = str(row.get("targetId") or "")
        if tid:
            idx[tid] = row
    return idx


def _unaddressable_load(row: dict) -> bool:
    if row.get("shell") is True:
        return True
    if str(row.get("targetType") or "") == "HomeAppliance":
        return True
    model = str(row.get("model") or "")
    return model.startswith("lumi.models.")


def validate(
    inst: dict,
    probe: dict | None = None,
    require_probe: bool = True,
    loads=None,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(inst, dict):
        return ["root must be object"]
    if probe is None:
        inst, probe = split_probe(inst)
    by_dev = _index_probe(probe) if isinstance(probe, dict) else {}
    load_by_target = _load_index(loads)
    if _needs_probe(inst) and require_probe and not by_dev:
        err(
            errors,
            "missing probe — wrap as {instance, probe:{byDevice}} "
            "(copy byDevice only, not full probe stdout). "
            "Otherwise invented traits pass shape and fail deploy 2026",
        )

    for k in FORBIDDEN_ROOT_KEYS:
        if k in inst:
            err(errors, f"forbidden root key for schema-first pack: {k}")

    scope_names: set[str] = set()
    scope_traits: dict[str, str] = {}
    scope_devices: dict[str, str] = {}
    scope_fn: dict[str, str] = {}
    if "metadata" not in inst:
        err(errors, "missing required root.metadata")
    else:
        md = inst["metadata"]
        if not isinstance(md, dict) or not md.get("name"):
            err(errors, "metadata.name is required")
        elif isinstance(md.get("name"), str) and ROOM_GRAPH_ID_IN_NAME.search(md["name"]):
            err(
                errors,
                "metadata.name must use Room.properties.name "
                "(displayName / inventory.roomName), not graph id like "
                "Room:zone_room_3_imported",
            )
        if "scope" in md:
            if not isinstance(md["scope"], list):
                err(errors, "metadata.scope must be array when present")
            else:
                for si, se in enumerate(md["scope"]):
                    sp = f"metadata.scope[{si}]"
                    if isinstance(se, str):
                        err(
                            errors,
                            f"{sp} must be device.property object, not deviceId string",
                        )
                        continue
                    if not isinstance(se, dict):
                        err(errors, f"{sp} must be object")
                        continue
                    bad_keys = [k for k in FORBIDDEN_SCOPE_KEYS if k in se]
                    if bad_keys:
                        err(
                            errors,
                            f"{sp} forbidden keys {bad_keys} — use "
                            "name/type/deviceId/endpointId/functionCode/traitCode "
                            "(not device/property/function/room)",
                        )
                    if se.get("type") != "device.property":
                        err(
                            errors,
                            f"{sp}.type must be 'device.property' "
                            f"(got {se.get('type')!r}; never boolean/string)",
                        )
                    for req in ("name", "deviceId", "endpointId", "functionCode", "traitCode"):
                        if req not in se:
                            err(errors, f"{sp} missing {req}")
                    if se.get("deviceId") is not None:
                        scope_did = str(se.get("deviceId") or "")
                        _check_device_id(errors, sp, scope_did)
                        scope_load = load_by_target.get(scope_did)
                        if scope_load and _unaddressable_load(scope_load):
                            err(
                                errors,
                                f"{sp} {scope_did} is an unaddressable load. "
                                f"Trigger or write {scope_load.get('switchId')} "
                                f"endpoint {scope_load.get('sourceEndpointId')} instead.",
                            )
                    fcode = str(se.get("functionCode") or "")
                    tcode = str(se.get("traitCode") or "")
                    if fcode == "Occupancy" and tcode == "OccupancySensing":
                        err(
                            errors,
                            f"{sp} functionCode/traitCode swapped — "
                            "use functionCode=OccupancySensing, traitCode=Occupancy",
                        )
                    name = se.get("name")
                    if isinstance(name, str):
                        if not SCOPE_NAME.match(name):
                            err(
                                errors,
                                f"{sp}.name={name!r} must be ASCII camelCase (letters+digits, no CJK/hyphen)",
                            )
                        else:
                            scope_names.add(name)
                            if tcode:
                                scope_traits[name] = tcode
                            if se.get("deviceId"):
                                scope_devices[name] = str(se["deviceId"])
                            if fcode:
                                scope_fn[name] = fcode
                    _check_trait_case(errors, sp, tcode)
                    if by_dev and se.get("deviceId") and tcode:
                        cap = by_dev.get(str(se["deviceId"])) or {}
                        if not _cap_row(cap.get("events") or [], fcode, tcode):
                            err(
                                errors,
                                f"{sp} Property not found: {fcode}.{tcode} "
                                f"(device: {se.get('deviceId')}) — not in this-round probe events",
                            )

    autos = inst.get("automations")
    if not isinstance(autos, list) or len(autos) < 1:
        err(errors, "automations must be non-empty array")
        return errors

    for i, auto in enumerate(autos):
        prefix = f"automations[{i}]"
        if not isinstance(auto, dict):
            err(errors, f"{prefix} must be object")
            continue
        if not auto.get("name"):
            err(errors, f"{prefix}.name required")
        if "conditions" in auto:
            conds = auto.get("conditions")
            if isinstance(conds, list):
                for c in conds:
                    if isinstance(c, dict) and c.get("type") == "time.delay":
                        err(
                            errors,
                            f"{prefix}.conditions time.delay forbidden; use starter for= or action type=delay",
                        )
        starters = auto.get("starters")
        if not isinstance(starters, list) or not starters:
            err(errors, f"{prefix}.starters must be non-empty array (not trigger)")
        else:
            for j, st in enumerate(starters):
                sp = f"{prefix}.starters[{j}]"
                if not isinstance(st, dict) or "type" not in st:
                    err(errors, f"{sp} invalid")
                    continue
                if "data" in st:
                    err(
                        errors,
                        f"{sp} forbidden key 'data' (use source.data.ref + is, not data.ref/value)",
                    )
                t = st["type"]
                if t in ("time.cron", "cron", "schedule", "timer"):
                    err(
                        errors,
                        f"{sp} forbidden type {t!r} — use time.schedule with at:\"HH:MM\" "
                        '(never time.cron / cron expressions)',
                    )
                    continue
                if t == "time.schedule":
                    at = st.get("at")
                    if not isinstance(at, str) or not HHMM.match(at):
                        err(errors, f"{sp} time.schedule requires at as HH:MM")
                    if "cron" in st:
                        err(
                            errors,
                            f"{sp} forbid key cron — only at:\"HH:MM\" on time.schedule",
                        )
                elif t == "time.between":
                    start = st.get("start") or st.get("after")
                    end = st.get("end") or st.get("before")
                    if isinstance(start, str) and isinstance(end, str) and start > end:
                        err(
                            errors,
                            f"{sp} overnight time.between ({start}-{end}) forbidden; split schedules",
                        )
                elif t == "property.event":
                    if "source" not in st:
                        err(errors, f"{sp} property.event requires source")
                    src = st.get("source") or {}
                    if not isinstance(src, dict):
                        err(errors, f"{sp}.source must be object")
                    else:
                        if src.get("type") != "data.ref":
                            err(errors, f"{sp}.source.type must be data.ref")
                        if src.get("from") != "/metadata/scope":
                            err(
                                errors,
                                f"{sp}.source.from must be /metadata/scope "
                                f"(got {src.get('from')!r}; a bare name is a variable)",
                            )
                        sel = src.get("select") or {}
                        if not isinstance(sel, dict) or sel.get("by") != "name" or not sel.get("value"):
                            err(errors, f"{sp}.source.select must be {{by:name,value:...}}")
                        elif sel.get("value") not in scope_names:
                            err(
                                errors,
                                f"{sp}.source.select.value={sel.get('value')!r} "
                                f"undefined (scope names={sorted(scope_names)}). "
                                "cloud 2026 Undefined variable reference — "
                                "select.value must equal metadata.scope[].name exactly",
                            )
                    has_cmp = any(
                        k in st
                        for k in (
                            "is",
                            "isNot",
                            "greaterThan",
                            "greaterThanOrEqual",
                            "greaterThanOrEqualTo",
                            "lessThan",
                            "lessThanOrEqual",
                            "lessThanOrEqualTo",
                            "in",
                        )
                    )
                    if not has_cmp:
                        err(errors, f"{sp} property.event needs comparator e.g. is:true (not value)")
                    if "value" in st:
                        err(errors, f"{sp} use is/isNot not value")
                    sel = (st.get("source") or {}).get("select") or {}
                    tcode = scope_traits.get(str(sel.get("value") or ""))
                    if tcode and tcode.endswith("Event") and "is" in st:
                        raw = st.get("is")
                        if not (
                            isinstance(raw, int)
                            or (isinstance(raw, str) and raw.isdigit())
                        ):
                            err(
                                errors,
                                f"{sp} is={raw!r} is a label; any *Event "
                                "(Button/Cube/Knob/Vibration) needs catalog value "
                                "like '0', not SinglePress/Push/Shake/Rotate",
                            )
                        did = scope_devices.get(str(sel.get("value") or ""))
                        ev = _cap_row(
                            (by_dev.get(did) or {}).get("events") or [],
                            scope_fn.get(str(sel.get("value") or ""), ""),
                            tcode,
                        )
                        allowed = list((ev or {}).get("values") or [])
                        allowed.extend(
                            str(p.get("value"))
                            for p in ((ev or {}).get("enums") or [])
                            if isinstance(p, dict) and p.get("value") is not None
                        )
                        if by_dev and did and allowed and str(raw) not in [
                            str(x) for x in allowed
                        ]:
                            err(
                                errors,
                                f"{sp} is={raw!r} not in this device's probe "
                                f"values {allowed} — do not invent",
                            )
                    for_ = st.get("for")
                    if for_ is not None and (
                        not isinstance(for_, str) or not DURATION.match(for_)
                    ):
                        err(errors, f"{sp}.for must look like '30sec' when present")
                elif t == "manual":
                    if not st.get("name"):
                        err(errors, f"{sp} manual starter needs name")
                else:
                    err(
                        errors,
                        f"{sp} unknown starter type {t!r} — only manual / time.schedule / "
                        "time.between / property.event",
                    )
        if "trigger" in auto:
            err(errors, f"{prefix} uses trigger — must use starters[]")

        def _refs(node, path: str) -> None:
            if isinstance(node, dict):
                if node.get("type") == "data.ref":
                    val = (node.get("select") or {}).get("value")
                    if val and val not in scope_names:
                        err(
                            errors,
                            f"{path} data.ref {val!r} undefined "
                            f"(scope names={sorted(scope_names)}). "
                            "cloud 2026 Undefined variable reference",
                        )
                for k, v in node.items():
                    _refs(v, f"{path}.{k}")
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    _refs(v, f"{path}[{i}]")

        _refs(auto.get("condition"), f"{prefix}.condition")
        _refs(auto.get("conditions"), f"{prefix}.conditions")
        actions = auto.get("actions")
        if not isinstance(actions, list) or not actions:
            err(errors, f"{prefix}.actions must be non-empty array")
            continue
        for j, act in enumerate(actions):
            ap = f"{prefix}.actions[{j}]"
            if not isinstance(act, dict):
                err(errors, f"{ap} invalid")
                continue
            for fk in FORBIDDEN_ACTION_KEYS:
                if fk in act:
                    if fk == "delay":
                        err(
                            errors,
                            f"{ap} forbidden key delay=N; use separate {{type:delay,for:'Xsec'}} action",
                        )
                    else:
                        err(errors, f"{ap} forbidden key {fk} (use device.trait.write)")
            t = act.get("type")
            if t in FORBIDDEN_ACTION_TYPES:
                err(
                    errors,
                    f"{ap} forbidden type {t!r} — never device.control/condition/if/then/else; "
                    "use device.trait.write; 有人亮+无人灭 = automations[] 拆两条",
                )
                continue
            if t == "device.trait.write":
                for req in ("functionCode", "traitCode", "targets", "value"):
                    if req not in act:
                        err(errors, f"{ap} missing {req}")
                fcode = str(act.get("functionCode") or "")
                if _bad_function_code(fcode):
                    err(
                        errors,
                        f"{ap} functionCode={fcode!r} is fake DSL; use template codes e.g. Output/LevelControl",
                    )
                tcode = str(act.get("traitCode") or "")
                _check_trait_case(errors, ap, tcode)
                if tcode == "ColorTemperature" and isinstance(act.get("value"), (int, float)):
                    ct = act["value"]
                    if ct > 1000:
                        err(
                            errors,
                            f"{ap} ColorTemperature={ct} looks like Kelvin; "
                            "write Mired only (warm 370 / mid 250 / cool 153)",
                        )
                if tcode in INVENTED_COLOR_TRAITS:
                    err(
                        errors,
                        f"{ap} traitCode={tcode!r} is not on Aqara lights "
                        "(cloud 2026 Property not found: ColorControl.Hue). "
                        "Copy probe writes: ColorXY / ColorRGB / LightingDynamicSceneMode",
                    )
                targets = act.get("targets")
                if isinstance(targets, list):
                    for ti, tg in enumerate(targets):
                        if not isinstance(tg, dict):
                            continue
                        if "deviceId" not in tg or "endpointIds" not in tg:
                            err(errors, f"{ap}.targets[{ti}] needs deviceId+endpointIds")
                            continue
                        did = str(tg.get("deviceId") or "")
                        _check_device_id(errors, f"{ap}.targets[{ti}]", did)
                        load = load_by_target.get(did)
                        if load and _unaddressable_load(load):
                            err(
                                errors,
                                f"{ap}.targets[{ti}] {did} is an unaddressable load powered by "
                                f"{load.get('switchId')} endpoint {load.get('sourceEndpointId')}. "
                                "Write that switch only, using its own probe endpoint and traits. "
                                "Do not copy sourceEndpointId onto the load, and do not invent "
                                "CurrentLevel/color the switch cannot write.",
                            )
                            continue
                        if not by_dev or tcode in INVENTED_COLOR_TRAITS:
                            continue
                        cap = by_dev.get(did)
                        if not cap:
                            err(
                                errors,
                                f"{ap}.targets[{ti}] device {did} not in this-round probe bind",
                            )
                            continue
                        row = _cap_row(cap.get("writes") or [], fcode, tcode)
                        if not row:
                            err(
                                errors,
                                f"{ap} Property not found: {fcode}.{tcode} "
                                f"(device: {did}) — not in this-round probe writes; "
                                "do not invent Hue/OnTransitionTime/any extra point",
                            )
                            continue
                        owned = row.get("endpointId")
                        eps = tg.get("endpointIds") if isinstance(tg.get("endpointIds"), list) else []
                        if owned is not None and owned not in eps and str(owned) not in [str(x) for x in eps]:
                            err(
                                errors,
                                f"{ap}.targets[{ti}] endpointIds {eps} is not {did}'s probe "
                                f"endpoint {owned}. Never reuse another device's endpoint "
                                "or a switch sourceEndpointId on a different deviceId.",
                            )
                        bad = _value_in_range(row, act.get("value"))
                        if bad:
                            err(errors, f"{ap} {bad} for {fcode}.{tcode}")
                elif targets is not None:
                    err(errors, f"{ap}.targets must be array of {{deviceId,endpointIds}}")
            elif t == "delay":
                for_ = act.get("for")
                if not isinstance(for_, str) or not DURATION.match(for_):
                    err(errors, f"{ap} delay needs for like '30sec'")
            else:
                err(errors, f"{ap} type must be device.trait.write or delay, got {t!r}")
    return errors


def report_one(loaded: dict, label: str) -> bool:
    """Print OK or FAIL for one wrapped instance. Return True when it passed."""
    wrapped = isinstance(loaded, dict) and isinstance(loaded.get("instance"), dict)
    inst, probe = split_probe(loaded)
    if wrapped and "loads" not in loaded:
        print(
            f"FAIL {label} — missing loads — copy every powered shell/HomeAppliance "
            "from inventory poweredBy (use [] when there are none)"
        )
        return False
    loads = loaded.get("loads") if wrapped else None
    errors = validate(inst, probe=probe, require_probe=True, loads=loads)
    if errors:
        print(f"FAIL {label} — {len(errors)} issue(s)")
        for e in errors:
            print(f"  - {e}")
        return False
    print(
        f"OK {label} — schema-first shape checks passed ({len(inst.get('automations', []))} automations)"
    )
    return True


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] == "-":
        raw = sys.stdin.read()
        label = "-"
        loader = lambda: load_instance(raw=raw)
    elif sys.argv[1].lstrip().startswith("{"):
        label = "-"
        loader = lambda: load_instance(raw=sys.argv[1])
    else:
        path = Path(sys.argv[1])
        label = str(path)
        loader = lambda: load_instance(path)
    try:
        loaded = loader()
    except Exception as e:
        print(f"FAIL load: {e}")
        return 1
    if not SCHEMA_PATH.exists():
        print(f"WARN: schema missing at {SCHEMA_PATH}")
    items = loaded.get("items") if isinstance(loaded, dict) else None
    if isinstance(items, list):
        if not items:
            print("FAIL - items is empty")
            return 1
        ok_all = True
        for index, item in enumerate(items, 1):
            if not isinstance(item, dict):
                print(f"FAIL {index} — item must be an object")
                ok_all = False
                continue
            if not report_one(item, str(index)):
                ok_all = False
        return 0 if ok_all else 1
    if not report_one(loaded, label):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
