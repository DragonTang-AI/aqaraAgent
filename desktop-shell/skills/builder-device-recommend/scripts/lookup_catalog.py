#!/usr/bin/env python3
"""按品类/名称/型号从设备库抽少量推荐卡片。房间角色/数量仍看 default-picks，型号只来自本脚本。

中台 execute：cwd=/app/.agenthub，/skills/ 在 shell 里不存在。不要相对路径、不要 heredoc:
  python3 "$(find /app/.agenthub/skills -maxdepth 6 -path '*/published/builder-device-recommend/scripts/lookup_catalog.py' 2>/dev/null | head -1)" --roles light motion switch contact leak gas --country CN --lang en --limit 3

也兼容 stdin JSON:
  python3 scripts/lookup_catalog.py - <<'EOF'
  {"roles":["motion","light"],"limit":3,"country_code":"CN","allowed_models":["lumi.xxx"]}
  EOF

`allowed_models` / `device_models`：商务过滤后的可售型号白名单（罗航 LOCAL_APP
`builder.device.models.get`）。有该字段时，查库结果只保留交集；空数组 → ok 且 items=[]。

未配置设备库凭证时 stdout: {"ok":false,"reason":"...","items":[]}
"""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from resource_lib import (  # noqa: E402
    base_url,
    catalog_model_rank,
    configured,
    extract_country_code,
    is_instance_id,
    list_templates,
    resolve_catalog_lang,
    ResourceLibError,
)

ROLE_TO_CATEGORY = {
    "motion": "151",
    "switch": "51",
    "contact": "152",
    "leak": "154",
    "gas": "156",
    "climate": "153",
    "gateway": "1",
    "light": "101",
    "curtain": "301",
}

ROLE_ALIASES = {
    "water_leak": "leak",
    "waterleak": "leak",
    "flood": "leak",
    "temp_humidity": "climate",
    "humidity": "climate",
    "temperature": "climate",
    "magnet": "contact",
    "contact_sensor": "contact",
    "gas_sensor": "gas",
    "natgas": "gas",
    "motion_sensor": "motion",
    "occupancy": "motion",
    "wall_switch": "switch",
    "window_covering": "curtain",
    "windowcovering": "curtain",
    "curtains": "curtain",
    "hub": "gateway",
    "gw": "gateway",
    "lamp": "light",
    "ceiling": "light",
    "ceiling_light": "light",
    "bulb": "light",
}


def role_card_rank(role: str, card: dict) -> tuple:
    """同品类内：灯优先吸顶/筒灯；开关优先墙开，插座垫底。"""
    model = (card.get("model") or "")
    name = card.get("productName") or ""
    name_l = name.lower()
    model_l = model.lower()
    base = catalog_model_rank(model)
    if role == "switch":
        if ".plug." in model_l or "插座" in name:
            return (8,) + base
        if ".switch." in model_l or "开关" in name:
            return (0,) + base
        return (2,) + base
    if role == "light":
        if any(k in name for k in ("吸顶", "天镜", "晴空")) or "ceiling" in name_l:
            return (0,) + base
        if any(k in name for k in ("筒灯", "筒射")) or "downlight" in name_l:
            return (1,) + base
        if "射灯" in name or "spotlight" in name_l:
            return (2,) + base
        if "灯泡" in name or "bulb" in name_l:
            return (3,) + base
        if any(k in name for k in ("灯带", "轨道")) or "strip" in name_l or "track" in name_l:
            return (4,) + base
        return (2,) + base
    return base


WET_ROOMS = frozenset({"厨房", "卫生间", "主卫", "kitchen", "bath", "bathroom"})


def light_kind(card: dict) -> str:
    name = card.get("productName") or ""
    name_l = name.lower()
    if any(k in name for k in ("吸顶", "天镜", "晴空")) or "ceiling" in name_l:
        return "ceiling"
    if any(k in name for k in ("筒灯", "筒射")) or "downlight" in name_l:
        return "downlight"
    return "other"


def select_diverse_cards(role: str, batch: list, limit: int) -> list:
    """灯至少各取 1 盏吸顶 + 1 盏筒灯，避免全屋同一型号。"""
    if role != "light":
        return batch[: max(1, limit)]
    need = max(limit, 2)
    picked, seen = [], set()
    for kind in ("ceiling", "downlight"):
        for card in batch:
            key = card.get("model") or card.get("productName")
            if not key or key in seen or light_kind(card) != kind:
                continue
            picked.append(card)
            seen.add(key)
            break
    for card in batch:
        if len(picked) >= need:
            break
        key = card.get("model") or card.get("productName")
        if not key or key in seen:
            continue
        picked.append(card)
        seen.add(key)
    return picked


