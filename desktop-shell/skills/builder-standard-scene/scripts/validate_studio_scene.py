#!/usr/bin/env python3
"""本地 Studio 场景校验（MCP create_scene / dry-run 403 时的离线门闩）。

对照罗航 2026-11 实测契约：
1. ColorTemperature 单位是 **开尔文 K**（不是 mired）
2. `linkFrom: []` = 明确不接上游；若要按数组顺序接线 → **省略** linkFrom
3. endpointIds 必须落在设备真实可写端点上（需 --capabilities）

用法：
  python3 validate_studio_scene.py scene.json
  python3 validate_studio_scene.py scene.json --capabilities caps.json
  python3 validate_studio_scene.py scene.json --fix -o fixed.json
  python3 validate_studio_scene.py - <<'EOF'
  {...scene...}
  EOF

stdout：一行 JSON 报告 {ok, errors, warnings, stats, scene?}
exit 0 = ok（可有 warning）；1 = 有 error；2 = 用法/读入失败
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

# Soft heuristics when no per-device capability snapshot is provided.
MIRED_MAX = 1000  # typical mired ~100–500; Kelvin for lights is usually >=1800
KELVIN_SOFT_MIN = 1500
KELVIN_SOFT_MAX = 15000
LEVEL_MIN = 0
LEVEL_MAX = 100


def _load_json(arg: str) -> Any:
    if arg == "-":
        return json.loads(sys.stdin.read() or "{}")
    return json.loads(Path(arg).read_text(encoding="utf-8"))


def _unwrap_scene(raw: Any) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    """Return (scene_root, actions, config_dict_ref_parent_for_mutation)."""
    if not isinstance(raw, dict):
        raise SystemExit("scene must be a JSON object")
    # artifact wrapper
    if "content" in raw and isinstance(raw.get("content"), str):
        try:
            inner = json.loads(raw["content"])
            if isinstance(inner, dict):
                raw = inner
        except json.JSONDecodeError:
            pass
    # matcher envelope: {status, scene, logic_for_user, ...}
    if isinstance(raw.get("scene"), dict) and not (
        isinstance(raw.get("config"), dict) and isinstance(raw["config"].get("actions"), list)
    ):
        raw = raw["scene"]
    if isinstance(raw.get("config"), dict) and isinstance(raw["config"].get("actions"), list):
        return raw, list(raw["config"]["actions"]), raw["config"]
    data = raw.get("data")
    if isinstance(data, dict) and isinstance(data.get("config"), dict):
        cfg = data["config"]
        if isinstance(cfg.get("actions"), list):
            return raw, list(cfg["actions"]), cfg
    # 中台交付壳：{metadata, automations:[{starters, actions}]}
    autos = raw.get("automations")
    if isinstance(autos, list) and autos and isinstance(autos[0], dict):
        acts = autos[0].get("actions")
        if isinstance(acts, list):
            return raw, list(acts), autos[0]
    if isinstance(raw.get("actions"), list):
        return raw, list(raw["actions"]), raw
    raise SystemExit("no config.actions found")


def extract_device_ids(scene_raw: Any) -> list[str]:
    """Unique deviceIds from scene actions, in first-seen order."""
    _root, actions, _parent = _unwrap_scene(scene_raw)
    ids: list[str] = []
    seen: set[str] = set()
    for act in actions:
        if not isinstance(act, dict):
            continue
        buckets = list(act.get("targets") or []) + list(act.get("items") or [])
        for target in buckets:
            if not isinstance(target, dict):
                continue
            did = str(target.get("deviceId") or "").strip()
            if did and did not in seen:
                seen.add(did)
                ids.append(did)
    return ids


def _as_int_list(raw: Any) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return [int(raw)]
    out: list[int] = []
    for item in raw or []:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def _mired_to_kelvin(mired: float) -> int:
    if mired <= 0:
        return 0
    return max(1, int(round(1_000_000 / float(mired))))


def _looks_like_mired(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    # Studio lights: K ranges are thousands; 200 is classic warm mired.
    return 1 <= float(value) <= MIRED_MAX


def _plausible_studio_device_id(device_id: str) -> bool:
    """Reject only clearly corrupted `lumi.` ids（罗航样例：lumi.+18hex）。

    非 lumi 前缀（音箱 16hex、图谱占位 `light.xxx`、测试夹具）放行。
    """
    did = (device_id or "").strip()
    if not did:
        return False
    if did.startswith("lumi."):
        body = did[5:]
        hexchars = set("0123456789abcdefABCDEF")
        return len(body) == 16 and all(c in hexchars for c in body)
    return True


def load_capabilities(raw: Any) -> dict[str, dict[str, Any]]:
    """Normalize capability snapshot → {deviceId: {name, endpoints:{eid: [trait...]}}}."""
    out: dict[str, dict[str, Any]] = {}
    if not raw:
        return out

    def _ingest_device(cid: str, body: Any) -> None:
        cid = str(cid or "").strip()
        if not cid:
            return
        bucket = out.setdefault(cid, {"name": "", "endpoints": {}})
        if not isinstance(body, dict):
            return
        if body.get("name"):
            bucket["name"] = str(body.get("name"))
        endpoints = (
            body.get("endpoints")
            or body.get("endpointCapabilities")
            or body.get("eps")
        )
        if isinstance(endpoints, dict):
            for ek, ev in endpoints.items():
                try:
                    eid = int(ek)
                except (TypeError, ValueError):
                    continue
                traits = _normalize_traits(ev)
                bucket["endpoints"][eid] = traits
        elif isinstance(endpoints, list):
            for ep in endpoints:
                if not isinstance(ep, dict):
                    continue
                try:
                    eid = int(ep.get("endpointId") if ep.get("endpointId") is not None else ep.get("id"))
                except (TypeError, ValueError):
                    continue
                traits = _normalize_traits(
                    ep.get("writable")
                    or ep.get("traits")
                    or ep.get("capabilities")
                    or ep
                )
                bucket["endpoints"][eid] = traits
        # flat writable without endpoint → treat as endpoint-agnostic hint under -1
        flat = body.get("writable") or body.get("writableTraits") or body.get("traits")
        if flat and not bucket["endpoints"]:
            bucket["endpoints"][-1] = _normalize_traits(flat)

    if isinstance(raw, dict):
        devices = raw.get("devices") if isinstance(raw.get("devices"), dict) else None
        if devices is not None:
            for cid, body in devices.items():
                _ingest_device(cid, body)
            return out
        # maybe already {deviceId: {...}}
        for key, value in raw.items():
            if key in ("note", "source", "version"):
                continue
            _ingest_device(key, value)
        return out
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                cid = item.get("deviceId") or item.get("controlId") or item.get("id") or ""
                _ingest_device(str(cid), item)
    return out


def _normalize_traits(raw: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if isinstance(raw, dict) and (
        raw.get("writable") or raw.get("traits") or raw.get("capabilities")
    ):
        raw = raw.get("writable") or raw.get("traits") or raw.get("capabilities")
    if not isinstance(raw, list):
        return rows
    for item in raw:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            rows.append({"functionCode": str(item[0]), "traitCode": str(item[1])})
            continue
        if isinstance(item, str) and "." in item:
            left, _, right = item.partition(".")
            rows.append({"functionCode": left, "traitCode": right})
            continue
        if isinstance(item, dict):
            fcode = item.get("functionCode") or item.get("function") or ""
            tcode = (
                item.get("traitCode")
                or item.get("trait")
                or item.get("attribute")
                or item.get("commandCode")
                or ""
            )
            if not fcode or not tcode:
                continue
            row = {"functionCode": str(fcode), "traitCode": str(tcode)}
            for key in ("min", "max", "unit", "minimum", "maximum"):
                if key in item and item[key] is not None:
                    row[key] = item[key]
            if "minimum" in row and "min" not in row:
                row["min"] = row.pop("minimum")
            if "maximum" in row and "max" not in row:
                row["max"] = row.pop("maximum")
            rows.append(row)
    return rows


def _trait_on_endpoints(
    caps: dict[str, Any], fcode: str, tcode: str
) -> dict[int, dict[str, Any]]:
    """endpointId → trait row for matching function/trait."""
    found: dict[int, dict[str, Any]] = {}
    for eid, traits in (caps.get("endpoints") or {}).items():
        for row in traits or []:
            if row.get("functionCode") == fcode and row.get("traitCode") == tcode:
                found[int(eid)] = row
    return found


def validate_scene(
    scene: dict[str, Any],
    *,
    capabilities: dict[str, dict[str, Any]] | None = None,
    fix: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    root, actions, cfg = _unwrap_scene(copy.deepcopy(scene) if fix else scene)
    caps = capabilities or {}
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    fixed_actions: list[dict[str, Any]] = []

    stats = {
        "actions": len(actions),
        "linkFrom_empty": 0,
        "color_temp_mired_like": 0,
        "endpoint_mismatch": 0,
        "devices": 0,
    }
    device_ids: set[str] = set()

    for idx, raw in enumerate(actions):
        if not isinstance(raw, dict):
            errors.append(
                {
                    "code": "action_not_object",
                    "actionIndex": idx,
                    "message": "动作不是对象",
                }
            )
            continue
        act = dict(raw)
        aid = str(act.get("id") or f"#{idx}")
        atype = str(act.get("type") or "")

        # --- linkFrom ---
        if "linkFrom" in act:
            lf = act.get("linkFrom")
            if lf == [] or lf is None:
                stats["linkFrom_empty"] += 1
                errors.append(
                    {
                        "code": "linkFrom_empty",
                        "actionId": aid,
                        "actionIndex": idx,
                        "message": (
                            "linkFrom: [] 表示不接上游；按数组顺序执行应删除 linkFrom 字段"
                        ),
                    }
                )
                if fix:
                    act.pop("linkFrom", None)
            elif isinstance(lf, list) and lf:
                # non-empty is allowed for explicit DAG; leave as-is
                pass
            else:
                warnings.append(
                    {
                        "code": "linkFrom_invalid",
                        "actionId": aid,
                        "actionIndex": idx,
                        "message": f"linkFrom 形态异常: {lf!r}",
                    }
                )
                if fix:
                    act.pop("linkFrom", None)

        if atype == "delay":
            fixed_actions.append(act)
            continue

        targets = act.get("targets")
        # device.batch uses items, not targets
        if atype == "device.batch":
            fixed_actions.append(act)
            continue

        if not isinstance(targets, list) or not targets:
            errors.append(
                {
                    "code": "missing_targets",
                    "actionId": aid,
                    "actionIndex": idx,
                    "message": "缺少 targets",
                }
            )
            fixed_actions.append(act)
            continue

        t0 = targets[0] if isinstance(targets[0], dict) else {}
        device_id = str(t0.get("deviceId") or "").strip()
        if device_id:
            device_ids.add(device_id)
        # 畸形 Studio id（如 lumi.+18hex）→ 硬错；--fix 时丢弃该动作
        if device_id and not _plausible_studio_device_id(device_id):
            errors.append(
                {
                    "code": "device_id_invalid",
                    "actionId": aid,
                    "actionIndex": idx,
                    "deviceId": device_id,
                    "message": (
                        f"deviceId 形态非法（{device_id}）；"
                        "lumi. 后应为 16 位 hex，或 16 位无前缀 id"
                    ),
                }
            )
            if fix:
                continue
        eps = _as_int_list(t0.get("endpointIds"))
        if not eps and t0.get("endpointId") is not None:
            eps = _as_int_list(t0.get("endpointId"))

        fcode = str(act.get("functionCode") or "")
        tcode = str(act.get("traitCode") or act.get("commandCode") or "")
        value = act.get("value")

        # --- ColorTemperature unit ---
        if fcode == "ColorControl" and tcode == "ColorTemperature":
            if _looks_like_mired(value):
                stats["color_temp_mired_like"] += 1
                suggested = _mired_to_kelvin(float(value))
                errors.append(
                    {
                        "code": "color_temp_mired",
                        "actionId": aid,
                        "actionIndex": idx,
                        "deviceId": device_id,
                        "value": value,
                        "suggestValue": suggested,
                        "message": (
                            f"ColorTemperature value={value} 疑似 mired；"
                            f"Studio 要开尔文，建议约 {suggested} K"
                        ),
                    }
                )
                if fix:
                    act["value"] = suggested
                    value = suggested
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                if float(value) < KELVIN_SOFT_MIN or float(value) > KELVIN_SOFT_MAX:
                    warnings.append(
                        {
                            "code": "color_temp_out_of_soft_range",
                            "actionId": aid,
                            "actionIndex": idx,
                            "deviceId": device_id,
                            "value": value,
                            "message": (
                                f"色温 {value} 超出常见灯具软范围 "
                                f"{KELVIN_SOFT_MIN}–{KELVIN_SOFT_MAX} K"
                            ),
                        }
                    )

        # --- Level ---
        if fcode == "LevelControl" and tcode == "CurrentLevel":
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                if float(value) < LEVEL_MIN or float(value) > LEVEL_MAX:
                    errors.append(
                        {
                            "code": "level_out_of_range",
                            "actionId": aid,
                            "actionIndex": idx,
                            "deviceId": device_id,
                            "value": value,
                            "message": f"CurrentLevel={value} 应在 {LEVEL_MIN}–{LEVEL_MAX}",
                        }
                    )

        # --- capability-backed checks ---
        device_caps = caps.get(device_id) if device_id else None
        if (
            caps
            and device_id
            and device_id not in caps
            and atype in ("", "device.trait.write", "device.command.call")
        ):
            # 能力表可能只覆盖部分设备；默认警告。生成链路在「整表拉取」后会主动剔除。
            warnings.append(
                {
                    "code": "device_not_in_capabilities",
                    "actionId": aid,
                    "actionIndex": idx,
                    "deviceId": device_id,
                    "message": f"能力快照无此设备 {device_id}（可能无效或 caps 不完整）",
                }
            )
        if device_caps and fcode and tcode and atype in ("", "device.trait.write", "device.command.call"):
            on_eps = _trait_on_endpoints(device_caps, fcode, tcode)
            # endpoint-agnostic (-1) means we only know trait exists, not which EP
            concrete = {eid: row for eid, row in on_eps.items() if eid >= 0}
            if concrete:
                bad = [eid for eid in eps if eid not in concrete]
                if not eps:
                    errors.append(
                        {
                            "code": "endpoint_missing",
                            "actionId": aid,
                            "actionIndex": idx,
                            "deviceId": device_id,
                            "message": (
                                f"{fcode}.{tcode} 缺少 endpointIds；"
                                f"可选 {sorted(concrete)}"
                            ),
                            "suggestEndpoints": sorted(concrete),
                        }
                    )
                    stats["endpoint_mismatch"] += 1
                    if fix:
                        suggest = sorted(concrete)
                        t0 = dict(t0)
                        t0["endpointIds"] = (
                            suggest if len(suggest) <= 2 else [suggest[0]]
                        )
                        act["targets"] = [t0] + list(targets[1:])
                        eps = list(t0["endpointIds"])
                elif bad:
                    stats["endpoint_mismatch"] += 1
                    suggest = sorted(concrete)
                    errors.append(
                        {
                            "code": "endpoint_mismatch",
                            "actionId": aid,
                            "actionIndex": idx,
                            "deviceId": device_id,
                            "endpointIds": eps,
                            "suggestEndpoints": suggest,
                            "message": (
                                f"{fcode}.{tcode} 端点 {eps} 不在可写端点 {suggest} 上"
                                + (
                                    f"（{device_caps.get('name')}）"
                                    if device_caps.get("name")
                                    else ""
                                )
                            ),
                        }
                    )
                    if fix:
                        # Prefer keeping multi-channel [3,4] when both have the trait;
                        # otherwise first available.
                        t0 = dict(t0)
                        t0["endpointIds"] = suggest if len(suggest) <= 2 else [suggest[0]]
                        act["targets"] = [t0] + list(targets[1:])
                        eps = list(t0["endpointIds"])
                # range check for CT against endpoint trait min/max（用修复后的 eps）
                if (
                    fcode == "ColorControl"
                    and tcode == "ColorTemperature"
                    and isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and not _looks_like_mired(value)
                ):
                    lo_bound = None
                    hi_bound = None
                    for eid in eps or list(concrete):
                        row = concrete.get(eid)
                        if not row:
                            continue
                        lo = row.get("min")
                        hi = row.get("max")
                        try:
                            if lo is not None:
                                lo_f = float(lo)
                                lo_bound = (
                                    lo_f
                                    if lo_bound is None
                                    else max(lo_bound, lo_f)
                                )
                                if float(value) < lo_f:
                                    errors.append(
                                        {
                                            "code": "color_temp_below_min",
                                            "actionId": aid,
                                            "deviceId": device_id,
                                            "endpointId": eid,
                                            "value": value,
                                            "min": lo,
                                            "message": f"色温 {value} < 设备下限 {lo} K",
                                        }
                                    )
                            if hi is not None:
                                hi_f = float(hi)
                                hi_bound = (
                                    hi_f
                                    if hi_bound is None
                                    else min(hi_bound, hi_f)
                                )
                                if float(value) > hi_f:
                                    errors.append(
                                        {
                                            "code": "color_temp_above_max",
                                            "actionId": aid,
                                            "deviceId": device_id,
                                            "endpointId": eid,
                                            "value": value,
                                            "max": hi,
                                            "message": f"色温 {value} > 设备上限 {hi} K",
                                        }
                                    )
                        except (TypeError, ValueError):
                            pass
                    if fix and isinstance(value, (int, float)) and not isinstance(value, bool):
                        new_v = float(value)
                        if lo_bound is not None and new_v < lo_bound:
                            new_v = lo_bound
                        if hi_bound is not None and new_v > hi_bound:
                            new_v = hi_bound
                        if new_v != float(value):
                            act["value"] = int(round(new_v))
                            value = act["value"]
            elif on_eps.get(-1) is None and device_caps.get("endpoints"):
                # device known but trait not found on any endpoint
                warnings.append(
                    {
                        "code": "trait_not_on_device",
                        "actionId": aid,
                        "actionIndex": idx,
                        "deviceId": device_id,
                        "message": f"能力快照中未找到 {fcode}.{tcode}",
                    }
                )
        elif not caps and eps == [2] and fcode in ("Output", "LevelControl", "ColorControl"):
            # Without caps we cannot hard-fail endpoint 2; soft hint only once per run later
            pass

        fixed_actions.append(act)

    stats["devices"] = len(device_ids)
    if not caps:
        warnings.append(
            {
                "code": "no_capabilities",
                "message": (
                    "未提供 --capabilities：已做 linkFrom / 色温 mired 启发式校验；"
                    "端点对错需设备能力快照才能硬拦"
                ),
            }
        )

    if fix:
        cfg["actions"] = fixed_actions
        # re-attach
        if isinstance(root.get("config"), dict) and "actions" in root["config"]:
            root["config"]["actions"] = fixed_actions
        elif isinstance(root.get("data"), dict) and isinstance(root["data"].get("config"), dict):
            root["data"]["config"]["actions"] = fixed_actions
        elif (
            isinstance(root.get("automations"), list)
            and root["automations"]
            and isinstance(root["automations"][0], dict)
        ):
            root["automations"][0]["actions"] = fixed_actions
        elif "actions" in root:
            root["actions"] = fixed_actions

    report = {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "stats": stats,
    }
    if fix:
        # Re-validate the repaired payload so ok reflects post-fix state.
        cleaned, _ = validate_scene(root, capabilities=capabilities, fix=False)
        cleaned["fixed_from_errors"] = errors
        cleaned["fixed_from_warnings"] = warnings
        return cleaned, root
    return report, scene


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Studio scene JSON locally")
    parser.add_argument("scene", help="scene JSON path or - for stdin")
    parser.add_argument(
        "--capabilities",
        "--caps",
        dest="capabilities",
        default=None,
        help="device capability snapshot JSON (endpoints + ColorTemperature min/max K)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="strip empty linkFrom; convert mired-like CT to Kelvin; fix endpoints when caps allow",
    )
    parser.add_argument("-o", "--output", default=None, help="write fixed scene JSON here")
    parser.add_argument("--quiet", action="store_true", help="only print ok/error counts")
    args = parser.parse_args(argv)

    try:
        scene = _load_json(args.scene)
    except (OSError, json.JSONDecodeError, SystemExit) as exc:
        print(json.dumps({"ok": False, "errors": [{"code": "load_failed", "message": str(exc)}]}, ensure_ascii=False))
        return 2

    caps = None
    if args.capabilities:
        try:
            caps = load_capabilities(_load_json(args.capabilities))
        except (OSError, json.JSONDecodeError) as exc:
            print(
                json.dumps(
                    {"ok": False, "errors": [{"code": "caps_load_failed", "message": str(exc)}]},
                    ensure_ascii=False,
                )
            )
            return 2

    report, fixed = validate_scene(scene, capabilities=caps, fix=args.fix)
    if args.fix:
        report["scene"] = fixed
        if args.output:
            Path(args.output).write_text(
                json.dumps(fixed, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            report["written"] = args.output

    if args.quiet:
        print(
            json.dumps(
                {
                    "ok": report["ok"],
                    "error_count": len(report["errors"]),
                    "warning_count": len(report["warnings"]),
                    "stats": report["stats"],
                },
                ensure_ascii=False,
            )
        )
    else:
        # Avoid dumping huge fixed scene unless --fix without -o (still include)
        out = dict(report)
        if args.fix and args.output:
            out.pop("scene", None)
            out["written"] = args.output
        print(json.dumps(out, ensure_ascii=False, indent=2))

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
