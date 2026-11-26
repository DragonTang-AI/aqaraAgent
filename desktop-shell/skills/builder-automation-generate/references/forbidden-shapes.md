# 禁止输出形状（中台实测翻车反例）

详见同目录 [forbidden-output-shapes.md](forbidden-output-shapes.md)。本文件为 Skill 入口别名，内容以该文为准。

## 一句话红线

`payload` = `{ metadata, automations[, capability_gaps] }`  
禁止：`scenes` / `trigger` / `command` / `time.cron` / cron 表达式 / `device.control` / `actions` 内 `condition`/`if`/`then`/`else` / 错位 scope / `starter.data` / camelCase trait / 中文 scope.name / 口语 `setLight`。  
定时 → `time.schedule`+`at`（见 `schedule-light.automation-instance.json`）。人感有人/无人 → `automations[]` 拆两条（见 `motion-light`）。