def pick_light_card(cards: list, room_key: str) -> dict | None:
    if not cards:
        return None
    text = room_key or ""
    wet = text in WET_ROOMS or any(k in text for k in ("厨", "卫")) or any(
        k in text.lower() for k in ("kitchen", "bath")
    )
    want = "downlight" if wet else "ceiling"
    for card in cards:
        if light_kind(card) == want:
            return card
    return cards[0]


def _apply_catalog_card(it: dict, card: dict) -> None:
    it["_catalog"] = True
    it["model"] = card["model"]
    it["spuId"] = card.get("spuId") or ""
    if card.get("productName"):
        it["productName"] = card["productName"]
    if card.get("protocols"):
        it["protocols"] = list(card["protocols"])
    if card.get("deviceType"):
        it["deviceType"] = card["deviceType"]
    if "needsGateway" in card:
        it["needsGateway"] = card["needsGateway"]


def overlay_picks(
    picks: dict,
    country: str | None,
    allowed_models: list[str] | set[str] | None = None,
) -> str:
    """按房间叠库型号：客厅/卧吸顶，厨卫筒灯。库空 role 不留本地 SKU。"""
    gw = picks.get("gateway")
    groups = picks.get("byRoomRole") or {}
    items_all = ([gw] if gw else []) + [it for g in groups.values() for it in (g or [])]
    for it in items_all:
        it["_catalog"] = False
    if not configured():
        return "none"
    roles = sorted(
        {it.get("role") for it in items_all if it.get("role")}
        | ({"gateway"} if gw else set())
    )
    req: dict = {"roles": roles, "limit": 3}
    if country:
        req["country_code"] = country
    if allowed_models is not None:
        req["allowed_models"] = list(allowed_models)
    out = lookup(req)
    if not out.get("ok"):
        return "none"
    by_role: dict[str, list] = {}
    for card in out.get("items") or []:
        label = card.get("query")
        if label and card.get("model"):
            by_role.setdefault(label, []).append(card)
    if not by_role:
        return "none"
    if gw:
        cards = by_role.get("gateway") or []
        if cards:
            _apply_catalog_card(gw, cards[0])
    for room_key, group in groups.items():
        for it in group or []:
            role = it.get("role") or ""
            cards = by_role.get(role) or []
            card = pick_light_card(cards, room_key) if role == "light" else (cards[0] if cards else None)
            if card:
                _apply_catalog_card(it, card)
    return "catalog" if any(it.get("_catalog") for it in items_all) else "none"


def normalize_role(role: str) -> str:
    raw = (role or "").strip().lower().replace("-", "_")
    return ROLE_ALIASES.get(raw, raw)


def expand_roles(roles) -> list[str]:
    out: list[str] = []
    for raw in roles or []:
        for part in str(raw).replace(",", " ").split():
            name = normalize_role(part)
            if name and name not in out:
                out.append(name)
    return out


def item_to_card(item: dict) -> dict:
    proto = (item.get("protocol") or "").strip()
    protocols = [p.strip() for p in proto.split(",") if p.strip()] if proto else []
    types = list(item.get("device_types_list") or [])
    model = item.get("device_model") or ""
    lower = model.lower()
    needs_gw = True
    if "gateway" in lower or "hub" in {t.lower() for t in types}:
        needs_gw = False
    elif any(p.lower() in ("wifi", "matter") for p in protocols) and "zigbee" not in [
        p.lower() for p in protocols
    ]:
        needs_gw = False
    return {
        "productName": item.get("name") or "",
        "model": model,
        "deviceType": types[0] if types else "",
        "deviceTypes": types,
        "protocols": protocols,
        "needsGateway": needs_gw,
        "category": item.get("category") or "",
        "spuId": "",
    }


def _result(**kwargs) -> dict:
    country = kwargs.get("country_code")
    lang = kwargs.get("lang") or resolve_catalog_lang(None, country)
    out = {"base": base_url(), **kwargs}
    out["lang"] = lang
    return out


def _allowed_model_set(req: dict) -> set[str] | None:
    """None = no allowlist; empty set = explicitly no sellable models."""
    if "allowed_models" not in req and "device_models" not in req and "allowedModels" not in req:
        return None
    raw = req.get("allowed_models")
    if raw is None:
        raw = req.get("device_models")
    if raw is None:
        raw = req.get("allowedModels")
    if raw is None:
        return set()
    if isinstance(raw, str):
        text = raw.strip()
        return {text} if text and not is_instance_id(text) else set()
    out: set[str] = set()
    for item in raw or []:
        text = str(item).strip()
        if text and not is_instance_id(text):
            out.add(text)
    return out


