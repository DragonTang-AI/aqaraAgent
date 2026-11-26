#!/usr/bin/env python3
"""设备库 HTTP 客户端。

凭证优先级：环境变量 > 同目录 resource_lib.secrets.json（打进 Skill 包）> 本机 .env。
禁止写进 System Prompt；仓库不提交 secrets 文件。
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE = "http://106.53.161.150:18088"
# 常见名，仅排序参考；抽能力不靠这张表。
CARE = (
    "OnOff",
    "CurrentLevel",
    "ColorTemperature",
    "Occupancy",
    "Contact",
    "MeasuredValue",
)
# 诊断 / 配网，不是给用户编排的。
_SKIP_FUNCTIONS = {
    "BasicInformation",
    "BridgedDeviceBasicInformation",
    "Descriptor",
    "Identify",
    "Groups",
    "Scenes",
    "Time",
    "OtaSoftwareUpdateProvider",
    "OtaSoftwareUpdateRequestor",
    "ZigbeeNetworkDiagnostics",
    "ThreadNetworkDiagnostics",
    "WiFiNetworkDiagnostics",
    "EthernetNetworkDiagnostics",
    "GeneralDiagnostics",
    "SoftwareDiagnostics",
    "HardwareDiagnostics",
    "PowerSource",
    "Binding",
    "AccessControl",
    "AdministratorCommissioning",
    "OperationalCredentials",
    "GroupKeyManagement",
    "GeneralCommissioning",
    "ICDManagement",
}

# 实例 id ≠ 设备库型号。查库 / probe 只用 catalog model 或产品名。
_INSTANCE_ID_RE = re.compile(
    r"^(matt|virt|inst|dev)\.|^(lumi|aqara)\.[0-9a-f]{10,}$",
    re.I,
)
_CATALOG_MODEL_RE = re.compile(
    r"^(lumi|aqara|x2\.lumi)\.[a-z][a-z0-9_]*\.[a-z0-9_]+$"
    r"|^aqara\.matter\.\d+_\d+$",
    re.I,
)


def is_instance_id(raw: str) -> bool:
    """空间里的设备实例（matt.* / lumi.+长十六进制），不能拿去 device-endpoints。"""
    text = (raw or "").strip()
    return bool(text) and bool(_INSTANCE_ID_RE.match(text))


def is_catalog_model(raw: str) -> bool:
    """设备库型号（lumi.motion.ac02 / aqara.matter.4447_8206）。"""
    text = (raw or "").strip()
    return bool(text) and bool(_CATALOG_MODEL_RE.match(text)) and not is_instance_id(text)


def catalog_model_rank(model: str) -> tuple:
    """越小越优先：有能力的 lumi.* > aqara > 其它 > Matter > lumi.models 空壳 > 实例。"""
    text = (model or "").strip()
    if is_instance_id(text):
        return (9, text)
    if text.startswith("lumi.models.") or text.startswith("x2.lumi.models."):
        return (6, text)
    if text.startswith("lumi.") or text.startswith("x2.lumi."):
        return (0, text)
    if text.startswith("aqara.") and "matter" not in text.lower():
        return (1, text)
    if "matter" in text.lower():
        return (5, text)
    return (3, text)


class ResourceLibError(Exception):
    def __init__(self, message: str, code: Any = None, http_status: int | None = None):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


def _load_dotenv() -> None:
    seen: set[Path] = set()
    candidates = [Path.cwd() / ".env"]
    for parent in Path(__file__).resolve().parents[:6]:
        candidates.append(parent / ".env")
    for path in candidates:
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved in seen or not path.is_file():
            continue
        seen.add(resolved)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


_PACKAGED = {"token": "", "base": ""}


def _load_packaged_secrets() -> None:
    path = Path(__file__).resolve().parent / "resource_lib.secrets.json"
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(data, dict):
        return
    _PACKAGED["token"] = str(data.get("token") or "").strip()
    _PACKAGED["base"] = str(data.get("base") or "").strip()


_load_dotenv()
_load_packaged_secrets()


def base_url() -> str:
    env = (os.environ.get("RESOURCE_LIB_BASE") or "").strip()
    if env:
        return env.rstrip("/")
    if _PACKAGED["base"]:
        return _PACKAGED["base"].rstrip("/")
    return DEFAULT_BASE


def token() -> str:
    if "RESOURCE_LIB_TOKEN" in os.environ:
        return os.environ["RESOURCE_LIB_TOKEN"].strip()
    return _PACKAGED["token"]


def configured() -> bool:
    return bool(token())


def country_code() -> str:
    return (os.environ.get("RESOURCE_LIB_COUNTRY") or "").strip()


def lang_for_country(country=None) -> str:
    """未指定展示语时的回落：仅 CN → cn，其他国区 → en。未注入国区按中文。"""
    raw = country_code() if country is None else country
    cc = normalize_country_code(raw)
    if cc and cc != "CN":
        return "en"
    return "cn"


def resolve_catalog_lang(lang=None, country=None) -> str:
    """库请求头 lang：有展示语跟展示语（cn/en），否则回落国区。"""
    text = str(lang or "").strip().lower().replace("_", "-")
    if text in ("en", "eng", "english"):
        return "en"
    if text in ("cn", "zh", "zh-cn", "zh-hans", "chinese"):
        return "cn"
    if text.startswith("en"):
        return "en"
    if text.startswith("zh") or text.startswith("cn"):
        return "cn"
    return lang_for_country(country)


_COUNTRY_SYNONYM = {
    "CHINA": "CN",
    "ZH": "CN",
    "PRC": "CN",
    "USA": "US",
    "UNITEDSTATES": "US",
    "UK": "GB",
    "ENGLAND": "GB",
    "OTHERS": "OTHER",
    "ROW": "OTHER",
    "GLOBAL": "OTHER",
}


def normalize_country_code(raw) -> str | None:
    """对齐设备库 country_code：ISO 3166-1 alpha-2 大写，或 OTHER。"""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    text = text.replace("_", "-")
    if "-" in text:
        text = text.split("-")[-1]
    text = text.upper()
    text = _COUNTRY_SYNONYM.get(text, text)
    return text


def _country_from_keys(d: dict) -> str | None:
    for key in ("country_code", "countryCode", "country"):
        if d.get(key) not in (None, ""):
            return normalize_country_code(d.get(key))
    return None


def country_from_json_text(text: str) -> str | None:
    """前端注入：某条 messages text 整段是 {\"country_code\":\"US\"}。"""
    raw = (text or "").strip()
    if len(raw) > 256 or not raw.startswith("{"):
        return None
    if "country_code" not in raw and "countryCode" not in raw and '"country"' not in raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return _country_from_keys(data) if isinstance(data, dict) else None


def _iter_message_texts(obj, _depth: int = 0):
    if _depth > 8 or obj is None:
        return
    if isinstance(obj, str):
        yield obj
        return
    if isinstance(obj, list):
        for item in obj:
            yield from _iter_message_texts(item, _depth + 1)
        return
    if not isinstance(obj, dict):
        return
    text = obj.get("text")
    if isinstance(text, str):
        yield text
    content = obj.get("content")
    if isinstance(content, str):
        yield content
    elif isinstance(content, list):
        yield from _iter_message_texts(content, _depth + 1)
    for key in ("messages", "input"):
        inner = obj.get(key)
        if inner is not None:
            yield from _iter_message_texts(inner, _depth + 1)


def extract_country_code(obj) -> str | None:
    """从会话/脚本入参取国区。

    认：顶层 / metadata / input.metadata 的 country_code；
    以及 messages 里整段 JSON text（中台过渡：把国区塞进 messages）。
    多条时取最后一条。
    """
    if isinstance(obj, list):
        found = None
        for text in _iter_message_texts(obj):
            hit = country_from_json_text(text)
            if hit:
                found = hit
        return found
    if not isinstance(obj, dict):
        return None

    found = _country_from_keys(obj)
    if found:
        return found
    meta = obj.get("metadata")
    if isinstance(meta, dict):
        found = _country_from_keys(meta)
        if found:
            return found
    inner = obj.get("input")
    if isinstance(inner, dict):
        found = _country_from_keys(inner)
        if found:
            return found
        nested = inner.get("metadata")
        if isinstance(nested, dict):
            found = _country_from_keys(nested)
            if found:
                return found

    from_messages = None
    for text in _iter_message_texts(obj):
        hit = country_from_json_text(text)
        if hit:
            from_messages = hit
    return from_messages


def timeout_sec() -> float:
    try:
        return float(os.environ.get("RESOURCE_LIB_TIMEOUT") or 8)
    except ValueError:
        return 8.0


def post(path: str, body: dict, *, country: str | None = None, lang: str | None = None) -> Any:
    if not configured():
        raise ResourceLibError("RESOURCE_LIB_TOKEN missing")
    url = f"{base_url()}{path if path.startswith('/') else '/' + path}"
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "lang": resolve_catalog_lang(lang, country),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec()) as resp:
            raw = resp.read().decode("utf-8")
            http_status = getattr(resp, "status", 200)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            raise ResourceLibError(f"HTTP {exc.code}", http_status=exc.code) from exc
        raise ResourceLibError(
            err.get("message") or str(err.get("code") or exc.code),
            code=err.get("code"),
            http_status=exc.code,
        ) from exc
    except urllib.error.URLError as exc:
        raise ResourceLibError(f"network: {exc.reason}") from exc
    data = json.loads(raw) if raw else {}
    code = data.get("code")
    if code not in (0, "0", None):
        raise ResourceLibError(
            data.get("message") or str(code),
            code=code,
            http_status=http_status,
        )
    return data.get("data")


