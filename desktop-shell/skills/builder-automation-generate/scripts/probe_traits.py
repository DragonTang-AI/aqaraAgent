#!/usr/bin/env python3
"""批量探测型号 traits（写动作 + 传感器 starter/condition）。

已配置设备库凭证时先查 device-endpoints，失败或缺可联动 trait 回落本地 templates。
未配置 / 网络失败 = 只走本地（原方案）。

用法（Skill 根目录）:
  python3 scripts/probe_traits.py - <<'EOF'
  {"models":["lumi.motion.ac02","lumi.light.acn025"],"bind":[
    {"deviceId":"matt.occ","model":"lumi.motion.ac02","as":"event","trait":"Occupancy","name":"motionOcc"},
    {"deviceId":"matt.light","model":"lumi.light.acn025","as":"write","trait":"OnOff","value":true}
  ]}
  EOF
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "assets" / "device_templates"
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from resource_lib import (  # noqa: E402
    catalog_model_rank,
    configured,
    device_endpoints,
    extract_care_traits,
    extract_country_code,
    is_catalog_model,
    is_instance_id,
    lang_for_country,
    list_templates,
    ResourceLibError,
)


def probe_local(model: str) -> dict:
    path = TEMPLATE_DIR / f"{model}.json"
    if not path.exists():
        return {}
    tpl = json.loads(path.read_text(encoding="utf-8"))
    eps = ((tpl.get("capabilities") or {}).get("endpoints")) or []
    return extract_care_traits(eps)


def probe(model: str) -> tuple[dict, str]:
    local = probe_local(model)
    if configured():
        try:
            eps = device_endpoints(model)
            if eps:
                remote = extract_care_traits(eps)
                if remote:
                    return remote, "remote"
        except ResourceLibError:
            pass
    if local:
        return local, "local"
    return {}, "missing"


def _name_variants(raw: str) -> list[str]:
    """流光溢彩灯带T2 ↔ 流光溢彩灯带 T2；剥掉括号后缀。"""
    text = (raw or "").strip()
    if not text:
        return []
    out, seen = [], set()

    def add(val: str) -> None:
        val = val.strip()
        if val and val not in seen:
            seen.add(val)
            out.append(val)

    add(text)
    stripped = re.sub(r"\s*\([^)]*\)", "", text).strip()
    add(stripped)
    for src in (text, stripped):
        add(re.sub(r"(?<=[\u4e00-\u9fff])([A-Za-z]+\d*)$", r" \1", src))
        add(re.sub(r"\s+([A-Za-z]+\d*)$", r"\1", src))
    return out


def _candidate_models(raw: str, country: str | None = None) -> list[str]:
    """品名 / lumi.models 空壳 → 同商品有能力的 device_model。"""
    if not raw or not configured():
        return []
    found, seen, names = [], set(), []

    def add_model(model: str) -> None:
        model = (model or "").strip()
        if not model or model in seen or is_instance_id(model):
            return
        seen.add(model)
        found.append(model)

    def add_items(items) -> None:
        for item in items or []:
            add_model(str(item.get("device_model") or item.get("model") or ""))
            title = item.get("name") or item.get("product_name")
            if title:
                names.append(str(title))

    def has_usable() -> bool:
        return any(
            is_catalog_model(m) and not is_shell_model(m) for m in found
        )

    if is_catalog_model(raw) or raw.startswith("lumi.models."):
        try:
            add_items(
                (
                    list_templates(
                        resource_type="device",
                        models=[raw],
                        country=country,
                        page=1,
                        page_size=20,
                    )
                    or {}
                ).get("items")
            )
        except ResourceLibError:
            pass
    for variant in list(names) + _name_variants(raw):
        if has_usable():
            break
        try:
            add_items(
                (
                    list_templates(
                        resource_type="device",
                        name=variant,
                        country=country,
                        page=1,
                        page_size=20,
                    )
                    or {}
                ).get("items")
            )
        except ResourceLibError:
            continue
    found.sort(key=lambda m: catalog_model_rank(m))
    return found


def is_shell_model(raw: str) -> bool:
    text = (raw or "").strip().lower()
    return text.startswith("lumi.models.") or text.startswith("x2.lumi.models.")


def bind_lookups(item: dict) -> list[str]:
    """空壳型号先用品名查，禁止只拿 lumi.models 去判 missing。"""
    if not isinstance(item, dict):
        return []
    model = str(item.get("model") or "").strip()
    product = str(
        item.get("product")
        or item.get("productName")
        or item.get("probeAs")
        or item.get("name")
        or ""
    ).strip()
    if is_instance_id(product):
        product = ""
    out, seen = [], set()

    def add(val: str) -> None:
        val = (val or "").strip()
        if not val or val in seen or is_instance_id(val):
            return
        seen.add(val)
        out.append(val)

    if is_shell_model(model):
        add(product)
        add(model)
    else:
        add(model)
        add(product)
    return out


def resolve_and_probe(raw: str, country: str | None = None) -> tuple[str, dict, str]:
    """先按原串 probe；没有可联动 trait 再按品名解析。实例 id 禁止当型号。"""
    raw = (raw or "").strip()
    if not raw:
        return raw, {}, "missing"
    if is_instance_id(raw):
        return raw, {}, "instance_id"
    # 空壳 / 品名不要先打 device-endpoints（必 404，8s 超时累加）。
    if is_catalog_model(raw) and not is_shell_model(raw):
        traits, source = probe(raw)
        if traits:
            return raw, traits, source
    for cand in _candidate_models(raw, country):
        if cand == raw or is_instance_id(cand) or is_shell_model(cand):
            continue
        traits, source = probe(cand)
        if traits:
            return cand, traits, source
    if not is_catalog_model(raw):
        traits, source = probe(raw)
        if traits:
            return raw, traits, source
    return raw, {}, "missing"


STARTER_TRAITS = {"Occupancy", "Contact", "MeasuredValue"}
_GENERIC_TRAIT = {"", "event", "write", "action", "trigger", "any", "auto"}


def _is_event_trait(code: str, info: dict) -> bool:
    roles = info.get("roles") or []
    if code.endswith("Event") or code in STARTER_TRAITS or "starter" in roles:
        return True
    return bool(info.get("subscribable") and not info.get("writable"))


def _is_write_trait(info: dict) -> bool:
    roles = info.get("roles") or []
    return bool(info.get("writable") or "action" in roles)


def _infer_as(item: dict, trait: str) -> str:
    explicit = str(item.get("as") or "").strip().lower()
    if explicit in ("write", "event", "both"):
        return explicit
    if "value" in item:
        return "write"
    if trait in STARTER_TRAITS or trait.endswith("Event") or trait.lower() in {
        "event",
        "trigger",
    }:
        return "event"
    return "write"


def _haystack(code: str, info: dict) -> str:
    bits = [code, str(info.get("functionCode") or "")]
    bits.extend(str(v) for v in (info.get("values") or []))
    bits.extend(str(p.get("key") or "") for p in (info.get("enums") or []))
    return " ".join(bits).lower()


def _pick_enum_is(info: dict, item: dict):
    """Studio 下拉吃 supportedValues.value（'0'），不是 SinglePress / Push。"""
    enums = info.get("enums") or []
    if not enums:
        return None
    want = str(item.get("is") or item.get("event") or "").strip()
    want_l = want.lower().replace(" ", "")
    if want:
        for pair in enums:
            val = str(pair.get("value") or "")
            key = str(pair.get("key") or "")
            if want == val or want_l == key.lower().replace(" ", ""):
                return val or None
    blob = " ".join(str(item.get(k) or "") for k in ("name", "intent", "note", "as")).lower()
    hints = (
        ("shake", "shake"),
        ("摇", "shake"),
        ("taptwice", "taptwice"),
        ("double", "double"),
        ("双击", "double"),
        ("long", "long"),
        ("长按", "long"),
        ("rotate", "rotate"),
        ("旋转", "rotate"),
        ("转动", "rotate"),
        ("push", "push"),
        ("single", "single"),
        ("click", "single"),
        ("单击", "single"),
        ("press", "single"),
    )
    for needle, part in hints:
        if needle not in blob and needle not in want_l:
            continue
        for pair in enums:
            if part in str(pair.get("key") or "").lower().replace(" ", ""):
                val = str(pair.get("value") or "")
                if val != "":
                    return val
    first = str(enums[0].get("value") or "")
    return first or None


def _score_trait(req: str, code: str, info: dict) -> int:
    hay = _haystack(code, info)
    if not req:
        return 1
    if req == code.lower():
        return 100
    if req in hay:
        return 50 + min(len(req), 20)
    score = 0
    for tok in req.replace("_", " ").replace("-", " ").split():
        if tok and tok in hay:
            score += 12
    return score


def _resolve_trait(traits: dict, requested: str, kind: str) -> tuple[str | None, dict | None]:
    """按库里实际 trait 匹配意图，不预置设备名单。"""
    if not traits:
        return None, None
    if requested in traits:
        return requested, traits[requested]
    req = (requested or "").strip().lower()
    for key, info in traits.items():
        if key.lower() == req:
            return key, info
    pool: list[tuple[str, dict]] = []
    for code, info in traits.items():
        if kind in ("event", "both") and _is_event_trait(code, info):
            pool.append((code, info))
        if kind in ("write", "both") and _is_write_trait(info):
            pool.append((code, info))
    if not pool:
        pool = list(traits.items())
    if req in _GENERIC_TRAIT:
        return pool[0]
    best: tuple[str, dict] | None = None
    best_score = 0
    for code, info in pool:
        score = _score_trait(req, code, info)
        if score > best_score:
            best_score = score
            best = (code, info)
    if best and best_score > 0:
        return best
    return pool[0]


def _lookup_traits(item: dict, result: dict, aliases: dict | None) -> tuple[dict, str | None]:
    keys = list(bind_lookups(item))
    aliases = aliases or {}
    for raw in list(keys):
        mapped = aliases.get(raw, "")
        if mapped:
            keys.append(mapped)
    for key in keys:
        if key and result.get(key):
            return result[key], key
    return {}, None


def bind_items(bind: list, result: dict, sources: dict, aliases: dict | None = None) -> tuple[list, list]:
    """按型号真实 trait 收成 scope / device.trait.write，禁止调用方猜 endpoint。"""
    scopes: list = []
    writes: list = []
    for item in bind or []:
        if not isinstance(item, dict):
            continue
        model = str(item.get("model") or "").strip()
        device_id = str(item.get("deviceId") or "").strip()
        trait = str(item.get("trait") or "").strip()
        kind = _infer_as(item, trait)
        if not trait:
            trait = "event" if kind == "event" else "write"
        name = str(item.get("name") or trait).strip()
        traits, hit_key = _lookup_traits(item, result, aliases)
        resolved, info = _resolve_trait(traits, trait, kind)
        source = sources.get(hit_key) if hit_key else sources.get(model)
        if info:
            trait = resolved or trait
        if not info:
            reason = (
                "instance_id_not_model"
                if is_instance_id(model)
                else "trait_missing"
            )
            miss = {
                "ok": False,
                "name": name,
                "model": model,
                "deviceId": device_id,
                "traitCode": trait,
                "reason": reason,
            }
            if kind in ("event", "both"):
                scopes.append(miss)
            if kind in ("write", "both"):
                writes.append(miss)
            continue
        if kind in ("event", "both"):
            scope = {
                "ok": True,
                "name": name,
                "type": "device.property",
                "deviceId": device_id,
                "endpointId": info.get("endpointId"),
                "functionCode": info.get("functionCode"),
                "traitCode": info.get("canonicalCase") or trait,
                "source": source,
            }
            if info.get("values"):
                scope["values"] = info["values"]
            if info.get("enums"):
                scope["enums"] = info["enums"]
            if info.get("valueType"):
                scope["valueType"] = info["valueType"]
            picked = _pick_enum_is(info, item)
            if picked is not None:
                scope["is"] = picked
            elif str(info.get("valueType") or "").lower() == "enum":
                scope["enumMissing"] = True
            scopes.append(scope)
        if kind in ("write", "both"):
            write = {
                "ok": True,
                "type": "device.trait.write",
                "functionCode": info.get("functionCode"),
                "traitCode": info.get("canonicalCase") or trait,
                "targets": [
                    {
                        "deviceId": device_id,
                        "endpointIds": [info.get("endpointId")],
                    }
                ],
                "value": item.get("value", True),
                "source": source,
            }
            for field in ("min", "max", "step", "unit", "values", "valueType"):
                if info.get(field) is not None:
                    write[field] = info[field]
            writes.append(write)
    return scopes, writes


def index_by_device(bind: list, usable: dict, aliases: dict | None = None) -> dict:
    """deviceId → 该型号全部 events/writes。validate 用这个拦编造的点。"""
    out: dict = {}
    aliases = aliases or {}
    for item in bind or []:
        if not isinstance(item, dict):
            continue
        did = str(item.get("deviceId") or "").strip()
        if not did:
            continue
        picked, model = {}, ""
        keys = bind_lookups(item) or [
            str(item.get("model") or item.get("product") or "").strip()
        ]
        for key in keys:
            resolved = aliases.get(key, key)
            u = usable.get(resolved) or usable.get(key) or {}
            if u:
                picked = u
                model = resolved
                break
        prev = out.get(did) or {"model": model, "events": [], "writes": []}
        ev = list(picked.get("events") or prev.get("events") or [])
        wr = list(picked.get("writes") or prev.get("writes") or [])
        out[did] = {"model": model or prev.get("model"), "events": ev, "writes": wr}
    return out


def usable_map(result: dict) -> dict:
    out: dict = {}
    for model, traits in result.items():
        if not traits:
            continue
        events: list = []
        writes: list = []
        for code, info in traits.items():
            row = {
                "traitCode": info.get("canonicalCase") or code,
                "functionCode": info.get("functionCode"),
                "endpointId": info.get("endpointId"),
            }
            if info.get("values"):
                row["values"] = info["values"]
            if info.get("enums"):
                row["enums"] = info["enums"]
            if info.get("valueType"):
                row["valueType"] = info["valueType"]
            for field in ("min", "max", "step", "unit"):
                if info.get(field) is not None:
                    row[field] = info[field]
            if str(info.get("valueType") or "").lower() == "enum" and not info.get("values"):
                row["enumMissing"] = True
            roles = info.get("roles") or []
            if (
                code.endswith("Event")
                or code in STARTER_TRAITS
                or "starter" in roles
                or (info.get("subscribable") and not info.get("writable"))
            ):
                events.append(row)
            if info.get("writable") or "action" in roles:
                writes.append(row)
        out[model] = {"events": events, "writes": writes}
    return out


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] == "-":
        raw = sys.stdin.read()
    elif sys.argv[1].lstrip().startswith("{"):
        raw = sys.argv[1]
    else:
        raw = Path(sys.argv[1]).read_text(encoding="utf-8")
    data = json.loads(raw)
    country = extract_country_code(data) if isinstance(data, dict) else None
    bind = []
    if isinstance(data, dict) and ("models" in data or "bind" in data or "devices" in data):
        models = list(data.get("models") or [])
        bind = list(data.get("bind") or data.get("devices") or [])
    elif isinstance(data, list):
        models = data
    else:
        print("need list of models or {models:[...]}", file=sys.stderr)
        return 2
    result = {}
    missing = []
    sources = {}
    aliases = {}
    seen = set()

    def ingest(raw: str) -> tuple[str, dict, str]:
        raw = str(raw or "").strip()
        if not raw:
            return raw, {}, "missing"
        if raw in seen:
            return raw, result.get(raw) or {}, sources.get(raw) or "missing"
        seen.add(raw)
        resolved, traits, source = resolve_and_probe(raw, country)
        result[raw] = traits
        sources[raw] = source
        if resolved != raw:
            aliases[raw] = resolved
            result[resolved] = traits
            sources[resolved] = source
            seen.add(resolved)
        if not traits:
            missing.append(raw)
        return resolved, traits, source

    for m in models:
        ingest(str(m).strip())
    for item in bind:
        if not isinstance(item, dict):
            continue
        for key in bind_lookups(item):
            _resolved, traits, _src = ingest(key)
            if traits:
                break
    out = {
        "models": result,
        "missing": missing,
        "sources": sources,
        "resolved": aliases,
        "country_code": country,
        "lang": lang_for_country(country),
        "usable": usable_map(result),
        "caseHint": (
            "validate probe={byDevice} only, never full stdout. "
            "Copy scopes[] / writes[] as-is. "
            "Any *Event is= enums[].value, never SinglePress/Push/Shake. "
            "deviceId=space id, never cube/light/switch."
        ),
    }
    if bind:
        scopes, writes = bind_items(bind, result, sources, aliases)
        out["scopes"] = scopes
        out["writes"] = writes
        out["byDevice"] = index_by_device(bind, out["usable"], aliases)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
