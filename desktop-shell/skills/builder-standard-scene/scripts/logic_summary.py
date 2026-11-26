#!/usr/bin/env python3
"""Build plain-language logic_for_user for standard scenes (human reply text)."""
from __future__ import annotations

from typing import Any


def _is_true(val: Any) -> bool | None:
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("true", "1", "on"):
        return True
    if s in ("false", "0", "off"):
        return False
    return None


def summarize_actions(actions: list[Any] | None) -> list[str]:
    """Turn concrete actions into short Chinese bullets (no Spec jargon)."""
    offs = ons = levels = cts = curtains = displays = cmds = other = 0
    level_vals: list[int] = []
    ct_vals: list[int] = []
    curtain_vals: list[int] = []

    for a in actions or []:
        if not isinstance(a, dict):
            continue
        atype = str(a.get("type") or "")
        fcode = str(a.get("functionCode") or "")
        tcode = str(a.get("traitCode") or a.get("commandCode") or "")
        val = a.get("value")

        if atype == "device.batch":
            items = a.get("items") or []
            pe = sum(
                1
                for it in items
                if isinstance(it, dict)
                and (
                    it.get("traitCode") == "PreviewEffect"
                    or it.get("commandCode") == "PreviewEffect"
                )
            )
            if pe:
                cmds += pe
            else:
                other += 1
            continue
        if atype == "delay":
            other += 1
            continue
        if atype == "device.command.call" or a.get("commandCode"):
            cmds += 1
            continue
        if tcode == "DisplayImage" or fcode == "ImageMediaManagement":
            displays += 1
            continue
        if tcode == "OnOff":
            flag = _is_true(val)
            if flag is False:
                offs += 1
            elif flag is True:
                ons += 1
            else:
                other += 1
            continue
        if tcode == "CurrentLevel":
            levels += 1
            try:
                level_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        if tcode == "ColorTemperature":
            cts += 1
            try:
                ct_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        if tcode in ("TargetPositionPercentage", "TargetRotationAngle") or fcode == "WindowCovering":
            curtains += 1
            try:
                curtain_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        other += 1

    lines: list[str] = []
    if offs:
        lines.append(f"关掉约 {offs} 路灯或开关")
    if ons:
        lines.append(f"打开约 {ons} 路灯或设备")
    if levels:
        if level_vals:
            lo, hi = min(level_vals), max(level_vals)
            if lo == hi:
                lines.append(f"把约 {levels} 盏灯调到亮度 {lo}%")
            else:
                lines.append(f"把约 {levels} 盏灯调到亮度 {lo}%～{hi}%")
        else:
            lines.append(f"调节约 {levels} 盏灯的亮度")
    if cts:
        # Studio ColorTemperature 已是开尔文；旧产物若仍是 mired（≤1000）再换算
        if ct_vals:
            kelvins = []
            for v in ct_vals:
                if v <= 0:
                    continue
                kelvins.append(max(1, int(round(1_000_000 / v))) if v <= 1000 else int(v))
            if kelvins:
                lo, hi = min(kelvins), max(kelvins)
                tone = "偏暖" if hi <= 3500 else ("偏冷白" if lo >= 4500 else "中性白")
                if lo == hi:
                    lines.append(f"色温大约 {lo}K（{tone}）")
                else:
                    lines.append(f"色温大约 {lo}K～{hi}K（{tone}）")
            else:
                lines.append(f"调节约 {cts} 盏灯的色温")
        else:
            lines.append(f"调节约 {cts} 盏灯的色温")
    if curtains:
        if curtain_vals and all(v <= 5 for v in curtain_vals):
            lines.append(f"关上约 {curtains} 道窗帘")
        elif curtain_vals and all(v >= 95 for v in curtain_vals):
            lines.append(f"打开约 {curtains} 道窗帘")
        elif curtain_vals:
            lines.append(f"把约 {curtains} 道窗帘调到约 {int(sum(curtain_vals)/len(curtain_vals))}% 开合")
        else:
            lines.append(f"调节约 {curtains} 道窗帘")
    if displays:
        lines.append(f"给灯膜换上情景画面（约 {displays} 路）")
    if cmds:
        lines.append(f"执行约 {cmds} 条设备特效/播放类指令")
    if other and not lines:
        lines.append("按模板调整相关设备状态")
    return lines