def list_categories(resource_type: str = "device", country: str | None = None, lang: str | None = None) -> list:
    data = post(
        "/api/v1/resources/category",
        {"resource_type": resource_type},
        country=country,
        lang=lang,
    )
    return data if isinstance(data, list) else []


def list_templates(
    resource_type: str = "device",
    category: str | None = None,
    name: str | None = None,
    models: list[str] | None = None,
    country: str | None = None,
    lang: str | None = None,
    page: int = 1,
    page_size: int = 30,
) -> dict:
    body: dict[str, Any] = {
        "resource_type": resource_type,
        "page": page,
        "page_size": min(int(page_size), 100),
    }
    if category:
        body["category"] = str(category)
    if name:
        body["name"] = name
    if models:
        body["models"] = [str(m) for m in models[:100]]
    cc = country if country is not None else country_code()
    if cc:
        body["country_code"] = cc
    data = post("/api/v1/resources/templates", body, country=cc or None, lang=lang)
    return data if isinstance(data, dict) else {}


def device_endpoints(model: str) -> list | None:
    """完整 endpoints 树；型号不存在返回 None。"""
    try:
        data = post("/api/v1/resources/device-endpoints", {"model": str(model)})
    except ResourceLibError as exc:
        if exc.code == "DEVICE_TEMPLATE_NOT_FOUND" or exc.http_status == 404:
            return None
        raise
    if not isinstance(data, dict):
        return None
    return list(data.get("endpoints") or [])


