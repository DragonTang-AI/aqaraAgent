#!/usr/bin/env python3
"""Regenerate assets/capability_allowlist.json from device templates (run from repo root)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
TPL = REPO / "skills" / "builder-automation-generate" / "assets" / "device_templates"
OUT = ROOT / "assets" / "capability_allowlist.json"

CURATED_WRITES = [
    ("ImageMediaManagement", "DisplayImage"),
    ("OnOff", "OnOff"),
    ("LevelControl", "CurrentLevel"),
    ("ColorControl", "ColorTemperature"),
    ("ColorControl", "ColorXY"),
    ("ColorControl", "ColorRGB"),
    ("Output", "OnOff"),
    ("WindowCovering", "TargetPositionPercentage"),
]
CURATED_COMMANDS = [
    ("Lighting", "PreviewEffect"),
    ("MediaPlayback", "SearchAndPlay"),
]
ALIASES = {
    "WindowCovering.CurrentPosition": ["WindowCovering", "TargetPositionPercentage"],
    "WindowCovering.Position": ["WindowCovering", "TargetPositionPercentage"],
    "WindowCovering.CurrentPositionPercentage": ["WindowCovering", "TargetPositionPercentage"],
    "ColorControl.Hue": None,
    "ColorControl.Saturation": None,
    "LevelControl.Brightness": ["LevelControl", "CurrentLevel"],
    "Brightness.CurrentLevel": ["LevelControl", "CurrentLevel"],
    "OnOff.OnOff": ["Output", "OnOff"],
    "Switch.OnOff": ["Output", "OnOff"],
}


def main() -> int:
    if not TPL.is_dir():
        print(f"FAIL templates missing: {TPL}", file=sys.stderr)
        return 1
    writes: set[tuple[str, str]] = set()
    commands: set[tuple[str, str]] = set()
    for p in sorted(TPL.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue

        def walk(x, fn=None):
            if isinstance(x, dict):
                fcode = x.get("functionCode") or fn
                if "traitCode" in x and fcode:
                    param = x.get("parameter") or {}
                    if param.get("writable") is True:
                        writes.add((str(fcode), str(x["traitCode"])))
                if "commandCode" in x and fcode:
                    commands.add((str(fcode), str(x["commandCode"])))
                for v in x.values():
                    walk(v, fcode or fn)
            elif isinstance(x, list):
                for i in x:
                    walk(i, fn)

        walk(d)
    writes.update(CURATED_WRITES)
    commands.update(CURATED_COMMANDS)
    out = {
        "version": 1,
        "source": "builder-automation-generate/assets/device_templates + curated lighting/create_scene",
        "writable_traits": sorted([[a, b] for a, b in writes]),
        "commands": sorted([[a, b] for a, b in commands]),
        "aliases": ALIASES,
        "forbidden_traits": ["Hue", "Saturation", "CurrentPosition"],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} writes={len(writes)} commands={len(commands)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