def summarize_actions_en(actions: list[Any] | None) -> list[str]:
    """English counterpart of summarize_actions."""
    offs = ons = levels = cts = curtains = displays = cmds = other = 0
    level_vals: list[int] = []
    ct_vals: list[int] = []
    curtain_vals: list[int] = []

    for a in actions or []:
        if not isinstance(a, dict):
            continue
        atype = str(a.get("type") or "")
        fcode = str(a.get("functionCode") or "")
        tcode = str(a.get("traitCode") or a.get("commandCode") or "")
        val = a.get("value")
        if atype == "device.batch":
            other += 1
            continue
        if atype == "delay":
            other += 1
            continue
        if atype == "device.command.call" or a.get("commandCode"):
            cmds += 1
            continue
        if tcode == "DisplayImage" or fcode == "ImageMediaManagement":
            displays += 1
            continue
        if tcode == "OnOff":
            flag = _is_true(val)
            if flag is False:
                offs += 1
            elif flag is True:
                ons += 1
            else:
                other += 1
            continue
        if tcode == "CurrentLevel":
            levels += 1
            try:
                level_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        if tcode == "ColorTemperature":
            cts += 1
            try:
                ct_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        if tcode in ("TargetPositionPercentage", "TargetRotationAngle") or fcode == "WindowCovering":
            curtains += 1
            try:
                curtain_vals.append(int(float(str(val))))
            except (TypeError, ValueError):
                pass
            continue
        other += 1

    lines: list[str] = []
    if offs:
        lines.append(f"turn off about {offs} lights or switches")
    if ons:
        lines.append(f"turn on about {ons} lights or devices")
    if levels:
        if level_vals:
            lo, hi = min(level_vals), max(level_vals)
            if lo == hi:
                lines.append(f"set about {levels} lights to {lo}% brightness")
            else:
                lines.append(f"set about {levels} lights to {lo}%–{hi}% brightness")
        else:
            lines.append(f"adjust brightness on about {levels} lights")
    if cts:
        if ct_vals:
            kelvins = []
            for v in ct_vals:
                if v <= 0:
                    continue
                kelvins.append(max(1, int(round(1_000_000 / v))) if v <= 1000 else int(v))
            if kelvins:
                lo, hi = min(kelvins), max(kelvins)
                tone = "warm" if hi <= 3500 else ("cool white" if lo >= 4500 else "neutral white")
                if lo == hi:
                    lines.append(f"set color temperature to about {lo}K ({tone})")
                else:
                    lines.append(f"set color temperature to about {lo}K–{hi}K ({tone})")
            else:
                lines.append(f"adjust color temperature on about {cts} lights")
        else:
            lines.append(f"adjust color temperature on about {cts} lights")
    if curtains:
        if curtain_vals and all(v <= 5 for v in curtain_vals):
            lines.append(f"close about {curtains} curtains")
        elif curtain_vals and all(v >= 95 for v in curtain_vals):
            lines.append(f"open about {curtains} curtains")
        elif curtain_vals:
            lines.append(
                f"set about {curtains} curtains to about "
                f"{int(sum(curtain_vals) / len(curtain_vals))}% open"
            )
        else:
            lines.append(f"adjust about {curtains} curtains")
    if displays:
        lines.append(f"update about {displays} light-panel images")
    if cmds:
        lines.append(f"run about {cmds} effect or media commands")
    if other and not lines:
        lines.append("adjust the controllable devices for this scene")
    return lines


def build_logic_for_user(
    *,
    label: str,
    need: str = "",
    trigger_hint: str = "",
    actions: list[Any] | None = None,
    status: str = "",
    lighting_profile: str | None = None,
    mutex_peers: list[str] | None = None,
    lang: str = "cn",
) -> str:
    """One short plain-language block for the agent to tell the user."""
    if str(lang or "").lower().startswith("en"):
        name = (label or "this scene").strip()
        parts: list[str] = [f"When you run “{name}”: "]
        bullets = summarize_actions_en(actions)
        if bullets:
            parts.append("; ".join(bullets) + ". ")
        else:
            parts.append("it adjusts the controllable devices in this home. ")
        peers = [p for p in (mutex_peers or []) if p]
        if peers:
            shown = ", ".join(peers[:6])
            more = ", and more" if len(peers) > 6 else ""
            parts.append(f"It is mutually exclusive with {shown}{more}. ")
        parts.append("Tap the scene once to run it.")
        if status == "DEGRADED":
            parts.append(" This is a simplified version based on the devices you have.")
        return "".join(parts)

    name = (label or "该场景").strip()
    parts = [f"点「{name}」时，家里大概会这样："]

    intent = (need or "").strip()
    if intent:
        if len(intent) > 80:
            intent = intent[:78] + "…"
        parts.append(f"设计意图：{intent}")

    bullets = summarize_actions(actions)
    if bullets:
        parts.append("这次实际编排：" + "；".join(bullets) + "。")
    elif lighting_profile:
        parts.append(f"这次按情景照明库「{lighting_profile}」匹配灯光效果。")
    else:
        parts.append("这次按当前房子里能控的设备做了简化编排。")

    peers = [p for p in (mutex_peers or []) if p]
    if peers:
        shown = "、".join(peers[:6])
        more = "等" if len(peers) > 6 else ""
        parts.append(f"互斥提醒：它和「{shown}{more}」不适合同时开（有我没他）。")

    th = (trigger_hint or "").strip()
    if th:
        tip = th if th.endswith(("。", "！", "？", ".", "!", "?")) else th + "。"
        parts.append(f"怎么用：{tip}")
    else:
        parts.append("怎么用：在场景里点一下就会按上面做一遍。")

    if status == "DEGRADED":
        parts.append("说明：受现有设备限制，这是能落地的简化版，不是完整服务商模板。")

    return "".join(parts)