# 远程常省略 value。表出自 Aqara 设备库完整模板（同 trait+key 无冲突）。
_EVENT_VALUE_BY_TRAIT_KEY = {
    "ButtonEvent": {
        "SinglePress": "0", "Single Press": "0", "DoublePress": "1",
        "Double Press": "1", "LongPress": "2", "Long Press": "2",
        "LongPressRelease": "3",
    },
    "CubeEvent": {
        "Flip90": "0", "Flip180": "1", "Push": "2", "TapTwice": "3",
        "Shake": "4", "Swing": "5", "Rotate": "6",
        "TriggeredAfter1Minute": "7", "PickUpHold": "10",
    },
    "RotationEvent": {"Rotate": "0", "HoldToRotate": "1"},
    "VibrationEvent": {
        "ThreeKnocks": "0", "Move": "1", "Vibrate": "2", "Tilt": "3",
        "FreeFall": "4",
    },
    "ManualPullEvent": {"ManualOpen": "1", "ManualClose": "2", "ManualStop": "3"},
}


def _enum_pairs(param: dict, tcode: str = "") -> list[dict]:
    """key=展示名，value=Studio 下拉真正吃的值（通常是 '0'/'1'）。"""
    known = _EVENT_VALUE_BY_TRAIT_KEY.get(str(tcode) or "") or {}
    pairs: list[dict] = []
    for item in param.get("supportedValues") or []:
        if isinstance(item, dict):
            key, val = item.get("key"), item.get("value")
            if key is None and val is None:
                continue
            key_s = str(key if key is not None else val)
            val_s = "" if val is None else str(val)
            if val_s == "":
                val_s = str(known.get(key_s) or "")
            pairs.append({"key": key_s, "value": val_s})
        elif item is not None:
            pairs.append({"key": str(item), "value": str(item)})
        if len(pairs) >= 24:
            break
    return pairs


