# 灯光舞动编排（延时 + 多步）

没有内置呼吸/彩虹时，用 **写点 + `delay` + 再写点** 拼出动态。  
生成时只抄本轮 probe 里有的点。禁止 Hue / Saturation / OnTransitionTime / ColorMode。色温只写 **Mired**。

## 能力梯子（有哪档用哪档，缺了就降）

| 档 | probe 有 | 怎么编 |
|----|----------|--------|
| A | `LightingDynamicSceneMode` | 开灯后写模式 value（抄 enums：Breath=`"0"` 彩虹=`"1"` 流水=`"2"` 闪烁=`"3"`…）。禁写 key 名 |
| B | `ColorXY` 或 `ColorRGB` | 开灯 → 4～6 步换色，步间 `delay` `1sec`～`2sec` |
| C | 仅 `ColorTemperature` + `CurrentLevel` | 冷暖或亮暗呼吸 |
| D | 仅 `CurrentLevel` / `OnOff` | 亮暗闪烁；多灯做追逐 |

一盏走 A/B 循环；**两盏及以上**优先追逐或对舞（不同灯不同步）。  
有魔方/无线开关 → 事件触发；否则一键 `manual`。  
动作总数 **≤24**。禁止只写一次 `OnOff=true` 就叫灯光秀。

## 色板（照抄整数，不要自己换算）

**ColorRGB**（0xRRGGBB）：

| 红 | 橙 | 黄 | 绿 | 青 | 蓝 | 紫 |
|----|----|----|----|----|----|----|
| 16711680 | 16744192 | 16776960 | 65280 | 65535 | 255 | 8388736 |

**ColorXY** 打包 `(x×65535<<16)|(y×65535)`：

| 红 | 绿 | 蓝 | 紫 |
|----|----|----|----|
| 2748732539 | 1288477081 | 644222812 | 1374365286 |

**色温 Mired**（禁止 2700/3500/4000）：暖 `370` · 中 `250` · 冷 `153`。

亮度 `CurrentLevel` 用 1–100。

## 模版（金样）

| 效果 | 金样 | 最少能力 |
|------|------|----------|
| 彩虹循环 | `assets/examples/light-show-rainbow.automation-instance.json` | ColorXY 或 ColorRGB |
| 多灯追逐 | `assets/examples/light-show-chase.automation-instance.json` | 2+ 盏可写灯 |
| 亮度呼吸 | `assets/examples/light-show-breathe.automation-instance.json` | CurrentLevel |
| 节奏闪烁 | `assets/examples/light-show-flicker.automation-instance.json` | OnOff |
| 观影暖暗 | `assets/examples/light-show-cinema.automation-instance.json` | OnOff；有电平/色温再写 |
| 冷暖潮汐 | `assets/examples/light-show-warm-cool.automation-instance.json` | ColorTemperature |
| 内置动态 | `assets/examples/light-show-dynamic-mode.automation-instance.json` | LightingDynamicSceneMode |

形状：`{type:delay,for:"2sec"}` 单独一项，不要写在 write 上。  
`functionCode`/`traitCode`/`endpointIds` 以本轮 probe 为准，金样里的只是占位。
