#!/usr/bin/env python3
"""English labels for standard-scene chips and delivered scene names."""
from __future__ import annotations

SCENE_LABEL_EN: dict[str, str] = {
    "回家": "Arriving home",
    "离家": "Leaving home",
    "会客": "Guests",
    "观影": "Movie",
    "灯光全开": "All on",
    "灯光全关": "All off",
    "冷光": "Cool",
    "暖光": "Warm",
    "亮度50%": "Brightness 50%",
    "亮度25%": "Brightness 25%",
    "离开": "Leave",
    "备餐": "Prep meal",
    "就餐": "Dining",
    "早安": "Good morning",
    "晚安": "Good night",
    "起夜": "Night light",
    "有人开灯无人关灯": "Lights with occupancy",
    "安防告警": "Security alert",
    "阅读": "Reading",
    "白天": "Day",
    "晚上": "Night",
    "浪漫晚餐": "Romantic dinner",
    "品鉴": "Tasting",
    "冥想": "Meditation",
    "Party欢聚": "Party",
    "客厅阅读": "Living-room reading",
    "回房": "Back to the room",
    "沐浴": "Bath",
    "洗漱": "Wash up",
    "如厕": "Restroom",
}

ROOM_LABEL_EN: dict[str, str] = {
    "全屋": "Whole home",
    "客厅": "Living room",
    "卧室": "Bedroom",
    "主卧": "Master bedroom",
    "次卧": "Second bedroom",
    "卫生间": "Bathroom",
    "浴室": "Bathroom",
    "庭院": "Courtyard",
    "玄关": "Entry",
    "入户": "Entry",
    "门厅": "Foyer",
    "餐厅": "Dining room",
    "厨房": "Kitchen",
    "走廊": "Hallway",
    "过道": "Hallway",
    "阳台": "Balcony",
    "书房": "Study",
    "阅读区": "Reading zone",
    "康养区": "Wellness zone",
}

# English free-text → Chinese catalog label (for resolve aliases)
SCENE_EN_ALIASES: dict[str, str] = {
    "arriving home": "回家",
    "home": "回家",
    "leaving home": "离家",
    "away": "离家",
    "leave home": "离家",
    "guests": "会客",
    "guest": "会客",
    "movie": "观影",
    "movie night": "观影",
    "all on": "灯光全开",
    "all off": "灯光全关",
    "cool": "冷光",
    "warm": "暖光",
    "day": "白天",
    "night": "晚上",
    "bath": "沐浴",
    "bathing": "沐浴",
    "wash up": "洗漱",
    "restroom": "如厕",
    "good morning": "早安",
    "good night": "晚安",
    "night light": "起夜",
    "reading": "阅读",
    "party": "Party欢聚",
    "romantic dinner": "浪漫晚餐",
    "meditation": "冥想",
    "tasting": "品鉴",
    "back to the room": "回房",
    "back home": "回房",
    "leave": "离开",
}


def room_en(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return raw
    if raw in ROOM_LABEL_EN:
        return ROOM_LABEL_EN[raw]
    for zh, en in ROOM_LABEL_EN.items():
        if zh in raw:
            return raw.replace(zh, en)
    return raw


def scene_label_en(label: str) -> str:
    raw = (label or "").strip()
    return SCENE_LABEL_EN.get(raw, raw)


def scene_display_name(space: str, label: str) -> str:
    """Studio-facing English scene title, e.g. Living room · Movie."""
    sp = room_en(space)
    lb = scene_label_en(label)
    if not sp:
        return lb
    if lb in ("Leave", "Lights with occupancy"):
        return f"{sp} · {lb}"
    if sp == "Whole home" and lb in ("Day", "Night", "Leaving home", "Arriving home"):
        return f"{sp} · {lb}"
    return f"{sp} · {lb}"