def _skip_trait(tcode: str, fcode: str) -> bool:
    if fcode in _SKIP_FUNCTIONS:
        return True
    if tcode.startswith("StartUp"):
        return True
    if tcode.endswith("Setting"):
        return True
    if tcode.endswith("SensorType"):
        return True
    return False


def _keep_trait(tcode: str, param: dict, roles: list) -> bool:
    """可写、可订阅、或标了 starter/condition/action → 留给编排。不按品类名单。"""
    if any(r in roles for r in ("starter", "condition", "action")):
        return True
    if param.get("writable") or param.get("subscribable"):
        return True
    if tcode.endswith("Event"):
        return True
    return False


def extract_care_traits(endpoints: list) -> dict:
    """按设备库 endpoints 抽出可联动 trait。新型号只要库里有能力就会出现。"""
    per_ep = []
    for ep in endpoints or []:
        eid = ep.get("endpointId")
        found: dict = {}
        for fn in ep.get("functions") or []:
            fcode = fn.get("functionCode")
            for tr in fn.get("traits") or []:
                tcode = tr.get("traitCode")
                if not tcode or _skip_trait(str(tcode), str(fcode or "")):
                    continue
                param = tr.get("parameter") or {}
                roles = list(tr.get("automationRoles") or [])
                if not _keep_trait(str(tcode), param, roles):
                    continue
                writable = bool(param.get("writable"))
                entry = {
                    "functionCode": fcode,
                    "endpointId": eid,
                    "writable": writable,
                    "subscribable": bool(param.get("subscribable")),
                    "roles": roles,
                    "canonicalCase": tcode,
                }
                if param.get("type"):
                    entry["valueType"] = param.get("type")
                pairs = _enum_pairs(param, str(tcode))
                if not pairs and str(param.get("type") or "").lower() == "enum":
                    tags = ((tr.get("spec") or {}).get("tags")) or []
                    pairs = [
                        {"key": str(t), "value": str(t)}
                        for t in tags
                        if str(t).isdigit()
                    ][:24]
                if pairs:
                    entry["enums"] = pairs
                    write_vals = [p["value"] for p in pairs if p.get("value") != ""]
                    if write_vals:
                        entry["values"] = write_vals
                for field in ("min", "max", "step"):
                    if param.get(field) is not None:
                        entry[field] = param[field]
                if param.get("unit"):
                    entry["unit"] = param["unit"]
                if tcode not in found:
                    found[tcode] = entry
        per_ep.append(found)
    per_ep.sort(
        key=lambda m: (
            0
            if "OnOff" in m or "Occupancy" in m or any(k.endswith("Event") for k in m)
            else 1
        )
    )
    out: dict = {}
    for mapping in per_ep:
        for key, val in mapping.items():
            if key not in out:
                out[key] = val
    return out
