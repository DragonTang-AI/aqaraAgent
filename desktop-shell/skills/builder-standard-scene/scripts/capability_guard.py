#!/usr/bin/env python3
"""Sanitize scene actions against Spec-derived capability allowlist.

Drops invented / non-writable traitCodes (e.g. WindowCovering.CurrentPosition),
rewrites known aliases (e.g. → TargetPositionPercentage), normalizes trait
values for Studio create_scene, and strips empty linkFrom so Studio wires by
action array order (罗航 2026-11：linkFrom:[] = 不接上游).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ALLOWLIST_PATH = ROOT / "assets" / "capability_allowlist.json"

_CACHE: dict[str, Any] | None = None


def load_allowlist() -> dict[str, Any]:
    global _CACHE
    if _CACHE is None:
        _CACHE = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return _CACHE


def _pair_set(rows: list) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for row in rows or []:
        if isinstance(row, (list, tuple)) and len(row) >= 2:
            out.add((str(row[0]), str(row[1])))
    return out


def stringify_trait_value(val: Any) -> Any:
    """Studio create_scene trait writes expect string values (\"true\"/\"60\"/\"370\")."""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if isinstance(val, float) and val.is_integer():
            return str(int(val))
        return str(val)
    return val


def flatten_link_from(actions: list[dict]) -> list[dict]:
    """Strip empty linkFrom so Studio wires by action array order.

    罗航 2026-11：`linkFrom: []` = 明确不接上游；省略字段才按数组顺序接线。
    场景快照不需要显式空数组；有非空 DAG 依赖时保留原 linkFrom。
    """
    out: list[dict] = []
    for a in actions:
        act = dict(a)
        if str(act.get("type") or "") == "delay":
            out.append(act)
            continue
        lf = act.get("linkFrom")
        if lf == [] or lf is None:
            act.pop("linkFrom", None)
        out.append(act)
    return out


SCENE_ACTION_BUDGET = 96


def _trait_rank(act: dict[str, Any]) -> int:
    """Prefer keeping OnOff / curtain position over dimming / color when trimming."""
    fcode = str(act.get("functionCode") or "")
    tcode = str(act.get("traitCode") or "")
    if fcode == "Output" and tcode == "OnOff":
        return 0
    if fcode == "WindowCovering":
        return 1
    if fcode == "LevelControl":
        return 2
    if fcode == "ColorControl":
        return 3
    return 4


def apply_action_budget(
    actions: list[dict],
    budget: int = SCENE_ACTION_BUDGET,
) -> tuple[list[dict], list[str]]:
    """Cap scene payload size without inventing mid-platform batch APIs.

    Keep coverage by preferring OnOff / curtain over level / color temperature.
    """
    notes: list[str] = []
    if budget < 1 or len(actions) <= budget:
        return actions, notes
    ranked = sorted(
        enumerate(actions),
        key=lambda pair: (_trait_rank(pair[1]), pair[0]),
    )
    keep_idx = {idx for idx, _ in ranked[:budget]}
    trimmed = [act for idx, act in enumerate(actions) if idx in keep_idx]
    dropped = len(actions) - len(trimmed)
    notes.append(
        f"动作预算 {budget}：已保留开关/窗帘优先，裁掉 {dropped} 条亮度/色温类写点，避免大户型超限。"
    )
    return trimmed, notes


def filter_actions_by_device_kinds(
    actions: list[dict],
    devices_by_control: dict[str, dict[str, Any]],
) -> tuple[list[dict], list[str]]:
    """Drop trait writes that conflict with known device kinds from the graph.

    Soft gate until Studio exposes a true per-device capability snapshot.
    Speakers/AV keep OnOff; curtains keep WindowCovering; lights may keep
    OnOff/Level/ColorTemperature.
    """
    notes: list[str] = []
    if not devices_by_control:
        return actions, notes
    kept: list[dict] = []
    dropped = 0
    for act in actions:
        targets = act.get("targets") or []
        if not targets or not isinstance(targets[0], dict):
            kept.append(act)
            continue
        control_id = str(targets[0].get("deviceId") or "")
        device = devices_by_control.get(control_id)
        if not device:
            kept.append(act)
            continue
        kinds = set(device.get("kinds") or set())
        fcode = str(act.get("functionCode") or "")
        tcode = str(act.get("traitCode") or "")
        ok = True
        if "light" in kinds:
            ok = (
                (fcode == "Output" and tcode == "OnOff")
                or (fcode == "LevelControl" and tcode == "CurrentLevel")
                or (fcode == "ColorControl" and tcode == "ColorTemperature")
            )
        elif "curtain" in kinds:
            ok = fcode == "WindowCovering"
        elif "curtain_switch" in kinds or "av" in kinds:
            ok = fcode == "Output" and tcode == "OnOff"
        elif "speaker" in kinds:
            # 音箱通常没有 Output.OnOff（演示箱 one 只有 MediaPlayback）
            ok = False
        if ok:
            kept.append(act)
        else:
            dropped += 1
    if dropped:
        notes.append(f"按图谱设备类型裁掉 {dropped} 条不匹配动作（软能力门闩）。")
    return kept, notes


def _pair_from_raw(raw: Any) -> tuple[str, str] | None:
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        return str(raw[0]), str(raw[1])
    if isinstance(raw, dict):
        fcode = raw.get("functionCode") or raw.get("function") or raw.get("cluster")
        tcode = raw.get("traitCode") or raw.get("trait") or raw.get("attribute") or raw.get("commandCode")
        if fcode and tcode:
            return str(fcode), str(tcode)
    if isinstance(raw, str) and "." in raw:
        left, _, right = raw.partition(".")
        if left and right:
            return left, right
    return None


def normalize_capability_snapshot(raw: Any) -> dict[str, set[tuple[str, str]]]:
    """Accept mid-platform or graph-side capability hints without inventing new APIs.

    Supported shapes:
    - {"<controlId>": {"writable": [["Output","OnOff"], ...]}}
    - {"<controlId>": [["Output","OnOff"], "LevelControl.CurrentLevel"]}
    - [{"deviceId":"...","writable":[...]} / {"traits":[...]}]
    """
    out: dict[str, set[tuple[str, str]]] = {}
    if not raw:
        return out

    def _add(control_id: str, pairs: Any) -> None:
        cid = str(control_id or "").strip()
        if not cid:
            return
        bucket = out.setdefault(cid, set())
        if isinstance(pairs, dict):
            pairs = (
                pairs.get("writable")
                or pairs.get("writableTraits")
                or pairs.get("traits")
                or pairs.get("capabilities")
                or []
            )
        for item in pairs or []:
            pair = _pair_from_raw(item)
            if pair:
                bucket.add(pair)

    if isinstance(raw, dict):
        for key, value in raw.items():
            _add(str(key), value)
        return out
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            cid = (
                item.get("deviceId")
                or item.get("controlId")
                or item.get("id")
                or ""
            )
            _add(str(cid), item)
    return out


def filter_actions_by_capability_snapshot(
    actions: list[dict],
    snapshot: dict[str, set[tuple[str, str]]],
) -> tuple[list[dict], list[str]]:
    """Hard-filter against an optional per-device writable trait set.

    Devices absent from the snapshot are left unchanged (soft path still applies).
    """
    notes: list[str] = []
    if not snapshot:
        return actions, notes
    kept: list[dict] = []
    dropped = 0
    for act in actions:
        targets = act.get("targets") or []
        if not targets or not isinstance(targets[0], dict):
            kept.append(act)
            continue
        control_id = str(targets[0].get("deviceId") or "")
        allowed = snapshot.get(control_id)
        if not allowed:
            kept.append(act)
            continue
        fcode = str(act.get("functionCode") or "")
        tcode = str(act.get("traitCode") or act.get("commandCode") or "")
        if (fcode, tcode) in allowed:
            kept.append(act)
        else:
            dropped += 1
    if dropped:
        notes.append(
            f"按设备能力快照裁掉 {dropped} 条不可写动作（有快照的设备才硬裁）。"
        )
    return kept, notes


def sanitize_actions(
    actions: list[Any],
    allowlist: dict[str, Any] | None = None,
    *,
    finalize: bool = True,
) -> tuple[list[dict], list[str]]:
    """Return (cleaned_actions, notes). Values stringified; linkFrom flattened at top level."""
    al = allowlist or load_allowlist()
    writable = _pair_set(al.get("writable_traits") or [])
    commands = _pair_set(al.get("commands") or [])
    aliases: dict[str, Any] = dict(al.get("aliases") or {})
    forbidden = {str(x) for x in (al.get("forbidden_traits") or [])}

    cleaned: list[dict] = []
    notes: list[str] = []
    dropped = 0
    rewritten = 0
    stringified = 0

    for raw in actions or []:
        if not isinstance(raw, dict):
            continue
        act = dict(raw)
        atype = str(act.get("type") or "")

        if atype == "device.batch":
            items_in = act.get("items") or []
            items_out: list[dict] = []
            for it in items_in:
                if not isinstance(it, dict):
                    continue
                # treat batch item as trait write or command
                fake = {
                    "type": (
                        "device.command.call"
                        if it.get("commandCode") or it.get("command")
                        else "device.trait.write"
                    ),
                    **{k: v for k, v in it.items() if k != "type"},
                }
                sub, sub_notes = sanitize_actions([fake], al, finalize=False)
                notes.extend(sub_notes)
                for s in sub:
                    # Studio 官方 batch item：deviceId + endpointId + functionCode + traitCode + command + args
                    # PreviewEffect 不要写成 commandCode 形态
                    item: dict[str, Any] = {}
                    tgs = s.get("targets") or []
                    if it.get("deviceId"):
                        item["deviceId"] = it.get("deviceId")
                    elif tgs and isinstance(tgs[0], dict):
                        item["deviceId"] = tgs[0].get("deviceId")
                    ep = it.get("endpointId")
                    if ep is None and tgs and isinstance(tgs[0], dict):
                        eps = tgs[0].get("endpointIds") or [2]
                        ep = eps[0] if eps else 2
                    try:
                        item["endpointId"] = int(ep) if ep is not None else 2
                    except (TypeError, ValueError):
                        item["endpointId"] = 2
                    item["functionCode"] = s.get("functionCode") or it.get("functionCode")
                    if s.get("type") == "device.command.call" or it.get("command") or s.get("commandCode"):
                        item["traitCode"] = (
                            it.get("traitCode") or s.get("commandCode") or s.get("traitCode")
                        )
                        item["command"] = True
                        item["args"] = s.get("args") if s.get("args") is not None else it.get("args")
                    else:
                        item["traitCode"] = s.get("traitCode") or it.get("traitCode")
                        if "value" in s or "value" in it:
                            item["value"] = s.get("value", it.get("value"))
                    items_out.append(item)
            if not items_out:
                dropped += 1
                continue
            act["items"] = items_out
            act.pop("linkFrom", None)
            cleaned.append(act)
            continue

        if atype == "device.command.call" or act.get("commandCode"):
            fcode = str(act.get("functionCode") or "")
            ccode = str(act.get("commandCode") or act.get("traitCode") or "")
            if (fcode, ccode) not in commands:
                notes.append(f"已丢弃未知命令 {fcode}.{ccode}（不在 Spec 可调用命令白名单）")
                dropped += 1
                continue
            act["type"] = "device.command.call"
            act["functionCode"] = fcode
            act["commandCode"] = ccode
            cleaned.append(act)
            continue

        if atype in ("", "device.trait.write") or act.get("traitCode"):
            fcode = str(act.get("functionCode") or "")
            tcode = str(act.get("traitCode") or "")
            key = f"{fcode}.{tcode}"
            # 1) alias first (rewrite or explicit drop)
            if key in aliases:
                av = aliases[key]
                if av is None:
                    notes.append(f"已丢弃禁用/编造能力 {key}")
                    dropped += 1
                    continue
                if isinstance(av, (list, tuple)) and len(av) >= 2:
                    nf, nt = str(av[0]), str(av[1])
                    notes.append(f"能力改写 {key} → {nf}.{nt}")
                    fcode, tcode = nf, nt
                    act["functionCode"] = fcode
                    act["traitCode"] = tcode
                    rewritten += 1
                    key = f"{fcode}.{tcode}"
            elif tcode in forbidden:
                # trait-only forbidden without a rewrite alias
                notes.append(f"已丢弃禁用/编造能力 {key}")
                dropped += 1
                continue
            # 2) trait-suffix alias fallback
            if (fcode, tcode) not in writable:
                fixed = False
                for ak, av in aliases.items():
                    if ak.endswith(f".{tcode}") and isinstance(av, (list, tuple)) and len(av) >= 2:
                        fcode, tcode = str(av[0]), str(av[1])
                        act["functionCode"] = fcode
                        act["traitCode"] = tcode
                        notes.append(f"能力改写 → {fcode}.{tcode}")
                        rewritten += 1
                        fixed = True
                        break
                if not fixed and (fcode, tcode) not in writable:
                    notes.append(f"已丢弃未知可写能力 {fcode}.{tcode}（Spec 无此写点）")
                    dropped += 1
                    continue
            # 中台 automations 形态：bool/number 原样（对照官方可运行场景与 automation 金样）。
            # 仅把明显的 JSON 布尔字符串归一成 bool，避免 "true" 字符串踩坑。
            val = act.get("value")
            if isinstance(val, str) and val.strip().lower() in ("true", "false"):
                act["value"] = val.strip().lower() == "true"
                stringified += 1
            elif isinstance(val, str) and val.strip().lstrip("-").isdigit():
                act["value"] = int(val.strip())
                stringified += 1
            act["type"] = "device.trait.write"
            act["functionCode"] = fcode
            act["traitCode"] = tcode
            cleaned.append(act)
            continue

        # delay / unknown passthrough types used by classic scenes
        if atype == "delay":
            cleaned.append(act)
            continue

        notes.append(f"已丢弃不支持的动作类型 {atype!r}")
        dropped += 1

    if finalize:
        cleaned = flatten_link_from(cleaned)
    if rewritten or dropped:
        notes.append(f"能力消毒：改写 {rewritten} 条，丢弃 {dropped} 条。")
    if stringified:
        notes.append(f"已归一化 {stringified} 条 trait 值为 bool/number（Studio/中台 automations 形态）。")
    if finalize and cleaned:
        notes.append("已省略空 linkFrom，按动作数组顺序交 Studio 接线（禁止 linkFrom: []）。")
    return cleaned, notes


def sanitize_metadata(meta: Any) -> tuple[dict[str, Any], list[str]]:
    """Studio: metadata.scope items must be objects (device attribute vars), never room-name strings.

    罗航复现：scope=["康养区"] → -32602 expected object。基础标准场景无属性变量时必须 scope=[]。
    """
    notes: list[str] = []
    if not isinstance(meta, dict):
        return {"name": "", "scope": [], "variables": [], "description": ""}, notes
    out = dict(meta)
    scope = out.get("scope")
    if scope is None:
        out["scope"] = []
        return out, notes
    if not isinstance(scope, list):
        notes.append("metadata.scope 非数组，已重置为 []")
        out["scope"] = []
        return out, notes
    cleaned: list[dict] = []
    dropped = 0
    for item in scope:
        if isinstance(item, dict):
            # keep only plausible device.property-like objects
            cleaned.append(item)
        else:
            dropped += 1
    if dropped:
        notes.append(
            f"metadata.scope 丢弃 {dropped} 个非法项（房间名字符串等）；"
            "scope 仅允许对象，基础场景用 []"
        )
    out["scope"] = cleaned
    if "variables" in out and not isinstance(out.get("variables"), list):
        out["variables"] = []
    return out, notes


def drop_actions_for_devices(
    scene: dict[str, Any],
    drop_ids: set[str],
) -> tuple[dict[str, Any], list[str]]:
    """Remove trait writes targeting deviceIds in drop_ids."""
    notes: list[str] = []
    if not drop_ids or not isinstance(scene, dict):
        return scene, notes

    def _filter(actions: list[Any]) -> list[dict]:
        kept: list[dict] = []
        dropped = 0
        for raw in actions or []:
            if not isinstance(raw, dict):
                continue
            act = dict(raw)
            if str(act.get("type") or "") == "device.batch":
                items = []
                for it in act.get("items") or []:
                    if isinstance(it, dict) and str(it.get("deviceId") or "") in drop_ids:
                        dropped += 1
                        continue
                    items.append(it)
                if not items:
                    dropped += 1
                    continue
                act["items"] = items
                kept.append(act)
                continue
            targets = act.get("targets") or []
            if targets and isinstance(targets[0], dict):
                if str(targets[0].get("deviceId") or "") in drop_ids:
                    dropped += 1
                    continue
            kept.append(act)
        if dropped:
            notes.append(f"已剔除 {dropped} 条指向无效/未知设备的动作。")
        return kept

    out = dict(scene)
    cfg = out.get("config")
    if isinstance(cfg, dict) and isinstance(cfg.get("actions"), list):
        new_cfg = dict(cfg)
        new_cfg["actions"] = _filter(cfg["actions"])
        out["config"] = new_cfg
        return out, notes
    autos = out.get("automations")
    if isinstance(autos, list) and autos and isinstance(autos[0], dict):
        auto0 = dict(autos[0])
        auto0["actions"] = _filter(auto0.get("actions") or [])
        out["automations"] = [auto0] + list(autos[1:])
        return out, notes
    return out, notes


def apply_studio_capability_fix(
    scene: dict[str, Any] | None,
    capability_snapshot: Any = None,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Local fix only. Caller may pass a capability snapshot already in hand.

    - Remap endpointIds to writable endpoints (e.g. [2]→[3,4])
    - Clamp ColorTemperature into device K range (e.g. 2700→2703)
    - Drop malformed deviceIds
    """
    notes: list[str] = []
    if not isinstance(scene, dict):
        return scene, notes

    def _nonempty_snap(raw: Any) -> bool:
        if raw is None:
            return False
        if isinstance(raw, list):
            return bool(raw)
        if not isinstance(raw, dict):
            return False
        devices = raw.get("devices")
        if isinstance(devices, (dict, list)) and devices:
            return True
        # already {deviceId: {...}} map
        return any(
            isinstance(v, (dict, list))
            for k, v in raw.items()
            if k not in ("note", "source", "ok", "message", "code")
        )

    snap = capability_snapshot if _nonempty_snap(capability_snapshot) else None

    # Always drop malformed ids (even without caps)
    try:
        from validate_studio_scene import (  # noqa: WPS433
            _plausible_studio_device_id,
            extract_device_ids,
        )

        bad = {
            did
            for did in extract_device_ids(scene)
            if not _plausible_studio_device_id(did)
        }
        if bad:
            scene, dnotes = drop_actions_for_devices(scene, bad)
            notes.extend(dnotes)
            notes.append("已丢弃畸形 deviceId：" + "、".join(sorted(bad)[:6]))
    except Exception as exc:  # noqa: BLE001
        notes.append(f"畸形 deviceId 扫描跳过：{exc}")

    if snap is not None:
        try:
            from validate_studio_scene import load_capabilities, validate_scene  # noqa: WPS433

            caps = load_capabilities(snap)
            report, fixed = validate_scene(scene, capabilities=caps, fix=True)
            if isinstance(fixed, dict):
                scene = fixed
            if report.get("ok"):
                notes.append("本地 Studio 校验已通过（含端点/色温自动修复）。")
            else:
                n_err = len(report.get("errors") or [])
                notes.append(f"本地 Studio 校验仍有 {n_err} 条错误（已尽量 --fix）。")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"本地校验修复跳过：{exc}")

    return scene, notes


def sanitize_scene(
    scene: dict[str, Any] | None,
    *,
    devices: list[dict[str, Any]] | None = None,
    capability_snapshot: Any = None,
    action_budget: int = SCENE_ACTION_BUDGET,
) -> tuple[dict[str, Any] | None, list[str]]:
    if not isinstance(scene, dict):
        return scene, []
    notes_all: list[str] = []
    devices_by_control: dict[str, dict[str, Any]] = {}
    from_devices: dict[str, set[tuple[str, str]]] = {}
    for d in devices or []:
        if not isinstance(d, dict):
            continue
        cid = str(d.get("controlId") or "")
        if cid:
            devices_by_control[cid] = d
            writable = d.get("writable") or d.get("writableTraits")
            if writable:
                from_devices.update(normalize_capability_snapshot({cid: writable}))
    snapshot = normalize_capability_snapshot(capability_snapshot)
    for cid, pairs in from_devices.items():
        snapshot.setdefault(cid, set()).update(pairs)

    def _fix_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
        out_cfg = dict(cfg)
        if isinstance(cfg.get("actions"), list):
            acts, notes = sanitize_actions(cfg["actions"])
            notes_all.extend(notes)
            if devices_by_control:
                acts, knotes = filter_actions_by_device_kinds(acts, devices_by_control)
                notes_all.extend(knotes)
            if snapshot:
                acts, snotes = filter_actions_by_capability_snapshot(acts, snapshot)
                notes_all.extend(snotes)
            acts, bnotes = apply_action_budget(acts, action_budget)
            notes_all.extend(bnotes)
            out_cfg["actions"] = acts
        meta, mnotes = sanitize_metadata(cfg.get("metadata") or {})
        notes_all.extend(mnotes)
        # 基础标准场景：无 scope 变量就强制空数组，避免中台/模型塞房间名
        if not meta.get("scope"):
            meta["scope"] = []
        out_cfg["metadata"] = meta
        return out_cfg

    # classic JSON_SCENE
    cfg = scene.get("config")
    if isinstance(cfg, dict) and isinstance(cfg.get("actions"), list):
        out = dict(scene)
        out["config"] = _fix_cfg(cfg)
        return out, notes_all
    # create_scene shape {data:{config:{actions}}}
    data = scene.get("data")
    if isinstance(data, dict):
        cfg = data.get("config")
        if isinstance(cfg, dict) and isinstance(cfg.get("actions"), list):
            out = dict(scene)
            out_data = dict(data)
            out_data["config"] = _fix_cfg(cfg)
            out["data"] = out_data
            return out, notes_all
    # top-level metadata (midplatform wrap)
    if isinstance(scene.get("metadata"), dict):
        out = dict(scene)
        meta, mnotes = sanitize_metadata(scene.get("metadata"))
        notes_all.extend(mnotes)
        if not meta.get("scope"):
            meta["scope"] = []
        out["metadata"] = meta
        return out, notes_all
    return scene, []
