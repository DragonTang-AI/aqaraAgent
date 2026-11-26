# 金样与反例

## 跟随（默认）

- `assets/examples/stand.automation-instance.json` — scope + data.ref + condition + trait.write
- `assets/examples/study-room-motion-light-ac.automation-instance.json` — 人感开灯/空调与无人关闭

学习点：复用 scope 名、suppressFor、condition 内联 device.property 仅用于 **state** 检查。

## 禁止当作默认模板

- 知识库 `automation范式说明及范例/复杂示例.json`：无 scope、starter 内联 `device.property`，**不符合** v0 schema-first。仅作复杂能力历史参考，生成路径不要抄。

## 生成自检清单

- [ ] 每条 automation 有 name / starters / actions
- [ ] 事件 starter 的 source 为 data.ref
- [ ] scope 中 name 与 data.ref select.value 一致
- [ ] 未出现复杂示例式内联 event source
- [ ] deviceId 来自当前 graph
