# 场景 vs 自动化

本仓库无独立 scene schema。二者都写入同一 `automation-instance` pack。

| 类型 | 如何表达 | 何时用 |
|------|----------|--------|
| 自动化/联动 | `property.event` 或 `time.schedule` starter | 默认；人感、门磁、定时等 |
| 一键场景 | `manual` starter + 场景名 | 仅用户明确说「场景 / 一键 / 离家模式」等 |

`manual` 属扩展路径：默认包可以同时含若干 event 自动化 + 0～N 个 manual 场景。

对人摘要表用「类型」列区分：联动 / 场景。