def lookup(req: dict) -> dict:
    country = extract_country_code(req)
    lang = resolve_catalog_lang(req.get("lang") or req.get("language"), country)
    allowed = _allowed_model_set(req)
    if allowed is not None and not allowed:
        return _result(
            ok=True,
            reason="allowed_models empty",
            items=[],
            country_code=country,
            lang=lang,
            device_source="none",
            note="business allowlist empty; no catalog fallback",
        )
    if not configured():
        return _result(
            ok=False,
            reason="RESOURCE_LIB_TOKEN missing",
            items=[],
            country_code=country,
            lang=lang,
        )
    limit = max(1, min(int(req.get("limit") or 3), 10))
    models = [
        str(m).strip()
        for m in (req.get("models") or [])
        if str(m).strip() and not is_instance_id(str(m))
    ]
    name = (req.get("name") or "").strip() or None
    category = (req.get("category") or "").strip()
    roles = expand_roles(req.get("roles") or [])

    queries: list[tuple[str, dict]] = []
    if models:
        queries.append(("models", {"models": models, "name": name}))
    if category:
        queries.append((category, {"category": category, "name": name}))
    for role in roles:
        cat = ROLE_TO_CATEGORY.get(role)
        if cat:
            queries.append((role, {"category": cat, "name": name}))
    if not queries and name:
        queries.append(("name", {"name": name}))
    if not queries:
        return _result(
            ok=False,
            reason="need roles / category / name / models",
            items=[],
            country_code=country,
            lang=lang,
        )

    def fetch_query(query: tuple[str, dict]) -> tuple[str, dict | None, str | None]:
        label, extra = query
        try:
            data = list_templates(
                resource_type="device",
                category=extra.get("category"),
                name=extra.get("name"),
                models=extra.get("models"),
                country=country,
                lang=lang,
                page=1,
                page_size=min(max(limit * 5, 10), 100),
            )
            return label, data, None
        except ResourceLibError as exc:
            return label, None, str(exc)

    items = []
    seen = set()
    errors = []
    with ThreadPoolExecutor(max_workers=min(4, len(queries))) as executor:
        results = list(executor.map(fetch_query, queries))
    for label, data, error in results:
        if error:
            errors.append(f"{label}: {error}")
            continue
        if data is not None:
            batch = []
            seen_name = set()
            for raw in data.get("items") or []:
                card = item_to_card(raw)
                model = card.get("model") or ""
                if is_instance_id(model):
                    continue
                batch.append(card)
            batch.sort(key=lambda c, r=label: role_card_rank(r, c))
            for card in select_diverse_cards(label, batch, limit):
                name_key = card.get("productName") or card.get("model")
                key = card.get("model") or name_key
                if not key or key in seen or name_key in seen_name:
                    continue
                seen.add(key)
                seen_name.add(name_key)
                card["query"] = label
                if label == "light":
                    card["lightKind"] = light_kind(card)
                items.append(card)

    filtered_out = 0
    if allowed is not None:
        before = len(items)
        items = [card for card in items if (card.get("model") or "") in allowed]
        filtered_out = before - len(items)

    note = "catalog only; empty roles skip the row (no local SKU fallback)"
    if allowed is not None:
        note = (
            f"{note}; allowed_models={len(allowed)}"
            + (f", filtered_out={filtered_out}" if filtered_out else "")
        )

    return _result(
        ok=not errors,
        partial=bool(errors and items),
        reason="; ".join(errors) if errors else "",
        items=items,
        errors=errors,
        country_code=country,
        lang=lang,
        device_source="none" if not items else "catalog",
        note=note,
        allowed_models_count=len(allowed) if allowed is not None else None,
        filtered_out=filtered_out if allowed is not None else 0,
    )


def load_request(argv: list[str]) -> dict:
    if argv and argv[0] == "-":
        data = json.loads(sys.stdin.read() or "{}")
    elif argv and not str(argv[0]).startswith("-"):
        data = json.loads(Path(argv[0]).read_text(encoding="utf-8") or "{}")
    else:
        parser = argparse.ArgumentParser(add_help=True)
        parser.add_argument("--roles", nargs="+", default=[])
        parser.add_argument("--country", "--country_code", dest="country_code", default=None)
        parser.add_argument("--lang", default=None)
        parser.add_argument("--limit", type=int, default=3)
        parser.add_argument("--category", default="")
        parser.add_argument("--name", default="")
        parser.add_argument("--models", nargs="+", default=[])
        parser.add_argument(
            "--allowed-models",
            "--allowed_models",
            nargs="+",
            dest="allowed_models",
            default=None,
        )
        args = parser.parse_args(argv)
        data = {"roles": args.roles, "limit": args.limit}
        if args.country_code:
            data["country_code"] = args.country_code
        if args.lang:
            data["lang"] = args.lang
        if args.category:
            data["category"] = args.category
        if args.name:
            data["name"] = args.name
        if args.models:
            data["models"] = args.models
        if args.allowed_models is not None:
            data["allowed_models"] = args.allowed_models
    if not isinstance(data, dict):
        raise SystemExit("need object")
    return data


def main() -> int:
    if len(sys.argv) < 2:
        print("need --roles / json file / -", file=sys.stderr)
        return 2
    data = load_request(sys.argv[1:])
    print(json.dumps(lookup(data), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
